/*
 * Copyright (c) 2023-2024, NeKz
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
import { Application, Context, CookiesSetDeleteOptions, Middleware, Router, Status } from 'oak/mod.ts';
import { Response as OakResponse, ResponseBody, ResponseBodyFunction } from 'oak/response.ts';
import Session from 'oak_sessions/src/Session.ts';
import CookieStore from 'oak_sessions/src/stores/CookieStore.ts';
import { oakCors } from 'cors/mod.ts';
import { installLogger, logger } from './logger.ts';
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
import { DemoMetadata, getDemoInfo, repairDemo, supportedGameDirs, supportedGameMods } from './demo.ts';
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
import { fetchDemo, getChangelog } from './tasks/portal2_sr.ts';
import { insertVideo } from './tasks/board_insert.ts';

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
const AUTORENDER_MAX_DEMO_FILE_SIZE = Number(Deno.env.get('AUTORENDER_MAX_DEMO_FILE_SIZE')) * 1_000_000;
const AUTORENDER_MAX_VIDEO_FILE_SIZE = Number(Deno.env.get('AUTORENDER_MAX_VIDEO_FILE_SIZE')) * 1_000_000;
const DISCORD_BOARD_INTEGRATION_WEBHOOK_URL = Deno.env.get('DISCORD_BOARD_INTEGRATION_WEBHOOK_URL')!;
const B2_ENABLED = Deno.env.get('B2_ENABLED')!.toLowerCase() === 'true';
const B2_BUCKET_ID = Deno.env.get('B2_BUCKET_ID')!;
const BOARD_INTEGRATION_START_DATE = '2023-08-25';
const AUTORENDER_RUN_DEMO_REPAIR = Deno.env.get('AUTORENDER_RUN_DEMO_REPAIR')?.toLowerCase() === 'true';

(() => {
  const originalDestroy = OakResponse.prototype.destroy;
  OakResponse.prototype.destroy = function () {
    originalDestroy.bind(this)(true); // Always close resources
  };
})();

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

const requiresAuth: Middleware<AppState> = async (ctx, next) => {
  if (!ctx.state.session.get('user')) {
    return Err(ctx, Status.Unauthorized, 'Not logged in.');
  }

  await next();
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

installLogger('server');

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

const Err = (ctx: Context, status: Status, message: string) => {
  ctx.response.status = status;
  ctx.response.type = 'application/json';
  ctx.response.body = {
    status,
    message,
  };

  status !== Status.NotFound && logger.error(message);
};

const apiV1 = new Router<AppState>();

apiV1
  // Incoming render request from the bot containing the demo file.
  .put('/videos/render', useSession, async (ctx) => {
    const authUser = ctx.state.session.get('user');

    if (authUser) {
      if (!hasPermission(ctx, UserPermissions.CreateVideos)) {
        return Err(ctx, Status.Unauthorized, 'Missing CreateVideos permission.');
      }
    } else {
      const [authType, authToken] = (
        ctx.request.headers.get('Authorization') ?? ''
      ).split(' ');

      if (authType !== 'Bearer' || authToken === undefined) {
        return Err(ctx, Status.BadRequest, 'Invalid authorization header.');
      }

      const decodedAuthToken = decodeURIComponent(authToken);

      if (
        !(await bcrypt.compare(
          decodedAuthToken,
          AUTORENDER_BOT_TOKEN_HASH,
        ))
      ) {
        return Err(ctx, Status.Unauthorized, 'Invalid token.');
      }
    }

    if (!ctx.request.hasBody) {
      return Err(ctx, Status.UnsupportedMediaType, 'Missing body.');
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
      return Err(ctx, Status.BadRequest, 'Missing file.');
    }

    const videoId = uuid.v1.generate() as string;
    const shareId = generateShareId();

    const filePath = getDemoFilePath(videoId);
    await Deno.rename(file.filename, filePath);

    // TODO: Figure out if UGC changes when the revision of a workshop item updates.

    const demoInfo = await getDemoInfo(filePath);

    if (demoInfo === null || typeof demoInfo === 'string') {
      return Err(ctx, Status.BadRequest, demoInfo ?? 'Unknown demo error.');
    }

    if (demoInfo.isWorkshopMap && !demoInfo.workshopInfo?.fileUrl) {
      logger.error(`Failed to resolve workshop map`);
      return Err(ctx, Status.InternalServerError, 'Demo resolve error.');
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
      ...(demoInfo.disableRenderSkipCoopVideos ? ['sar_render_skip_coop_videos 0'] : []),
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
      return Err(ctx, Status.BadRequest, 'Invalid authorization header.');
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
      return Err(ctx, Status.Unauthorized, 'Invalid access token.');
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
      return Err(ctx, Status.BadRequest, 'Missing file.');
    }

    const command = new Deno.Command('ffprobe', { args: [file.filename], stderr: 'piped' });
    const proc = command.spawn();
    const procTimeout = setTimeout(() => {
      try {
        proc.kill();
      } catch (err) {
        logger.error(err);
      }
    }, 5_000);

    const output = await proc.output();
    clearTimeout(procTimeout);

    if (output.code !== 0) {
      const error = new TextDecoder().decode(output.stderr) ?? '';
      logger.error(`Process ffprobe returned: ${output.code}\nError:${error}`);
      return Err(ctx, Status.UnsupportedMediaType, 'Unsupported media type.');
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
      return Err(ctx, Status.BadRequest, 'Render not started.');
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
      return Err(ctx, Status.NotFound, 'Video not found.');
    }

    const filePath = getVideoFilePath(video.video_id);
    const fileName = basename(filePath);

    try {
      await Deno.rename(file.filename, filePath);

      logger.info('Uploading video file', filePath);

      let videoUrl = '';
      let videoExternalId = null;
      let videoSize = 0;

      if (B2_ENABLED) {
        // TODO: Use implementation from jsr:@nekz/b2
        // if (video.video_external_id) {
        //   await b2.deleteFileVersion({ fileId: video.video_external_id });
        // }

        const fileContents = await Deno.readFile(filePath);

        const upload = await b2.uploadFile({
          bucketId: B2_BUCKET_ID,
          fileName,
          fileContents,
          contentType: 'video/mp4',
          contentDisposition: `attachment; filename="${encodeURIComponent(getVideoDownloadFilename(video))}"`,
        });

        videoUrl = b2.getDownloadUrl(upload.fileName);
        videoSize = fileContents.byteLength;
        videoExternalId = upload.fileId;

        logger.info('Uploaded', filePath, upload, videoUrl);
      } else {
        videoUrl = `${AUTORENDER_PUBLIC_URI}/storage/videos/${video.share_id}`;
        videoSize = (await Deno.stat(filePath)).size;
      }

      const { affectedRows } = await db.execute(
        `update videos
            set pending = ?
              , video_url = ?
              , video_external_id = ?
              , video_size = ?
              , rendered_at = current_timestamp()
           where video_id = UUID_TO_BIN(?)`,
        [
          PendingStatus.FinishedRender,
          videoUrl,
          videoExternalId,
          videoSize,
          video.video_id,
        ],
      );

      logger.info('Finished render for', video.video_id, { affectedRows });

      Ok(ctx, { video_id: video.video_id });

      if (video.created_at.toISOString().slice(0, 10) < BOARD_INTEGRATION_START_DATE) {
        return;
      }

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

          try {
            await Deno.remove(getDemoFilePath(video.video_id));
          } catch (err) {
            logger.error(err);
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

      Err(ctx, Status.InternalServerError, 'Upload error.');

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
      return Err(ctx, Status.BadRequest, 'Invalid share ID.');
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
      return Err(ctx, Status.NotFound, 'Video not found.');
    }

    await db.execute(
      `update videos
         set views = views + 1
       where share_id = ?`,
      [video.share_id],
    );

    Ok(ctx, video);
  })
  // Start a rerender of a video.
  .post('/videos/:share_id/rerender', useSession, requiresAuth, async (ctx) => {
    if (!hasPermission(ctx, UserPermissions.RerenderVideos)) {
      return Err(ctx, Status.Unauthorized, 'Missing RenderVideos permission.');
    }

    if (!validateShareId(ctx.params.share_id!)) {
      return Err(ctx, Status.BadRequest, 'Invalid share ID.');
    }

    if (!ctx.request.hasBody) {
      return Err(ctx, Status.BadRequest, 'Missing body.');
    }

    const { demoRepair, disableSndRestart, disableSkipCoopVideos } = await ctx.request.body({ type: 'json' }).value as {
      demoRepair: boolean;
      disableSndRestart: boolean;
      disableSkipCoopVideos: boolean;
    };

    const [video] = await db.query<
      Pick<
        Video,
        | 'video_id'
        | 'share_id'
        | 'board_changelog_id'
        | 'file_name'
        | 'created_at'
        | 'full_map_name'
      > & Pick<MapModel, 'auto_fullbright'>
    >(
      `select BIN_TO_UUID(video_id) as video_id
            , share_id
            , board_changelog_id
            , file_name
            , created_at
            , full_map_name
            , auto_fullbright
         from videos
         join maps
           on maps.map_id = videos.map_id 
        where share_id = ?`,
      [
        ctx.params.share_id,
      ],
    );

    if (!video) {
      return Err(ctx, Status.NotFound, 'Video not found.');
    }

    if (video.board_changelog_id) {
      const { demo, originalFilename } = await fetchDemo(video.board_changelog_id);
      const filePath = getDemoFilePath(video.video_id);

      {
        using file = await Deno.open(filePath, { create: true, write: true, truncate: true });
        await demo.body?.pipeTo(file.writable);
      }

      const fileCleanup = async () => {
        if (filePath) {
          try {
            await Deno.remove(filePath);
          } catch (err) {
            logger.error(err);
          }
        }
      };

      const demoInfo = await getDemoInfo(filePath, { isBoardDemo: true });

      if (demoInfo === null || typeof demoInfo === 'string') {
        logger.error('Invalid demo', demoInfo);
        await fileCleanup();
        return Err(ctx, Status.InternalServerError, 'Invalid demo.');
      }

      const renderOptions = [
        ...(video.auto_fullbright
          ? [
            `mat_ambient_light_r 0.05`,
            `mat_ambient_light_g 0.05`,
            `mat_ambient_light_b 0.05`,
          ]
          : []),
      ];

      if (demoInfo.disableRenderSkipCoopVideos || disableSkipCoopVideos) {
        renderOptions.push('sar_render_skip_coop_videos 0');
      }

      if (disableSndRestart) {
        renderOptions.push('alias snd_restart ""');
      }

      const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
      const demoMetadata = JSON.stringify(demoInfo.metadata);

      const { affectedRows } = await db.execute(
        `update videos
          set pending = ?
            , rendered_by = null
            , rendered_by_token = null
            , render_node = null
            , rerender_started_at = CURRENT_TIMESTAMP()
            , processed = 0
            , render_options = ?
            , file_name = ?
            , full_map_name = ?
            , demo_size = ?
            , demo_map_crc = ?
            , demo_game_dir = ?
            , demo_playback_time = ?
            , demo_required_fix = ?
            , demo_tickrate = ?
            , demo_portal_score = ?
            , demo_time_score = ?
            , demo_player_name = ?
            , demo_steam_id = ?
            , demo_partner_player_name = ?
            , demo_partner_steam_id = ?
            , demo_is_host = ?
            , demo_metadata = ?
            , demo_requires_repair = ?
        where video_id = UUID_TO_BIN(?)
          and pending = ?`,
        [
          PendingStatus.RequiresRender,
          renderOptions.filter((command) => command !== null).join('\n'),
          originalFilename,
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
          demoRepair ? 1 : 0,
          video.video_id,
          PendingStatus.FinishedRender,
        ],
      );

      if (affectedRows) {
        logger.info(`Started rerender of ${video.share_id}`);
      }

      return Ok(ctx, { started: (affectedRows ?? 0) > 0 });
    }

    const { affectedRows } = await db.execute(
      `update videos
          set pending = ?
            , rendered_by = null
            , rendered_by_token = null
            , render_node = null
            , rerender_started_at = CURRENT_TIMESTAMP()
            , processed = 0
            , demo_requires_repair = ?
        where video_id = UUID_TO_BIN(?)
          and pending = ?`,
      [
        PendingStatus.RequiresRender,
        demoRepair ? 1 : 0,
        video.video_id,
        PendingStatus.FinishedRender,
      ],
    );

    if (affectedRows) {
      logger.info(`Started rerender of ${video.share_id}`);
    }

    Ok(ctx, { started: (affectedRows ?? 0) > 0 });
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
      return Err(ctx, Status.InternalServerError, 'Missing body.');
    }

    const body = await ctx.request.body({ type: 'json' }).value as { ids?: number[] } | null;
    if (!body || !Array.isArray(body.ids)) {
      return Err(ctx, Status.BadRequest, 'Missing ids.');
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
        where board_changelog_id in (${ids.map(() => '?')})
          and video_url is not null`,
      ids,
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
      return Err(ctx, Status.NotFound, 'Video not found.');
    }

    ctx.response.redirect(video.video_url);
  })
  // Search a leaderboard run.
  .get('/search', async (ctx) => {
    interface SearchResponse {
      end: boolean;
      results: {
        comment: string;
        cur_rank: number;
        date: string;
        id: number;
        map: string;
        map_id: number;
        obsoleted: number;
        orig_rank: number;
        time: number;
        user: string;
        user_id: string;
        views: number;
        share_id: string;
      }[];
    }

    type VideoSelect =
      & Pick<
        Video,
        | 'comment'
        | 'created_at'
        | 'board_changelog_id'
        | 'board_rank'
        | 'demo_time_score'
        | 'demo_player_name'
        | 'board_profile_number'
        | 'views'
        | 'share_id'
      >
      & Pick<MapModel, 'alias' | 'best_time_id'>;

    const searchResult = (video: VideoSelect): SearchResponse['results']['0'] => {
      return {
        comment: video.comment,
        cur_rank: 0,
        date: video.created_at.toISOString(),
        id: video.board_changelog_id,
        map: video.alias,
        map_id: video.best_time_id,
        obsoleted: 0,
        orig_rank: video.board_rank,
        time: video.demo_time_score,
        user: video.demo_player_name,
        user_id: video.board_profile_number,
        views: video.views,
        share_id: video.share_id,
      };
    };

    const query = ctx.request.url.searchParams.get('q')?.trim() ?? '';

    if (!query.length) {
      const videos = await db.query<VideoSelect>(
        `select videos.created_at
              , videos.board_changelog_id
              , videos.board_rank
              , videos.demo_time_score
              , videos.demo_player_name
              , videos.board_profile_number
              , videos.views
              , videos.comment
              , videos.share_id
              , maps.alias
              , maps.best_time_id
           from videos
           join maps
             on maps.map_id = videos.map_id
          where board_changelog_id is not null
            and video_url is not null
          order by created_at desc
          limit 30`,
      );

      return Ok(
        ctx,
        {
          end: false,
          results: videos.map(searchResult),
        } satisfies SearchResponse,
      );
    }

    /**
     * Syntax:
     *     <map> [rank]
     *     <map> [wr]
     *     <map> [time]
     *     <map> [player]
     *     [player] <map>
     */

    const isWr = query.endsWith(' wr') || query.endsWith(' world record');
    const matchedRank = / ([1-9]+)(st|nd|rd|th)$/g.exec(query)?.at(1) ?? / rank ([1-9]+)$/g.exec(query)?.at(1);

    const rank = isWr ? 1 : Number(matchedRank);

    const [_g1, _g2, min, sec, cs] = [.../ (([0-9]):)?([0-9]?[0-9])\.([0-9][0-9])$/g.exec(query) ?? []];
    const time = (Number(min ?? 0) * 60 * 100) + (Number(sec ?? 0) * 100) + Number(cs ?? 0);

    const words = query.split(' ');
    let lastIndex = (isWr && words.at(-2) === 'world') || (!isNaN(rank) && words.at(-2) === 'rank')
      ? -2
      : isWr || matchedRank || time
      ? -1
      : 0;

    let mapTypes: MapType[] = [];
    let hostOnly: boolean | undefined = undefined;

    if (words.length >= 2) {
      const hint = words.at(lastIndex - 1)?.toLocaleLowerCase();
      switch (hint) {
        case 'sp':
          lastIndex -= 1;

          mapTypes = [
            MapType.SinglePlayer,
            MapType.WorkshopSinglePlayer,
          ];
          break;
        case 'coop':
        case 'mp':
        case 'blue':
        case 'orange': {
          lastIndex -= 1;
          hostOnly = hint === 'blue' ? true : hint === 'orange' ? false : undefined;

          mapTypes = [
            MapType.Cooperative,
            MapType.WorkshopCooperative,
          ];
          break;
        }
        default:
          break;
      }

      words
        .slice(0, 2)
        .forEach((word, index) => {
          const abbreviation = word.toLocaleLowerCase();
          switch (abbreviation) {
            case 'coop': {
              words[index] = 'Cooperative';
              break;
            }
            case 'prop': {
              words[index] = 'Propulsion';
              break;
            }
            default:
              break;
          }
        });
    }

    lastIndex && words.splice(lastIndex, -lastIndex);

    const mapNames = [
      ...new Set([
        words.join(' '),
        words.slice(1).join(' '),
        words.slice(0, -1).join(' '),
      ]),
    ].filter((name) => name.length > 0);

    const maps = mapNames.length
      ? await db.query<Pick<MapModel, 'map_id' | 'alias'>>(
        `select map_id
              , alias
           from maps
          where best_time_id is not null
                and (${mapNames.map(() => `maps.alias like ?`).join(' or ')})
                ${mapTypes.length ? `and maps.type in (${mapTypes.map(() => '?').join(',')})` : ''}`,
        [
          ...mapNames,
          ...mapTypes,
        ],
      )
      : [];

    const map = (() => {
      const [map] = maps;
      if (!map || maps.length === 1) {
        return map;
      }

      for (const mapName of mapNames) {
        for (const map of maps) {
          if (mapName.toLocaleLowerCase() === map.alias.toLocaleLowerCase()) {
            return map;
          }
        }
      }
    })();

    if (!map) {
      return Ok(
        ctx,
        {
          end: true,
          results: [],
        } satisfies SearchResponse,
      );
    }

    const joinedWords = words.join(' ').toLowerCase();
    const mapName = map.alias.toLocaleLowerCase();
    const playerName = joinedWords.startsWith(mapName) && !joinedWords.endsWith(mapName)
      ? words.at(-1) ?? ''
      : joinedWords.endsWith(mapName) && !joinedWords.startsWith(mapName)
      ? words.at(0) ?? ''
      : '';

    const videos = await db.query<VideoSelect>(
      `select videos.created_at
            , videos.board_changelog_id
            , videos.board_rank
            , videos.demo_time_score
            , videos.demo_player_name
            , videos.board_profile_number
            , videos.views
            , videos.comment
            , videos.share_id
            , maps.alias
            , maps.best_time_id
         from videos
         join maps
           on maps.map_id = videos.map_id
        where board_changelog_id is not null
          and video_url is not null
          and videos.map_id = ?
          ${time === 0 && isNaN(rank) && playerName.length ? `and videos.demo_player_name sounds like ?` : ''}
          ${time !== 0 ? ' and demo_time_score = ?' : ''}
          ${!isNaN(rank) ? ' and board_rank = ?' : ''}
          ${hostOnly !== undefined ? ` and demo_is_host = ${hostOnly ? 1 : 0}` : ''}
     order by created_at desc
        limit 21`,
      [
        map.map_id,
        ...(time === 0 && isNaN(rank) && playerName.length ? [playerName] : []),
        ...(time !== 0 ? [time] : []),
        ...(!isNaN(rank) ? [rank] : []),
      ],
    );

    const isEnd = videos.length !== 21;
    if (!isEnd) {
      videos.splice(-1, 1);
    }

    Ok(
      ctx,
      {
        end: isEnd,
        results: videos.map(searchResult),
      } satisfies SearchResponse,
    );
  })
  // Get the video of a leaderboard run.
  .get('/mtriggers/search', async (ctx) => {
    const params = ctx.request.url.searchParams;

    const game_dir = params.get('game_dir');
    const map_name = params.get('map_name');
    const board_rank = params.get('board_rank') !== null ? Number(params.get('board_rank')) : NaN;
    const include_pb_of = params.get('include_pb_of');

    if (game_dir === null || map_name === null || isNaN(board_rank)) {
      return Err(ctx, Status.BadRequest, 'Missing game_dir or map_name or invalid board_rank.');
    }

    const [game] = await db.query<Pick<Game, 'game_id'>>(
      `select game_id
         from games
        where game_mod = ?`,
      [
        game_dir,
      ],
    );

    if (!game) {
      return Err(ctx, Status.BadRequest, 'Game not found.');
    }

    const [map] = await db.query<Pick<MapModel, 'map_id'>>(
      `select map_id
         from maps
        where game_id = ?
          and name = ?`,
      [
        game!.game_id,
        map_name,
      ],
    );

    if (!map) {
      return Err(ctx, Status.BadRequest, 'Map not found.');
    }

    type Select = Pick<Video, 'board_changelog_id' | 'board_profile_number' | 'board_rank' | 'demo_metadata'>;

    const mtriggers = include_pb_of !== undefined
      ? await db.query<Select>(
        `(select board_changelog_id
               , board_profile_number
               , board_rank
               , demo_metadata
            from videos
           where map_id = ?
             and board_rank = ?
             and board_changelog_id is not null
             and deleted_at is null
        order by created_at desc
           limit 1
          )
          union
          (select board_changelog_id
                , board_profile_number
                , board_rank
                , demo_metadata
             from videos
            where map_id = ?
              and board_profile_number = ?
              and board_changelog_id is not null
              and deleted_at is null
         order by created_at desc
            limit 1
          )
        `,
        [
          map.map_id,
          board_rank,
          map.map_id,
          include_pb_of,
        ],
      )
      : await db.query<Select>(
        `select board_changelog_id
              , board_profile_number
              , board_rank
              , demo_metadata
           from videos
          where map_id = ?
            and board_rank = ?
            and board_changelog_id is not null
            and deleted_at is null
          order by created_at desc
          limit 1`,
        [
          map.map_id,
          board_rank,
        ],
      );

    type Metdata = {
      segments: DemoMetadata['segments'];
    };

    mtriggers.forEach((mtrigger) => {
      try {
        const metadata = JSON.parse(mtrigger.demo_metadata) as DemoMetadata;
        (mtrigger.demo_metadata as unknown as Metdata) = {
          segments: metadata.segments,
        };
      } catch {
        (mtrigger.demo_metadata as unknown as Metdata) = {
          segments: [],
        };
      }
    });

    Ok(ctx, {
      data: mtriggers,
      count: mtriggers.length,
    });
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
    return Err(ctx, Status.NotImplemented, 'Unable to upgrade.');
  }

  const [version, authToken] = ctx.request.headers.get('sec-websocket-protocol')?.split(', ') ?? [];

  if (version !== AUTORENDER_V1 || authToken === undefined) {
    return Err(ctx, Status.BadRequest, 'Invalid protocol.');
  }

  if (
    !(await bcrypt.compare(
      decodeURIComponent(authToken),
      AUTORENDER_BOT_TOKEN_HASH,
    ))
  ) {
    return Err(ctx, Status.Unauthorized, 'Invalid token.');
  }

  if (discordBot) {
    discordBot.close();
    discordBot = null;
  }

  discordBot = ctx.upgrade();

  discordBot.onopen = () => {
    logger.info('Bot connected');

    discordBot!.send(
      JSON.stringify({
        type: 'config',
        data: {
          maxDemoFileSize: AUTORENDER_MAX_DEMO_FILE_SIZE,
        },
      }),
    );
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
    return Err(ctx, Status.NotImplemented, 'Unable to upgrade.');
  }

  const [version, authToken] = ctx.request.headers.get('sec-websocket-protocol')?.split(', ') ?? [];

  if (version !== AUTORENDER_V1 || authToken === undefined) {
    return Err(ctx, Status.BadRequest, 'Invalid protocol.');
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
    return Err(ctx, Status.Unauthorized, 'Invalid access token.');
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
            if (client) {
              if (!client.gameMods.length) {
                client.gameMods = [...clientGameDirs];
                client.renderQualities = [...clientRenderQualities];
              }
            } else {
              clients.set(clientId, {
                accessTokenId: accessToken.access_token_id,
                gameMods: [...clientGameDirs],
                renderQualities: [...clientRenderQualities],
              });
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
              | 'board_changelog_id'
              | 'created_at'
              | 'file_name'
              | 'demo_requires_repair'
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
                     , board_changelog_id
                     , created_at
                     , file_name
                     , demo_requires_repair
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

            const { demo_required_fix, demo_requires_repair, ...videoPayload } = video;

            const buffer = new Buffer();
            const payload = new TextEncoder().encode(JSON.stringify(videoPayload));
            const length = new Uint8Array(4);
            new DataView(length.buffer).setUint32(0, payload.byteLength);

            await buffer.write(length);
            await buffer.write(payload);

            const getFilePath = demo_required_fix === FixedDemoStatus.Required ? getFixedDemoFilePath : getDemoFilePath;
            const filePath = getFilePath(videoPayload.video_id);

            const file = await Deno.readFile(filePath);

            if (AUTORENDER_RUN_DEMO_REPAIR && demo_requires_repair) {
              try {
                await buffer.write(repairDemo(file));
              } catch (err) {
                logger.error('Error while running demo repair');
                logger.error(err);
              } finally {
                await buffer.write(file);
              }
            } else {
              await buffer.write(file);
            }

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

  ws.onclose = (event) => {
    logger.info(`Client ${clientId} disconnected`, event);
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
  router.get('/storage/videos/:share_id', async (ctx) => {
    const shareId = ctx.params.share_id.endsWith('.mp4') ? ctx.params.share_id.slice(0, -4) : ctx.params.share_id;

    if (!validateShareId(shareId)) {
      await routeToApp(ctx);
      return;
    }

    try {
      const [video] = await db.query<
        Pick<Video, 'video_id' | 'file_name' | 'title' | 'video_size'>
      >(
        `select BIN_TO_UUID(video_id) as video_id
              , file_name
              , title
              , video_size
           from videos
          where share_id = ?`,
        [shareId],
      );

      if (!video) {
        await routeToApp(ctx);
        return;
      }

      const filename = getVideoDownloadFilename(video);

      ctx.response.headers.set('Accept-Ranges', 'bytes');
      ctx.response.headers.set('Content-Disposition', `filename="${encodeURIComponent(filename)}"`);
      ctx.response.headers.set('Cache-Control', 'max-age=0, no-cache, no-store');

      await ctx.send({
        path: `${video.video_id}.mp4`,
        root: Storage.Videos,
        contentTypes: {
          '.mp4': 'video/mp4',
        },
      });
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        await routeToApp(ctx);
      } else {
        logger.error(err);
      }
    }
  });
}

router.get('/storage/demos/:share_id/:fixed(fixed)?', async (ctx) => {
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
router.get('/storage/previews/:share_id', async (ctx) => {
  const { share_id } = ctx.params;

  if (!validateShareId(share_id)) {
    return Err(ctx, Status.BadRequest, 'Invalid share ID.');
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
      return Err(ctx, Status.NotFound, 'File not found.');
    } else {
      logger.error(err);
    }
  }
});
router.get('/storage/thumbnails/:share_id/:small(small)?', async (ctx) => {
  const share_id = ctx.params.share_id!;
  const small = ctx.params.small !== undefined;

  if (!validateShareId(share_id)) {
    return Err(ctx, Status.BadRequest, 'Invalid share ID.');
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
      return Err(ctx, Status.NotFound, 'File not found.');
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

const routeToImages = async (ctx: Context, file: string, contentType: string) => {
  try {
    const image = await Deno.readFile(`./app/assets/images/${file}`);

    ctx.response.headers.set('Cache-Control', 'public, max-age=300');

    Ok(ctx, image, contentType);
  } catch (err) {
    logger.error(err);
    Err(ctx, Status.NotFound, 'File not found.');
  }
};

router.get(
  '/assets/images/:file([\\w]+\\.png)',
  async (ctx) => await routeToImages(ctx, ctx.params.file!, 'image/png'),
);
router.get(
  '/assets/images/:file([\\w]+\\.jpg)',
  async (ctx) => await routeToImages(ctx, ctx.params.file!, 'image/jpeg'),
);
router.get('/assets/js/:file([\\w]+\\.js)', async (ctx) => {
  try {
    const js = await Deno.readFile(`./app/assets/js/${ctx.params.file}`);
    Ok(ctx, js, 'text/javascript');
  } catch (err) {
    logger.error(err);
    Err(ctx, Status.NotFound, 'File not found.');
  }
});
router.get('/assets/(.*)', (ctx) => {
  Err(ctx, Status.NotFound, 'Asset not found :(');
});

router.get('/video.html', useSession, async (ctx) => {
  const changelogId = ctx.request.url.searchParams.get('v') ?? '';
  if (!changelogId.length || parseInt(changelogId, 10).toString() !== changelogId) {
    return Err(ctx, Status.BadRequest, 'Invalid v parameter.');
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
    if (!ctx.state.session.get('user') || !hasPermission(ctx, UserPermissions.RerenderVideos)) {
      return Err(ctx, Status.NotFound, 'Video not found.');
    }

    const [entry] = await getChangelog({ id: parseInt(changelogId) }) ?? [];
    if (!entry) {
      return Err(ctx, Status.NotFound, 'Unable to fetch changelog entry.');
    }

    const shareId = await insertVideo(entry);
    if (!shareId) {
      return Err(ctx, Status.NotFound, 'Unable to create video.');
    }

    ctx.response.redirect(`/videos/${shareId}`);
    return;
  }

  ctx.response.redirect(`/videos/${video.share_id}`);
});
router.get('/favicon.ico', async (ctx) => {
  try {
    const image = await Deno.readFile('./app/assets/images/favicon.ico');
    Ok(ctx, image, 'image/x-icon');
  } catch (err) {
    logger.error(err);
    Err(ctx, Status.NotFound, 'File not found.');
  }
});

router.post('/tokens/:access_token_id(\\d+)', useSession, routeToApp);
router.post('/tokens/:access_token_id(\\d+/delete)', useSession, routeToApp);
router.post('/tokens/new', useSession, routeToApp);
router.post('/tokens/test', async (ctx) => {
  if (!ctx.request.hasBody) {
    return Err(ctx, Status.BadRequest, 'Missing body.');
  }

  const body = await ctx.request.body({ type: 'json' }).value;
  if (!body?.token_key) {
    return Err(ctx, Status.BadRequest, 'Missing token_key.');
  }

  const [accessToken] = await db.query(
    `select 1
       from access_tokens
      where token_key = ?`,
    [body?.token_key],
  );

  if (!accessToken) {
    return Err(ctx, Status.Unauthorized, 'Invalid access token.');
  }

  Ok(ctx);
});
router.get('/(.*)', useSession, routeToApp);

type AppState = {
  session: Session & { get(key: 'user'): User | undefined };
};

const app = new Application<AppState>({
  proxy: true,
  logErrors: false,
});

const noisyErrors = [
  'Http: connection error: Connection reset by peer',
  'Http: error writing a body to connection: Connection reset by peer',
  'Http: error writing a body to connection: Broken pipe',
  'Http: connection closed before message completed',
  'TypeError: cannot read headers: request closed',
  'BadResource: Bad resource ID',
];

app.addEventListener('error', (ev) => {
  try {
    const message = ev.error?.toString() ?? '';

    if (noisyErrors.some((noise) => message.startsWith(noise))) {
      return;
    }

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
