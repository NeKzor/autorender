/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The server is mostly responsible for:
 *    - Handling incoming websocket messages from the Discord bot
 *    - Handling incoming websocket messages from clients
 *    - Serving the web platform (`app/`)
 */

import 'dotenv/load.ts';
import * as uuid from 'uuid/mod.ts';
import { Application, Context, CookiesSetDeleteOptions, Middleware, Router, Status, STATUS_TEXT } from 'oak/mod.ts';
import { ResponseBody, ResponseBodyFunction } from 'oak/response.ts';
import Session from 'oak_sessions/src/Session.ts';
import CookieStore from 'oak_sessions/src/stores/CookieStore.ts';
import { oakCors } from 'cors/mod.ts';
import { logger } from './logger.ts';
import { index } from './app/index.tsx';
import { BackblazeClient } from './b2.ts';
import {
  AccessPermission,
  AccessToken,
  AuditSource,
  AuditType,
  DiscordUser,
  FixedDemoStatus,
  Game,
  MapModel,
  MapType,
  PendingStatus,
  RenderQuality,
  User,
  UserPermissions,
  Video,
} from '~/shared/models.ts';
import * as bcrypt from 'bcrypt/mod.ts';
import * as _bcrypt_worker from 'bcrypt/src/worker.ts';
import { Buffer } from 'io/buffer.ts';
import { AppState as ReactAppState } from './app/AppState.ts';
import { db } from './db.ts';
import { createStaticRouter } from 'react-router-dom/server';
import { createFetchRequest, RequestContext, routeHandler, routes } from './app/Routes.ts';
import { getDemoInfo, supportedGameDirs, supportedGameMods } from './demo.ts';
import { basename } from 'path/mod.ts';
import {
  generateShareId,
  getDemoFilePath,
  getFixedDemoFilePath,
  getStorageFilePath,
  getVideoDownloadFilename,
  getVideoFilePath,
  getVideoPreviewPath,
  getVideoThumbnailPath,
  getVideoThumbnailSmallPath,
  Storage,
  validateShareId,
} from './utils.ts';
import { rateLimits } from './rate_limits.ts';

const SERVER_HOST = Deno.env.get('SERVER_HOST')!;
const SERVER_PORT = parseInt(Deno.env.get('SERVER_PORT')!, 10);
const SERVER_SSL_CERT = Deno.env.get('SERVER_SSL_CERT')!;
const SERVER_SSL_KEY = Deno.env.get('SERVER_SSL_KEY')!;
// NOTE: Clients should only handle one video per request.
const MAX_VIDEOS_PER_REQUEST = 1;
const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;
const AUTORENDER_V1 = 'autorender-v1';
const DISCORD_AUTHORIZE_LINK = (() => {
  const params = new URLSearchParams();
  params.set('client_id', Deno.env.get('DISCORD_CLIENT_ID')!);
  params.set(
    'redirect_uri',
    `${AUTORENDER_PUBLIC_URI}/login/discord/authorize`,
  );
  params.set('response_type', 'code');
  params.set('scope', 'identify');
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
})();
const SERVER_DOMAIN = new URL(AUTORENDER_PUBLIC_URI).host;
const AUTORENDER_BOT_TOKEN_HASH = await bcrypt.hash(
  Deno.env.get('AUTORENDER_BOT_TOKEN')!,
);
const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;
const AUTORENDER_MAX_VIDEO_FILE_SIZE = 150_000_000;
const DISCORD_BOARD_INTEGRATION_WEBHOOK_URL = Deno.env.get('DISCORD_BOARD_INTEGRATION_WEBHOOK_URL')!;
const B2_ENABLED = Deno.env.get('B2_ENABLED')!.toLowerCase() === 'true';
const B2_BUCKET_ID = Deno.env.get('B2_BUCKET_ID')!;

const cookieOptions: CookiesSetDeleteOptions = {
  expires: new Date(Date.now() + 86_400_000 * 30),
  sameSite: 'lax',
  secure: true,
  ignoreInsecure: true,
};

const store = new CookieStore(Deno.env.get('COOKIE_SECRET_KEY')!, {
  cookieSetDeleteOptions: cookieOptions,
});
const useSession = Session.initMiddleware(store, {
  cookieSetOptions: cookieOptions,
});

const _requiresAuth: Middleware<AppState> = (ctx) => {
  if (!ctx.state.session.get('user')) {
    return Err(ctx, Status.Unauthorized);
  }
};

let discordBot: WebSocket | null = null;

const sendErrorToBot = (error: {
  status: number;
  message: string;
  share_id: string;
  requested_by_id: string;
  requested_in_guild_id: string;
  requested_in_channel_id: string;
}) => {
  if (discordBot && discordBot.readyState === WebSocket.OPEN) {
    discordBot.send(JSON.stringify({ type: 'error', data: error }));
  } else {
    logger.error('Bot not connected. Failed to send error status.', error);
  }
};

const b2 = new BackblazeClient({ userAgent: Deno.env.get('USER_AGENT')! });

if (B2_ENABLED) {
  b2.authorizeAccount({
    accountId: Deno.env.get('B2_KEY_ID')!,
    applicationKey: Deno.env.get('B2_APP_KEY')!,
  }).then(() => {
    logger.info('Connected to b2');
  });
} else {
  logger.info('⚠️  Connection to b2 disabled. Using directory to store videos.');
}

await logger.initFileLogger('/logs/server', {
  rotate: true,
  maxBytes: 100_000_000,
  maxBackupCount: 7,
});

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  console.error(ev.reason);
});

const hasPermission = (ctx: Context, permission: UserPermissions) => {
  return ctx.state.session.get('user').permissions & permission;
};

const Ok = (
  ctx: Context,
  body?: ResponseBody | ResponseBodyFunction,
  type?: string,
) => {
  ctx.response.status = Status.OK;
  ctx.response.type = type ?? 'application/json';
  ctx.response.body = body ?? {};
};

const Err = (ctx: Context, status?: Status, message?: string) => {
  ctx.response.status = status ?? Status.InternalServerError;
  ctx.response.type = 'application/json';
  ctx.response.body = {
    status: ctx.response.status,
    message: message ??
      (status ? STATUS_TEXT[status] : STATUS_TEXT[Status.InternalServerError]),
  };
};

const apiV1 = new Router<AppState>();

apiV1
  // Incoming render request from the bot containing the demo file.
  .put('/videos/render', useSession, async (ctx) => {
    const authUser = ctx.state.session.get('user');

    if (authUser) {
      if (!hasPermission(ctx, UserPermissions.CreateVideos)) {
        return Err(ctx, Status.Unauthorized);
      }
    } else {
      const [authType, authToken] = (
        ctx.request.headers.get('Authorization') ?? ''
      ).split(' ');

      if (authType !== 'Bearer' || authToken === undefined) {
        return Err(ctx, Status.BadRequest);
      }

      const decodedAuthToken = decodeURIComponent(authToken);

      if (
        !(await bcrypt.compare(
          decodedAuthToken,
          AUTORENDER_BOT_TOKEN_HASH,
        ))
      ) {
        return Err(ctx, Status.Unauthorized);
      }
    }

    if (!ctx.request.hasBody) {
      return Err(ctx, Status.UnsupportedMediaType);
    }

    const body = ctx.request.body({ type: 'form-data' });
    const data = await body.value.read({
      customContentTypes: {
        'application/octet-stream': 'dem',
      },
      outPath: Storage.Demos,
      maxFileSize: AUTORENDER_MAX_DEMO_FILE_SIZE,
    });

    // TODO: File cleanup on error

    logger.info('Received', data.files?.length ?? 0, 'demo(s)');

    const file = data.files?.at(0);
    if (!file?.filename) {
      return Err(ctx, Status.BadRequest);
    }

    const videoId = uuid.v1.generate() as string;
    const shareId = generateShareId();

    const filePath = getDemoFilePath(videoId);
    await Deno.rename(file.filename, filePath);

    // TODO:
    //    * Figure out if UGC changes when the revision of a workshop item updates.

    const demoInfo = await getDemoInfo({ filePath });

    if (demoInfo === null || typeof demoInfo === 'string') {
      return Err(ctx, Status.BadRequest, demoInfo ?? undefined);
    }

    if (demoInfo.isWorkshopMap && !demoInfo.workshopInfo?.fileUrl) {
      logger.error(`Failed to resolve workshop map`);
      return Err(ctx, Status.InternalServerError);
    }

    const [game] = await db.query<Pick<Game, 'game_id'>>(
      `select game_id
         from games
        where game_mod = ?`,
      [
        demoInfo.gameDir,
      ],
    );

    let [map] = await db.query<Pick<MapModel, 'map_id' | 'auto_fullbright'>>(
      `select map_id
            , auto_fullbright
         from maps
        where game_id = ?
          and name = ?`,
      [
        game!.game_id,
        demoInfo.fullMapName,
      ],
    );

    if (!map) {
      await db.execute(
        `insert into maps (
            game_id
          , name
          , alias
          , type
          , workshop_file_id
          , creator_steam_id
        ) values (
            ?
          , ?
          , ?
          , ?
          , ?
          , ?
        )`,
        [
          game!.game_id,
          demoInfo.fullMapName,
          demoInfo.workshopInfo?.title ?? null,
          demoInfo.workshopInfo
            ? demoInfo.workshopInfo.isSinglePlayer ? MapType.WorkshopSinglePlayer : MapType.WorkshopCooperative
            : null,
          demoInfo.workshopInfo?.publishedFileId ?? null,
          demoInfo.workshopInfo?.creator ?? null,
        ],
      );

      const [newMap] = await db.query<Pick<MapModel, 'map_id' | 'auto_fullbright'>>(
        `select map_id
              , auto_fullbright
           from maps
          where game_id = ?
            and name = ?`,
        [
          game!.game_id,
          demoInfo.fullMapName,
        ],
      );

      map = newMap!;
    }

    const title = data.fields.title ?? 'untitled video';
    const comment = data.fields.comment ?? null;
    const requestedByName = authUser?.username ?? data.fields.requested_by_name;
    const requestedById = authUser?.discord_id ?? data.fields.requested_by_id;
    const requestedInGuildId = data.fields.requested_in_guild_id ?? null;
    const requestedInGuildName = data.fields.requested_in_guild_name ?? null;
    const requestedInChannelId = data.fields.requested_in_channel_id ?? null;
    const requestedInChannelName = data.fields.requested_in_channel_name ??
      null;
    const renderQuality = data.fields.quality ?? RenderQuality.HD_720p;
    const renderOptions = [
      ...(map.auto_fullbright && !data.fields.render_options?.includes('mat_fullbright')
        ? [
          `mat_ambient_light_r 0.05`,
          `mat_ambient_light_g 0.05`,
          `mat_ambient_light_b 0.05`,
        ]
        : []),
      data.fields.render_options ?? null,
    ];
    const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
    const demoMetadata = JSON.stringify(demoInfo.metadata);

    const fields = [
      videoId,
      game!.game_id,
      map.map_id,
      shareId,
      title,
      comment,
      requestedByName,
      requestedById,
      requestedInGuildId,
      requestedInGuildName,
      requestedInChannelId,
      requestedInChannelName,
      renderQuality,
      renderOptions.filter((command) => command !== null).join('\n'),
      file.originalName,
      demoInfo.workshopInfo?.fileUrl ?? null,
      demoInfo.fullMapName,
      demoInfo.size,
      demoInfo.mapCrc,
      demoInfo.gameDir,
      demoInfo.playbackTime,
      requiredDemoFix,
      demoInfo.tickrate,
      demoInfo.portalScore,
      demoInfo.timeScore,
      demoInfo.playerName,
      demoInfo.steamId,
      demoInfo.partnerPlayerName,
      demoInfo.partnerSteamId,
      demoInfo.isHost,
      demoMetadata,
      PendingStatus.RequiresRender,
    ];

    const { affectedRows } = await db.execute(
      `insert into videos (
            video_id
          , game_id
          , map_id
          , share_id
          , title
          , comment
          , requested_by_name
          , requested_by_id
          , requested_in_guild_id
          , requested_in_guild_name
          , requested_in_channel_id
          , requested_in_channel_name
          , render_quality
          , render_options
          , file_name
          , file_url
          , full_map_name
          , demo_size
          , demo_map_crc
          , demo_game_dir
          , demo_playback_time
          , demo_required_fix
          , demo_tickrate
          , demo_portal_score
          , demo_time_score
          , demo_player_name
          , demo_steam_id
          , demo_partner_player_name
          , demo_partner_steam_id
          , demo_is_host
          , demo_metadata
          , pending
        ) values (UUID_TO_BIN(?), ${new Array(fields.length - 1).fill('?').join(',')})`,
      fields,
    );

    try {
      logger.info(`Queued video ${videoId} (${shareId})`, { affectedRows });

      await db.execute(
        `insert into audit_logs (
              title
            , audit_type
            , source
            , source_user_id
          ) values (
              ?
            , ?
            , ?
            , ?
          )`,
        [
          `Created video ${videoId} for Discord user ${requestedByName}`,
          AuditType.Info,
          AuditSource.User,
          authUser?.user_id ?? null,
        ],
      );
    } catch (err) {
      logger.error(err);
    }

    const [video] = await db.query<Video>(
      `select *
            , BIN_TO_UUID(video_id) as video_id
         from videos
        where video_id = UUID_TO_BIN(?)`,
      [videoId],
    );

    Ok(ctx, video);
  })
  // Incoming upload requests from clients containing the video file.
  .post('/videos/upload', async (ctx) => {
    const [authType, authToken] = (
      ctx.request.headers.get('Authorization') ?? ''
    ).split(' ');

    if (authType !== 'Bearer' || authToken === undefined) {
      return Err(ctx, Status.BadRequest);
    }

    type TokenSelect = Pick<
      AccessToken,
      'access_token_id' | 'user_id' | 'token_name' | 'permissions'
    >;

    const [accessToken] = await db.query<TokenSelect>(
      `select access_token_id
            , user_id
            , token_name
            , permissions
         from access_tokens
        where token_key = ?`,
      [decodeURIComponent(authToken)],
    );

    if (!accessToken) {
      return Err(ctx, Status.Unauthorized);
    }

    if (!(accessToken.permissions & AccessPermission.WriteVideos)) {
      return Err(ctx, Status.Unauthorized, 'Write videos permission required.');
    }

    if (!ctx.request.hasBody) {
      return Err(ctx, Status.BadRequest, 'Missing request body.');
    }

    const body = ctx.request.body({ type: 'form-data' });
    const data = await body.value.read({
      customContentTypes: {
        'video/mp4': 'mp4',
      },
      outPath: Storage.Videos,
      maxFileSize: AUTORENDER_MAX_VIDEO_FILE_SIZE,
    });

    logger.info('Received', data.files?.length ?? 0, 'video(s)');

    const file = data.files?.at(0);
    if (!file?.filename) {
      return Err(ctx, Status.BadRequest);
    }

    const cmd = new Deno.Command('ffprobe', { args: [file.filename] });

    const { code } = await cmd.output();
    if (code !== 0) {
      logger.error(`Process ffprobe returned: ${code}`);
      return Err(ctx, Status.UnsupportedMediaType);
    }

    const { affectedRows } = await db.execute(
      `update videos
          set pending = ?
         where video_id = UUID_TO_BIN(?)
           and rendered_by_token = ?
           and pending = ?`,
      [
        PendingStatus.UploadingRender,
        data.fields.video_id,
        accessToken.access_token_id,
        PendingStatus.StartedRender,
      ],
    );

    if (affectedRows !== 1) {
      return Err(ctx, Status.BadRequest);
    }

    const [video] = await db.query<Video>(
      `select *
            , BIN_TO_UUID(video_id) as video_id
         from videos
        where video_id = UUID_TO_BIN(?)`,
      [
        data.fields.video_id,
      ],
    );

    if (!video) {
      return Err(ctx, Status.NotFound);
    }

    const filePath = getVideoFilePath(video.video_id);
    const fileName = basename(filePath);

    try {
      await Deno.rename(file.filename, filePath);

      logger.info('Uploading video file', filePath);

      const fileContents = await Deno.readFile(filePath);

      let videoUrl = '';

      if (B2_ENABLED) {
        const upload = await b2.uploadFile({
          bucketId: B2_BUCKET_ID,
          fileName,
          fileContents,
          contentType: 'video/mp4',
          contentDisposition: `attachment; filename="${encodeURIComponent(getVideoDownloadFilename(video))}"`,
        });

        videoUrl = b2.getDownloadUrl(upload.fileName);

        logger.info('Uploaded', filePath, upload, videoUrl);
      } else {
        videoUrl = `${AUTORENDER_PUBLIC_URI}/storage/videos/${video.share_id}`;
      }

      const { affectedRows } = await db.execute(
        `update videos
            set pending = ?
              , video_url = ?
              , video_size = ?
              , rendered_at = current_timestamp()
           where video_id = UUID_TO_BIN(?)`,
        [
          PendingStatus.FinishedRender,
          videoUrl,
          fileContents.byteLength,
          video.video_id,
        ],
      );

      logger.info('Finished render for', video.video_id, { affectedRows });

      Ok(ctx, { video_id: video.video_id });

      try {
        if (video.board_changelog_id !== null) {
          if (video.board_rank === 1) {
            logger.info('Sending webhook message for', video.video_id);

            const webhook = await fetch(DISCORD_BOARD_INTEGRATION_WEBHOOK_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': Deno.env.get('USER_AGENT')!,
              },
              body: JSON.stringify({
                content: `${AUTORENDER_PUBLIC_URI}/videos/${video.share_id}`,
              }),
            });

            logger.info('Board webhook executed for', video.video_id, ':', webhook.statusText);

            if (!webhook.ok) {
              logger.error('Failed to execute board webhook for', video.video_id, ':', await webhook.text());
            }
          }
        } else {
          type VideoUpload = Pick<
            Video,
            | 'share_id'
            | 'title'
            | 'requested_by_id'
            | 'requested_in_guild_id'
            | 'requested_in_channel_id'
          >;

          const uploadMessage: VideoUpload = {
            share_id: video.share_id,
            title: video.title,
            requested_by_id: video.requested_by_id,
            requested_in_guild_id: video.requested_in_guild_id,
            requested_in_channel_id: video.requested_in_channel_id,
          };

          if (discordBot && discordBot.readyState === WebSocket.OPEN) {
            discordBot.send(
              JSON.stringify({ type: 'upload', data: uploadMessage }),
            );
          } else {
            logger.error(
              `Bot not connected. Failed to send upload message:`,
              uploadMessage,
            );
          }
        }
      } catch (err) {
        logger.error('Error while sending message for', video.video_id, ':', err);
      }
    } catch (err) {
      logger.error('Error while uploading video for', video.video_id, ':', err);

      Err(ctx, Status.InternalServerError);

      try {
        const { affectedRows } = await db.execute(
          `update videos
              set pending = ?
             where video_id = UUID_TO_BIN(?)`,
          [
            PendingStatus.FinishedRender,
            video.video_id,
          ],
        );

        logger.error('Set video as finished for', video.video_id, { affectedRows });
      } catch (err) {
        logger.error(err);
      }
    }
  })
  // Get current video views and increment.
  .post('/videos/:share_id/views', rateLimits.views, async (ctx) => {
    if (!validateShareId(ctx.params.share_id!)) {
      return Err(ctx, Status.BadRequest);
    }

    const [video] = await db.query<Pick<Video, 'share_id' | 'views'>>(
      `select share_id
            , views
         from videos
        where share_id = ?
          and video_url IS NOT NULL`,
      [ctx.params.share_id],
    );

    if (!video) {
      return Err(ctx, Status.NotFound);
    }

    await db.execute(
      `update videos
         set views = views + 1
       where share_id = ?`,
      [video.share_id],
    );

    Ok(ctx, video);
  })
  // Get a random rendered videos.
  .get('/videos/random/:count(\\d+)', async (ctx) => {
    const videos = await db.query<Pick<Video, 'share_id' | 'title'>>(
      `select share_id
            , title
         from videos
        where video_url IS NOT NULL
     order by RAND()
        limit ?`,
      [Math.min(1, Math.max(10, Number(ctx.params.count)))],
    );

    Ok(ctx, videos);
  })
  // Get status of videos of requested user.
  .get('/videos/status/:requested_by_id(\\d+)', async (ctx) => {
    type VideoStatus = Pick<Video, 'share_id' | 'title'> & {
      errored: boolean;
      rendering: boolean;
      rendered: boolean;
    };

    const videos = await db.query<VideoStatus>(
      `select share_id
            , title
            , IF(video_url IS NULL AND pending = ?, TRUE, FALSE) as errored
            , IF(video_url IS NULL AND pending <> ?, TRUE, FALSE) as rendering
            , IF(video_url IS NOT NULL, TRUE, FALSE) as rendered
         from videos
        where requested_by_id = ?
     order by created_at desc
        limit 5`,
      [
        PendingStatus.FinishedRender,
        PendingStatus.FinishedRender,
        ctx.params.requested_by_id,
      ],
    );

    Ok(ctx, videos);
  })
  // Get back changelog IDs of renders that exist.
  .post('/check-videos-exist', async (ctx) => {
    if (!ctx.request.hasBody) {
      return Err(ctx, Status.InternalServerError);
    }

    const body = await ctx.request.body({ type: 'json' }).value as { ids?: number[] } | null;
    if (!body || !Array.isArray(body.ids) || body.ids.length > 4096) {
      return Err(ctx, Status.BadRequest);
    }

    const { ids } = body;

    if (!ids.length) {
      return Ok(ctx, {
        ids: [],
      });
    }

    const videos = await db.query<Pick<Video, 'board_changelog_id'>>(
      `select board_changelog_id
         from videos
        where board_changelog_id in (${ids.map(() => '?')})`,
      [
        ...ids,
      ],
    );

    Ok(ctx, {
      ids: videos.map((video) => video.board_changelog_id),
    });
  })
  // Get the video of a leaderboard run.
  .get('/video/:boardChangelogId(\\d+)/video', async (ctx) => {
    const [video] = await db.query<Pick<Video, 'video_url'>>(
      `select video_url
         from videos
        where board_changelog_id = ?
          and video_url is not null`,
      [
        ctx.params.boardChangelogId,
      ],
    );

    if (!video) {
      return Err(ctx, Status.NotFound);
    }

    ctx.response.redirect(video.video_url);
  })
  .get('/(.*)', (ctx) => {
    Err(ctx, Status.NotFound, 'Route not found :(');
  });

const router = new Router<AppState>();

const isHotReloadEnabled = Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true';
if (isHotReloadEnabled) {
  let reload = true;

  router.get('/connect/__hot_reload', (ctx) => {
    if (ctx.isUpgradable) {
      const ws = ctx.upgrade();
      ws.onmessage = () => {
        ws.send(reload ? 'yes' : 'no');
        reload = false;
      };
    }
  });
}

// Web API routes.

router.use('/api/v1', apiV1.routes());

// Discord bot connection.

router.get('/connect/bot', async (ctx) => {
  if (!ctx.isUpgradable) {
    return Err(ctx, Status.NotImplemented);
  }

  const [version, authToken] = ctx.request.headers.get('sec-websocket-protocol')?.split(', ') ?? [];

  if (version !== AUTORENDER_V1 || authToken === undefined) {
    return Err(ctx, Status.BadRequest);
  }

  if (
    !(await bcrypt.compare(
      decodeURIComponent(authToken),
      AUTORENDER_BOT_TOKEN_HASH,
    ))
  ) {
    return Err(ctx, Status.Unauthorized);
  }

  if (discordBot) {
    discordBot.close();
    discordBot = null;
  }

  discordBot = ctx.upgrade();

  discordBot.onopen = () => {
    logger.info('Bot connected');
  };

  discordBot.onmessage = (message) => {
    logger.info('Bot:', message.data);

    try {
      const { type } = JSON.parse(message.data);

      switch (type) {
        default: {
          discordBot && discordBot.readyState === WebSocket.OPEN &&
            discordBot.send(
              JSON.stringify({
                type: 'error',
                data: { status: Status.BadRequest },
              }),
            );
        }
      }
    } catch (err) {
      logger.error(err);
    }
  };

  discordBot.onclose = () => {
    logger.info('Bot disconnected');
    discordBot = null;
  };

  discordBot.onerror = (event: ErrorEvent | Event) => {
    const isErrorEvent = event instanceof ErrorEvent;

    if (isErrorEvent && event.error?.code === 'ECONNREFUSED') {
      return;
    }

    logger.error('Bot connection error', isErrorEvent ? event.error ?? event.message : event);
  };
});

// Client connections.

interface ClientState {
  accessTokenId: number;
  gameMods: string[];
  renderQualities: RenderQuality[];
}

const clients = new Map<string, ClientState>();

router.get('/connect/client', async (ctx) => {
  if (!ctx.isUpgradable) {
    return Err(ctx, Status.NotImplemented);
  }

  const [version, authToken] = ctx.request.headers.get('sec-websocket-protocol')?.split(', ') ?? [];

  if (version !== AUTORENDER_V1 || authToken === undefined) {
    return Err(ctx, Status.BadRequest);
  }

  type TokenSelect = Pick<
    AccessToken,
    'access_token_id' | 'user_id' | 'token_name' | 'permissions'
  >;

  const [accessToken] = await db.query<TokenSelect>(
    `select access_token_id
          , user_id
          , token_name
          , permissions
       from access_tokens
      where token_key = ?`,
    [decodeURIComponent(authToken)],
  );

  if (!accessToken) {
    return Err(ctx, Status.Unauthorized);
  }

  const clientId = `${accessToken.access_token_id}-${accessToken.user_id}-${accessToken.token_name}`;
  const ws = ctx.upgrade();

  ws.onopen = () => {
    logger.info(`Client ${clientId} connected`);

    clients.set(clientId, {
      accessTokenId: accessToken.access_token_id,
      gameMods: [],
      renderQualities: [],
    });
  };

  ws.onmessage = async (message) => {
    let messageType = '';
    try {
      if (typeof message.data !== 'string') {
        throw new Error('Invalid payload data type');
      }

      // FIXME: Protocol types
      const { type, data } = JSON.parse(message.data);

      messageType = type;

      switch (type) {
        case 'videos': {
          if (accessToken.permissions & AccessPermission.CreateVideos) {
            const clientGameDirs = Array.isArray(data.gameMods)
              ? data.gameMods.length <= supportedGameDirs.length
                ? supportedGameDirs.filter((dir) => data.gameMods.includes(dir))
                : []
              : ['portal2'];

            if (!clientGameDirs.length) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: {
                    status: Status.BadRequest,
                    message: 'Invalid game mods.',
                  },
                }),
              );
              break;
            }

            const renderQualities = [
              RenderQuality.SD_480p,
              RenderQuality.HD_720p,
              RenderQuality.FHD_1080p,
              RenderQuality.QHD_1440p,
              RenderQuality.UHD_2160p,
            ];

            const maxRenderQuality = renderQualities.indexOf(
              data.maxRenderQuality,
            );

            const clientRenderQualities = maxRenderQuality !== -1
              ? renderQualities.slice(0, maxRenderQuality + 1)
              : renderQualities.slice(0, 3);

            let videos = await db.query<
              Pick<Video, 'video_id' | 'render_quality'>
            >(
              `select BIN_TO_UUID(video_id) as video_id
                    , render_quality
                 from videos
                where pending = ?
                  and render_quality in (${clientRenderQualities.map(() => '?').join(',')})
                  and demo_game_dir in (${clientGameDirs.map(() => '?').join(',')})
             order by render_quality desc
                limit ?`,
              [
                PendingStatus.RequiresRender,
                ...clientRenderQualities,
                ...clientGameDirs,
                MAX_VIDEOS_PER_REQUEST,
              ],
            );

            // Only send videos of the same render quality.

            if (videos.length > 1) {
              const prioritisedRenderQuality = videos.at(0)?.render_quality;

              videos = videos.filter((video) => {
                return video.render_quality === prioritisedRenderQuality;
              });
            }

            ws.send(JSON.stringify({ type: 'videos', data: videos }));

            const client = clients.get(clientId);
            if (client && !client.gameMods.length) {
              client.gameMods = [...clientGameDirs];
              client.renderQualities = [...clientRenderQualities];
            }
          } else {
            ws.send(
              JSON.stringify({
                type: 'error',
                data: {
                  status: Status.Unauthorized,
                  message: 'Create videos permission required.',
                },
              }),
            );
          }
          break;
        }
        case 'demo': {
          if (accessToken.permissions & AccessPermission.WriteVideos) {
            const videoId = data.video_id;

            const update = await db.execute(
              `update videos
                 set pending = ?
                   , rendered_by = ?
                   , rendered_by_token = ?
                   , render_node = ?
                 where video_id = UUID_TO_BIN(?)
                   and pending = ?`,
              [
                PendingStatus.ClaimedRender,
                accessToken.user_id,
                accessToken.access_token_id,
                accessToken.token_name,
                videoId,
                PendingStatus.RequiresRender,
              ],
            );

            if (update.affectedRows === 0) {
              break;
            }

            logger.info(`Client ${clientId} claimed video ${videoId}`);

            type VideoSelect = Pick<
              Video,
              | 'video_id'
              | 'render_quality'
              | 'render_options'
              | 'file_url'
              | 'full_map_name'
              | 'demo_game_dir'
              | 'demo_playback_time'
              | 'demo_required_fix'
            >;

            const [video] = await db.query<VideoSelect>(
              `select BIN_TO_UUID(video_id) as video_id
                     , render_quality
                     , render_options
                     , file_url
                     , full_map_name
                     , demo_game_dir
                     , demo_playback_time
                     , demo_required_fix
                  from videos
                 where video_id = UUID_TO_BIN(?)`,
              [videoId],
            );

            if (!video) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: {
                    status: Status.NotFound,
                    message: 'Video not found.',
                  },
                }),
              );
              break;
            }

            const { demo_required_fix, ...videoPayload } = video;

            const buffer = new Buffer();
            const payload = new TextEncoder().encode(JSON.stringify(videoPayload));
            const length = new Uint8Array(4);
            new DataView(length.buffer).setUint32(0, payload.byteLength);

            await buffer.write(length);
            await buffer.write(payload);

            const getFilePath = demo_required_fix === FixedDemoStatus.Required ? getFixedDemoFilePath : getDemoFilePath;

            const filePath = getFilePath(videoPayload.video_id);
            await buffer.write(await Deno.readFile(filePath));

            ws.send(buffer.bytes());

            logger.info(`Sent video ${videoId} to client ${clientId}`);
          } else {
            ws.send(
              JSON.stringify({
                type: 'error',
                data: {
                  status: Status.Unauthorized,
                  message: 'Write videos permission required.',
                },
              }),
            );
          }
          break;
        }
        case 'downloaded': {
          const { video_ids: videoIds } = data as { video_ids: Video['video_id'][] };

          if (!Array.isArray(videoIds)) {
            ws.send(
              JSON.stringify({
                type: 'error',
                data: {
                  status: Status.BadRequest,
                  message: 'Expected video IDs as array.',
                },
              }),
            );
            break;
          }

          logger.info(`Client ${clientId} downloaded: ${videoIds.join(', ')}`);

          if (videoIds.some((id) => !uuid.validate(id))) {
            ws.send(
              JSON.stringify({
                type: 'error',
                data: {
                  status: Status.BadRequest,
                  message: 'Invalid video ID.',
                },
              }),
            );
            break;
          }

          if (videoIds.length > MAX_VIDEOS_PER_REQUEST) {
            ws.send(
              JSON.stringify({
                type: 'error',
                data: {
                  status: Status.BadRequest,
                  message: 'Invalid amount of video IDs.',
                },
              }),
            );
            break;
          }

          if (videoIds.length !== 0) {
            const { affectedRows } = await db.execute<Video>(
              `update videos
                  set pending = ?
                where pending = ?
                  and rendered_by_token = ?
                  and video_id in (${videoIds.map(() => `UUID_TO_BIN(?)`).join(',')})`,
              [
                PendingStatus.StartedRender,
                PendingStatus.ClaimedRender,
                accessToken.access_token_id,
                ...videoIds,
              ],
            );

            ws.send(
              JSON.stringify({
                type: 'start',
              }),
            );

            logger.info(`Sent start request to client ${clientId}`, { affectedRows });
          }

          // For all videos which did not come back here mark them as finished.

          const failedVideos = await db.query<Video>(
            `select *
                    , BIN_TO_UUID(video_id) as video_id
                 from videos
                where pending = ?
                  and rendered_by_token = ?
                  ${videoIds.length ? `and video_id not in (${videoIds.map(() => `UUID_TO_BIN(?)`).join(',')})` : ''}`,
            [
              PendingStatus.ClaimedRender,
              accessToken.access_token_id,
              ...videoIds,
            ],
          );

          for (const video of failedVideos) {
            const { affectedRows } = await db.execute(
              `update videos
                  set pending = ?
                where video_id = UUID_TO_BIN(?)`,
              [
                PendingStatus.FinishedRender,
                video.video_id,
              ],
            );

            logger.error(`Client ${clientId} set ${video.video_id} as finished`, { affectedRows });

            sendErrorToBot({
              status: Status.InternalServerError,
              message: `Failed to render video.`,
              share_id: video.share_id,
              requested_by_id: video.requested_by_id,
              requested_in_guild_id: video.requested_in_guild_id,
              requested_in_channel_id: video.requested_in_channel_id,
            });
          }
          break;
        }
        case 'error': {
          const { video_id, message } = data as {
            video_id: Video['video_id'] | undefined;
            message: string;
          };

          logger.error(`Client ${clientId} sent an error: ${message}`);

          if (video_id) {
            const { affectedRows } = await db.execute(
              `update videos
                  set pending = ?
                where video_id = UUID_TO_BIN(?)
                  and pending <> ?
                  and rendered_by_token = ?`,
              [
                PendingStatus.FinishedRender,
                video_id,
                PendingStatus.FinishedRender,
                accessToken.access_token_id,
              ],
            );

            logger.error(`Client ${clientId} set ${video_id} as finished`, { affectedRows });
          }
          break;
        }
        default: {
          logger.error(`Client ${clientId} sent an unknown message type`);

          ws.send(
            JSON.stringify({
              type: 'error',
              data: {
                status: Status.BadRequest,
                message: 'Unknown message type.',
              },
            }),
          );
          break;
        }
      }
    } catch (err) {
      logger.error(`Error while processing message "${messageType}" from client ${clientId}.`, err);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'error',
            data: { status: Status.InternalServerError },
          }),
        );
      }
    }
  };

  ws.onclose = () => {
    logger.info(`Client ${clientId} disconnected`);
    clients.delete(clientId);
  };

  ws.onerror = (event: ErrorEvent | Event) => {
    const isErrorEvent = event instanceof ErrorEvent;

    if (isErrorEvent && event.error?.code === 'ECONNREFUSED') {
      return;
    }

    logger.error(`Client ${clientId} connection error`, isErrorEvent ? event.error ?? event.message : event);
  };
});

router.get('/login/discord/authorize', rateLimits.authorize, useSession, async (ctx) => {
  const code = ctx.request.url.searchParams.get('code');
  if (!code) {
    //return Err(ctx, Status.BadRequest);
    return ctx.response.redirect('/');
  }

  // Discord OAuth2
  //    https://discord.com/developers/docs/topics/oauth2#authorization-code-grant

  const data = {
    grant_type: 'authorization_code',
    client_id: Deno.env.get('DISCORD_CLIENT_ID')!,
    client_secret: Deno.env.get('DISCORD_CLIENT_SECRET')!,
    code,
    redirect_uri: `${AUTORENDER_PUBLIC_URI}/login/discord/authorize`,
  };

  const oauthResponse = await fetch(
    'https://discord.com/api/v10/oauth2/token',
    {
      method: 'POST',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: Object.entries(data)
        .map(
          ([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        )
        .join('&'),
    },
  );

  if (!oauthResponse.ok) {
    //return Err(ctx, Status.Unauthorized);
    return ctx.response.redirect('/');
  }

  const { access_token } = await oauthResponse.json();

  // Fetch user data:
  //    https://discord.com/developers/docs/resources/user#get-current-user

  const usersResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      authorization: `Bearer ${access_token}`,
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
  });

  const discordUser = (await usersResponse.json()) as DiscordUser;

  const [authUser] = await db.query<Pick<User, 'user_id'>>(
    `select user_id from users where discord_id = ?`,
    [discordUser.id],
  );

  if (authUser?.user_id) {
    await db.execute(
      `update users
          set username = ?
            , discord_avatar = ?
            , discord_banner = ?
            , discord_accent_color = ?
        where user_id = ?`,
      [
        discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username,
        discordUser.avatar,
        discordUser.banner ?? null,
        discordUser.accent_color ?? null,
        authUser.user_id,
      ],
    );
  } else {
    await db.execute(
      `insert into users (
            username
          , discord_id
          , discord_avatar
          , discord_banner
          , discord_accent_color
          , permissions
        ) values (
            ?
          , ?
          , ?
          , ?
          , ?
          , ?
        )`,
      [
        discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username,
        discordUser.id,
        discordUser.avatar,
        discordUser.banner ?? null,
        discordUser.accent_color ?? null,
        UserPermissions.ListVideos,
      ],
    );
  }

  const [user] = await db.query<User>(
    `select * from users where discord_id = ?`,
    [discordUser.id],
  );

  if (!user) {
    //return Err(ctx, Status.InternalServerError);
    return ctx.response.redirect('/');
  }

  ctx.state.session.set('user', user);
  ctx.response.redirect('/');
});
// router.get("/users/@me", useSession, requiresAuth, (ctx) => {
//   Ok(ctx, ctx.state.session.get("user"));
// });
router.get('/logout', useSession, async (ctx) => {
  await ctx.state.session.deleteSession();
  await ctx.cookies.delete('session');
  await ctx.cookies.delete('session_data');
  ctx.response.redirect('/');
});

const routeToApp = async (ctx: Context) => {
  const request = await createFetchRequest(ctx.request);
  const user = ctx.state.session?.get('user') ?? null;
  const url = new URL(ctx.request.url);

  const requestContext: RequestContext = {
    user,
    db,
    url,
  };

  const context = await routeHandler.query(request, { requestContext });

  // NOTE: This only handles redirect responses in async loaders/actions
  if (context instanceof Response) {
    const location = context.headers.get('Location') ?? '/';
    ctx.response.status = context.status;
    return ctx.response.redirect(location);
  }

  const [match] = context.matches;
  const matchedPath = match?.route?.path;
  const matchedRoute = routes.find((route) => route.path === matchedPath);
  const meta = (() => {
    if (!matchedRoute?.meta || !match) {
      return {};
    }

    const [_, loadersData] = Object.entries(context.loaderData)
      .find(([id]) => id === match.route.id) ?? [];

    if (loadersData === undefined) {
      return {};
    }

    return matchedRoute.meta({ data: loadersData, context: requestContext });
  })();

  const clientStates: ReactAppState['clientStates'] = new Map();
  let accessTokenIds: ReactAppState['clients'] = [];

  if (url.pathname === '/status') {
    if (isHotReloadEnabled) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    accessTokenIds = Array.from(clients.values(), (client) => {
      clientStates.set(client.accessTokenId, {
        games: client.gameMods.map((gameMod) => supportedGameMods[gameMod]!.name),
        renderQualities: Array.from(client.renderQualities),
      });
      return client.accessTokenId;
    });
  }

  const initialState: ReactAppState = {
    user,
    clients: accessTokenIds,
    clientStates,
    url,
    meta,
    domain: SERVER_DOMAIN,
    nonce: btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))),
    discordAuthorizeLink: DISCORD_AUTHORIZE_LINK,
  };

  const router = createStaticRouter(routeHandler.dataRoutes, context);

  ctx.response.body = index(router, context, initialState);
  ctx.response.headers.set('content-type', 'text/html');
};

if (!B2_ENABLED) {
  // TODO: Remove
  router.get('/storage/videos/:share_id([0-9A-Za-z_-]{11})', async (ctx) => {
    if (!validateShareId(ctx.params.share_id!)) {
      await routeToApp(ctx);
      return;
    }

    try {
      const [video] = await db.query<
        Pick<Video, 'video_id' | 'file_name' | 'title'>
      >(
        `select BIN_TO_UUID(video_id) as video_id
              , file_name
              , title
           from videos
          where share_id = ?`,
        [ctx.params.share_id],
      );

      if (!video) {
        await routeToApp(ctx);
        return;
      }

      const file = await Deno.readFile(getVideoFilePath(video.video_id));

      ctx.response.headers.set(
        'Content-Disposition',
        `filename="${encodeURIComponent(getVideoDownloadFilename(video))}"`,
      );

      Ok(ctx, file, 'video/mp4');
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        await routeToApp(ctx);
      } else {
        logger.error(err);
      }
    }
  });
  router.get('/storage/videos/:video_id', async (ctx) => {
    if (!uuid.validate(ctx.params.video_id)) {
      await routeToApp(ctx);
      return;
    }

    try {
      const [video] = await db.query<
        Pick<Video, 'video_id' | 'file_name' | 'title'>
      >(
        `select BIN_TO_UUID(video_id) as video_id
              , file_name
              , title
           from videos
          where video_id = UUID_TO_BIN(?)`,
        [ctx.params.video_id],
      );

      if (!video) {
        await routeToApp(ctx);
        return;
      }

      const file = await Deno.readFile(getVideoFilePath(video.video_id));

      ctx.response.headers.set(
        'Content-Disposition',
        `filename="${encodeURIComponent(getVideoDownloadFilename(video))}"`,
      );

      Ok(ctx, file, 'video/mp4');
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        await routeToApp(ctx);
      } else {
        logger.error(err);
      }
    }
  });
}

// TODO: Remove regex
router.get('/storage/demos/:share_id([0-9A-Za-z_-]{11})/:fixed(fixed)?', async (ctx) => {
  if (!validateShareId(ctx.params.share_id!)) {
    await routeToApp(ctx);
    return;
  }

  try {
    const [video] = await db.query<Pick<Video, 'video_id' | 'file_name' | 'board_changelog_id'>>(
      `select BIN_TO_UUID(video_id) as video_id
          , file_name
          , board_changelog_id
       from videos
      where share_id = ?`,
      [ctx.params.share_id],
    );

    if (!video) {
      await routeToApp(ctx);
      return;
    }

    if (video.board_changelog_id) {
      return ctx.response.redirect(`https://board.portal2.sr/getDemo?id=${video.board_changelog_id}`);
    }

    const requestedFixedDemo = ctx.params.fixed !== undefined;

    const getFilePath = requestedFixedDemo ? getFixedDemoFilePath : getDemoFilePath;

    const demo = await Deno.readFile(getFilePath(video.video_id));

    // TODO: Fix this
    const filename = requestedFixedDemo
      ? video.file_name.toLowerCase().endsWith('.dem')
        ? `${video.file_name.slice(0, -4)}_fixed.dem`
        : `${video.file_name}_fixed.dem`
      : video.file_name;

    ctx.response.headers.set(
      'Content-Disposition',
      `attachment; filename="${
        filename
          .replaceAll('\\', '\\\\')
          .replaceAll('"', '\\"')
      }"`,
    );

    Ok(ctx, demo, 'application/octet-stream');
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      await routeToApp(ctx);
    } else {
      logger.error(err);
    }
  }
});
// TODO: Remove
router.get('/storage/demos/:video_id/:fixed(fixed)?', async (ctx) => {
  if (!uuid.validate(ctx.params.video_id!)) {
    await routeToApp(ctx);
    return;
  }

  try {
    const [video] = await db.query<Pick<Video, 'video_id' | 'file_name'>>(
      `select BIN_TO_UUID(video_id) as video_id
          , file_name
       from videos
      where video_id = UUID_TO_BIN(?)`,
      [ctx.params.video_id],
    );

    if (!video) {
      await routeToApp(ctx);
      return;
    }

    const requestedFixedDemo = ctx.params.fixed !== undefined;

    const getFilePath = requestedFixedDemo ? getFixedDemoFilePath : getDemoFilePath;

    const demo = await Deno.readFile(getFilePath(video.video_id));

    const filename = requestedFixedDemo
      ? video.file_name.toLowerCase().endsWith('.dem')
        ? `${video.file_name.slice(0, -4)}_fixed.dem`
        : `${video.file_name}_fixed.dem`
      : video.file_name;

    ctx.response.headers.set(
      'Content-Disposition',
      `attachment; filename="${
        filename
          .replaceAll('\\', '\\\\')
          .replaceAll('"', '\\"')
      }"`,
    );

    Ok(ctx, demo, 'application/octet-stream');
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      await routeToApp(ctx);
    } else {
      logger.error(err);
    }
  }
});
router.get('/storage/previews/:share_id', async (ctx) => {
  const { share_id } = ctx.params;

  if (!validateShareId(share_id)) {
    return Err(ctx, Status.BadRequest);
  }

  try {
    const path = getVideoPreviewPath({ share_id });
    const preview = await Deno.readFile(path);

    ctx.response.headers.set(
      'Content-Disposition',
      `filename="${encodeURIComponent(basename(path))}"`,
    );

    ctx.response.headers.set('Cache-Control', 'public, max-age=300');

    Ok(ctx, preview, 'image/webp');
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return Err(ctx, Status.NotFound);
    } else {
      logger.error(err);
    }
  }
});
router.get('/storage/thumbnails/:share_id/:small(small)?', async (ctx) => {
  const share_id = ctx.params.share_id!;
  const small = ctx.params.small !== undefined;

  if (!validateShareId(share_id)) {
    return Err(ctx, Status.BadRequest);
  }

  try {
    const path = (small ? getVideoThumbnailSmallPath : getVideoThumbnailPath)({ share_id });
    const preview = await Deno.readFile(path);

    ctx.response.headers.set(
      'Content-Disposition',
      `filename="${encodeURIComponent(basename(path))}"`,
    );

    ctx.response.headers.set('Cache-Control', 'public, max-age=300');

    Ok(ctx, preview, 'image/webp');
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return Err(ctx, Status.NotFound);
    } else {
      logger.error(err);
    }
  }
});
router.get('/security.txt', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('security.txt')), 'text/plain');
});
router.get('/.well-known/security.txt', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('security.txt')), 'text/plain');
});
router.get('/storage/files/autorender.cfg', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('autorender.cfg')), 'text/plain');
});
router.get('/storage/files/quickhud.zip', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('quickhud.zip')), 'application/zip');
});
router.get('/storage/files/portal2_benchmark.dem', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('portal2_benchmark.dem')), 'application/octet-stream');
});

const routeToImages = async (ctx: Context, file: string) => {
  try {
    const image = await Deno.readFile(`./app/assets/images/${file}`);

    ctx.response.headers.set('Cache-Control', 'public, max-age=300');

    Ok(ctx, image, 'image/png');
  } catch (err) {
    logger.error(err);
    Err(ctx, Status.NotFound);
  }
};

router.get('/assets/images/:file([\\w]+\\.png)', async (ctx) => await routeToImages(ctx, ctx.params.file!));
router.get('/assets/images/:file([\\w]+\\.jpg)', async (ctx) => await routeToImages(ctx, ctx.params.file!));
router.get('/assets/js/:file([\\w]+\\.js)', async (ctx) => {
  try {
    const js = await Deno.readFile(`./app/assets/js/${ctx.params.file}`);
    Ok(ctx, js, 'text/javascript');
  } catch (err) {
    logger.error(err);
    Err(ctx, Status.NotFound);
  }
});
router.get('/assets/(.*)', (ctx) => {
  Err(ctx, Status.NotFound, 'Asset not found :(');
});

router.get('/video.html', async (ctx) => {
  const changelogId = ctx.request.url.searchParams.get('v') ?? '';
  if (!changelogId.length || parseInt(changelogId, 10).toString() !== changelogId) {
    return Err(ctx, Status.BadRequest);
  }

  const [video] = await db.query<Pick<Video, 'share_id'>>(
    `select share_id
       from videos
      where board_changelog_id = ?`,
    [
      changelogId,
    ],
  );

  if (!video) {
    return Err(ctx, Status.NotFound);
  }

  ctx.response.redirect(`/videos/${video.share_id}`);
});

router.get('/favicon.ico', (ctx) => (ctx.response.status = Status.NotFound));
router.post('/tokens/:access_token_id(\\d+)', useSession, routeToApp);
router.post('/tokens/:access_token_id(\\d+/delete)', useSession, routeToApp);
router.post('/tokens/new', useSession, routeToApp);
router.post('/tokens/test', async (ctx) => {
  if (!ctx.request.hasBody) {
    return Err(ctx, Status.BadRequest);
  }

  const body = await ctx.request.body({ type: 'json' }).value;
  if (!body?.token_key) {
    return Err(ctx, Status.BadRequest);
  }

  const [accessToken] = await db.query(
    `select 1
       from access_tokens
      where token_key = ?`,
    [body?.token_key],
  );

  if (!accessToken) {
    return Err(ctx, Status.Unauthorized);
  }

  Ok(ctx);
});
router.get('/(.*)', useSession, routeToApp);

type AppState = {
  session: Session & { get(key: 'user'): User | undefined };
};

const app = new Application<AppState>({
  proxy: true,
});

app.addEventListener('error', (ev) => {
  try {
    logger.error(ev.error);
  } catch (err) {
    console.error('This should not happen!', err, ev?.error);
  }
});

app.use(oakCors());
app.use(async (ctx, next) => {
  const method = ctx.request.method;
  const url = ctx.request.url;
  const ua = ctx.request.headers.get('user-agent')?.replace(/[\n\r]/g, '') ?? '';
  const ip = ctx.request.ip;
  logger.info(`${method} ${url} : ${ip} : ${ua}`);
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

logger.info(`Server listening at http${SERVER_SSL_CERT !== 'none' ? 's' : ''}://${SERVER_HOST}:${SERVER_PORT}`);

await app.listen(
  SERVER_SSL_CERT !== 'none'
    ? {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      secure: true,
      certFile: SERVER_SSL_CERT,
      keyFile: SERVER_SSL_KEY,
      alpnProtocols: ['h2', 'http/1.1'],
    }
    : {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      secure: false,
    },
);
