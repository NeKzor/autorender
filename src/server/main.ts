/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The server is mostly responsible for:
 *    - Handling incoming websocket messages from the Discord bot
 *    - Handling incoming websocket messages from clients
 *    - Serving the web platform (`/app`)
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { join } from 'https://deno.land/std@0.190.0/path/mod.ts';
import * as uuid from 'https://deno.land/std@0.192.0/uuid/mod.ts';
import {
  Application,
  Context,
  CookiesSetDeleteOptions,
  Middleware,
  Router,
  Status,
  STATUS_TEXT,
} from 'https://deno.land/x/oak@v12.2.0/mod.ts';
import { ResponseBody, ResponseBodyFunction } from 'https://deno.land/x/oak@v12.2.0/response.ts';
import { CookieStore, Session } from 'https://deno.land/x/oak_sessions@v4.1.4/mod.ts';
import { MapStore, RateLimiter } from 'https://deno.land/x/oak_rate_limit@v0.1.1/mod.ts';
import { oakCors } from 'https://deno.land/x/cors@v1.2.2/mod.ts';
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
  PendingStatus,
  RenderQuality,
  User,
  UserPermissions,
  Video,
} from './models.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';
import * as _bcrypt_worker from 'https://deno.land/x/bcrypt@v0.4.1/src/worker.ts';
import { Buffer } from 'https://deno.land/std@0.190.0/io/buffer.ts';
import { AppState as ReactAppState } from './app/AppState.ts';
import { db } from './db.ts';
import { createStaticRouter } from 'https://esm.sh/react-router-dom@6.11.2/server';
import { createFetchRequest, RequestContext, routeHandler, routes } from './app/Routes.ts';
import { getDemoInfo } from './demo.ts';
import { basename } from 'https://deno.land/std@0.190.0/path/win32.ts';
import { generateShareId, validateShareId } from './utils.ts';

const SERVER_HOST = Deno.env.get('SERVER_HOST')!;
const SERVER_PORT = parseInt(Deno.env.get('SERVER_PORT')!, 10);
const SERVER_SSL_CERT = Deno.env.get('SERVER_SSL_CERT')!;
const SERVER_SSL_KEY = Deno.env.get('SERVER_SSL_KEY')!;
const IS_HTTPS = SERVER_SSL_CERT !== 'none' && SERVER_SSL_KEY !== 'none';
// FIXME: Clients are not well prepared to handle multiple videos at once
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
const AUTORENDER_BOARD_TOKEN_HASH = (() => {
  const boardToken = Deno.env.get('AUTORENDER_BOARD_TOKEN')!;
  return boardToken !== 'none' ? bcrypt.hashSync(boardToken) : null;
})();
const AUTORENDER_DEMOS_FOLDER = Deno.env.get('AUTORENDER_DEMOS_FOLDER')!;
const AUTORENDER_FILES_FOLDER = Deno.env.get('AUTORENDER_FILES_FOLDER')!;
const AUTORENDER_VIDEOS_FOLDER = Deno.env.get('AUTORENDER_VIDEOS_FOLDER')!;
const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;
const AUTORENDER_MAX_VIDEO_FILE_SIZE = 150_000_000;
const B2_ENABLED = Deno.env.get('B2_ENABLED')!.toLowerCase() === 'true';
const B2_BUCKET_ID = Deno.env.get('B2_BUCKET_ID')!;

const getDemoFilePath = (videoId: string) => join(AUTORENDER_DEMOS_FOLDER, `${videoId}.dem`);
const getFixedDemoFilePath = (videoId: string) => join(AUTORENDER_DEMOS_FOLDER, `${videoId}_fixed.dem`);
const getStorageFilePath = (filename: string) => join(AUTORENDER_FILES_FOLDER, filename);
const getVideoFilePath = (videoId: string) => join(AUTORENDER_VIDEOS_FOLDER, `${videoId}.mp4`);

const cookieOptions: CookiesSetDeleteOptions = {
  expires: new Date(Date.now() + 86_400_000 * 30),
  sameSite: 'lax',
  secure: IS_HTTPS,
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

const useRateLimiter = await RateLimiter({
  store: new MapStore(),
  windowMs: 1000,
  max: 10,
});

let discordBot: WebSocket | null = null;

const _sendErrorToBot = (error: {
  status: number;
  message: string;
  requested_by_id: string;
  requested_in_guild_id: string;
  requested_in_channel_id: string;
}) => {
  if (discordBot && discordBot.readyState === WebSocket.OPEN) {
    discordBot.send(JSON.stringify({ type: 'error', data: error }));
  } else {
    logger.warn('Bot not connected. Failed to send error status.', error);
  }
};

const b2 = new BackblazeClient({ userAgent: AUTORENDER_V1 });

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

await logger.initFileLogger('log/server', {
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
        if (!AUTORENDER_BOARD_TOKEN_HASH) {
          return Err(ctx, Status.Unauthorized);
        }

        if (
          !(await bcrypt.compare(
            decodedAuthToken,
            AUTORENDER_BOARD_TOKEN_HASH,
          ))
        ) {
          return Err(ctx, Status.Unauthorized);
        }
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
      outPath: AUTORENDER_DEMOS_FOLDER,
      maxFileSize: AUTORENDER_MAX_DEMO_FILE_SIZE,
    });

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
    //    * Should we save map data in the database?

    const demoInfo = await getDemoInfo(filePath);

    if (demoInfo === null || typeof demoInfo === 'string') {
      return Err(ctx, Status.BadRequest, demoInfo ?? undefined);
    }

    if (demoInfo.isWorkshopMap && !demoInfo.fileUrl) {
      logger.error(`Failed to resolve workshop map`);
      return Err(ctx, Status.InternalServerError);
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
    const renderOptions = data.fields.render_options ?? null;
    const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;

    const fields = [
      videoId,
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
      renderOptions,
      file.originalName,
      demoInfo.fileUrl,
      demoInfo.fullMapName,
      demoInfo.size,
      demoInfo.mapCrc,
      demoInfo.gameDir,
      demoInfo.playbackTime,
      requiredDemoFix,
      PendingStatus.RequiresRender,
    ];

    await db.execute(
      `insert into videos (
            video_id
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
          , pending
        ) values (UUID_TO_BIN(?), ${new Array(fields.length - 1).fill('?').join(',')})`,
      fields,
    );

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
      outPath: AUTORENDER_VIDEOS_FOLDER,
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

    const [video] = await db.query<Video>(
      `select *
            , BIN_TO_UUID(video_id) as video_id
         from videos
        where video_id = UUID_TO_BIN(?)
          and pending = ?`,
      [data.fields.video_id, PendingStatus.StartedRender],
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
        });

        videoUrl = b2.getDownloadUrl(upload.fileName);

        logger.info('Uploaded', upload, videoUrl);
      } else {
        videoUrl = `${AUTORENDER_PUBLIC_URI}/storage/videos/${video.share_id}`;
      }

      // TODO: Determine video length, create video preview and
      //       small/large thumbnails in a different thread.

      await db.execute(
        `update videos
            set pending = ?
              , video_url = ?
              , video_size = ?
              , rendered_at = current_timestamp()
           where video_id = UUID_TO_BIN(?)
             and pending = ?`,
        [
          PendingStatus.FinishedRender,
          videoUrl,
          fileContents.byteLength,
          video.video_id,
          PendingStatus.StartedRender,
        ],
      );

      Ok(ctx, { video_id: video.video_id });

      try {
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
          logger.warn(
            `Bot not connected. Failed to send upload message for ${discordBot}.`,
            uploadMessage,
          );
        }
      } catch (err) {
        logger.error(err);
      }
    } catch (err) {
      logger.error(err);

      Err(ctx, Status.InternalServerError);

      try {
        await db.execute(
          `update videos
              set pending = ?
             where video_id = UUID_TO_BIN(?)
               and pending = ?`,
          [
            PendingStatus.FinishedRender,
            video.video_id,
            PendingStatus.StartedRender,
          ],
        );
      } catch (err) {
        logger.error(err);
      }
    } finally {
      if (B2_ENABLED) {
        try {
          Deno.remove(filePath);
        } catch (err) {
          logger.error('Failed to remove video file:', err);
        }
      }
    }
  })
  // Get video views and increment.
  // deno-lint-ignore no-explicit-any
  .post('/videos/:share_id/views', useRateLimiter as any, async (ctx) => {
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
  .get('/(.*)', (ctx) => {
    Err(ctx, Status.NotFound, 'Route not found :(');
  });

const router = new Router<AppState>();

const isHotReloadEnabled = Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true';
if (isHotReloadEnabled) {
  let reload = true;

  router.get('/__hot_reload', (ctx) => {
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

    logger.error('Bot connection error', isErrorEvent ? event.error ?? event : event);
  };
});

// Client connections.

interface ClientState {
  demosToSend: number; // TODO: I don't think this is ever needed.
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
      demosToSend: MAX_VIDEOS_PER_REQUEST,
    });
  };

  ws.onmessage = async (message) => {
    try {
      if (typeof message.data !== 'string') {
        throw new Error('Invalid payload data type');
      }

      // FIXME: Protocol types
      const { type, data } = JSON.parse(message.data);

      switch (type) {
        case 'videos': {
          if (accessToken.permissions & AccessPermission.CreateVideos) {
            // TODO: Filter by game mod

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
             order by render_quality desc
                limit ?`,
              [
                PendingStatus.RequiresRender,
                ...clientRenderQualities,
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
                PendingStatus.StartedRender,
                accessToken.user_id,
                accessToken.access_token_id,
                accessToken.token_name,
                videoId,
                PendingStatus.RequiresRender,
              ],
            );

            if (update.affectedRows === 0) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: {
                    status: Status.NotFound,
                    message: 'Update failed.',
                  },
                }),
              );
              break;
            }

            type VideoSelect = Pick<
              Video,
              | 'video_id'
              | 'render_quality'
              | 'render_options'
              | 'file_url'
              | 'full_map_name'
              | 'demo_playback_time'
              | 'demo_required_fix'
            >;

            const [selectedVideo] = await db.query<VideoSelect>(
              `select BIN_TO_UUID(video_id) as video_id
                     , render_quality
                     , render_options
                     , file_url
                     , full_map_name
                     , demo_playback_time
                     , demo_required_fix
                  from videos
                 where video_id = UUID_TO_BIN(?)`,
              [videoId],
            );

            if (!selectedVideo) {
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

            const { demo_required_fix, ...video } = selectedVideo;

            const buffer = new Buffer();
            const payload = new TextEncoder().encode(JSON.stringify(video));
            const length = new Uint8Array(4);
            new DataView(length.buffer).setUint32(0, payload.byteLength);

            await buffer.write(length);
            await buffer.write(payload);

            const getFilePath = demo_required_fix === FixedDemoStatus.Required ? getFixedDemoFilePath : getDemoFilePath;

            const filePath = getFilePath(video.video_id);
            await buffer.write(await Deno.readFile(filePath));

            ws.send(buffer.bytes());
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
          const downloaded = data as { video_ids: Video['video_id'][] };
          const videoIds = downloaded.video_ids.slice(
            0,
            MAX_VIDEOS_PER_REQUEST,
          );

          if (
            !videoIds.length ||
            downloaded.video_ids.length > MAX_VIDEOS_PER_REQUEST
          ) {
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

          // For all videos which did not come back here mark them as finished.

          const failedVideos = await db.query<Video>(
            `select *
                    , BIN_TO_UUID(video_id) as video_id
                 from videos
                where pending = ?
                  and rendered_by_token = ?
                  and video_id not in (${videoIds.map(() => `UUID_TO_BIN(?)`).join(',')})`,
            [
              PendingStatus.StartedRender,
              accessToken.access_token_id,
              ...videoIds,
            ],
          );

          for (const video of failedVideos) {
            await db.execute(
              `update videos
                    set pending = ?
                  where video_id = UUID_TO_BIN(?)`,
              [
                PendingStatus.FinishedRender,
                video.video_id,
              ],
            );

            // sendErrorToBot({
            //   status: Status.InternalServerError,
            //   message: `Failed to render video "${video.title}".`,
            //   requested_by_id: video.requested_by_id,
            //   requested_in_guild_id: video.requested_in_guild_id,
            //   requested_in_channel_id: video.requested_in_channel_id,
            // });
          }

          ws.send(
            JSON.stringify({
              type: 'start',
            }),
          );
          break;
        }
        case 'error': {
          const { video_id } = data as {
            video_id: Video['video_id'] | undefined;
            message: string;
          };

          if (video_id) {
            await db.execute(
              `update videos
                    set pending = ?
                  where video_id = UUID_TO_BIN(?)`,
              [
                PendingStatus.FinishedRender,
                video_id,
              ],
            );
          }
          break;
        }
        default: {
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
      logger.error(err);

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

    logger.error(`Client ${clientId} connection error`, isErrorEvent ? event.error ?? event : event);
  };
});

router.get('/login/discord/authorize', useSession, async (ctx) => {
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
        'User-Agent': AUTORENDER_V1,
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
    },
  });

  const discordUser = (await usersResponse.json()) as DiscordUser;

  const [authUser] = await db.query<Pick<User, 'user_id'>>(
    `select user_id from users where discord_id = ?`,
    [discordUser.id],
  );

  if (authUser?.user_id) {
    await db.execute(
      `update users set username = ?, discord_avatar = ? where user_id = ?`,
      [
        discordUser.discriminator !== '0'
          ? `${discordUser.username}#${discordUser.discriminator}`
          : discordUser.username,
        discordUser.avatar,
        authUser.user_id,
      ],
    );
  } else {
    await db.execute(
      `insert into users (
            username
          , discord_id
          , discord_avatar
          , permissions
        ) values (
            ?
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

  const requestContext: RequestContext = {
    user,
    db,
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

    const [_, loadersData] = Object.entries(context.loaderData).find(
      ([id]) => id === match.route.id,
    ) ?? [];

    if (loadersData === undefined) {
      return {};
    }

    return matchedRoute.meta(loadersData);
  })();

  const initialState: ReactAppState = {
    user,
    meta,
    domain: SERVER_DOMAIN,
    discordAuthorizeLink: DISCORD_AUTHORIZE_LINK,
  };

  const router = createStaticRouter(routeHandler.dataRoutes, context);

  ctx.response.body = await index(router, context, initialState);
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

      const filename = video.title === video.file_name ? `${video.file_name} Video.mp4` : `${video.title}.mp4`;

      ctx.response.headers.set(
        'Content-Disposition',
        `filename="${
          filename
            .replaceAll('\\', '\\\\')
            .replaceAll('"', '\\"')
        }"`,
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

      const filename = video.title === video.file_name ? `${video.file_name} Video.mp4` : `${video.title}.mp4`;

      ctx.response.headers.set(
        'Content-Disposition',
        `filename="${
          filename
            .replaceAll('\\', '\\\\')
            .replaceAll('"', '\\"')
        }"`,
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
    const [video] = await db.query<Pick<Video, 'video_id' | 'file_name'>>(
      `select BIN_TO_UUID(video_id) as video_id
          , file_name
       from videos
      where share_id = ?`,
      [ctx.params.share_id],
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
router.get('/storage/files/autorender.cfg', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('autorender.cfg')), 'text/plain');
});
router.get('/storage/files/quickhud.zip', async (ctx) => {
  Ok(ctx, await Deno.readFile(getStorageFilePath('quickhud.zip')), 'application/zip');
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

const app = new Application<AppState>();

app.addEventListener('error', (ev) => {
  try {
    logger.error(ev.error);
  } catch (err) {
    console.error('This should not happen!', err, ev?.error);
  }
});

app.use(oakCors());
app.use(async (ctx, next) => {
  const url = ctx.request.url;
  const ua = ctx.request.headers.get('user-agent')?.replace(/[\n\r]/g, '') ??
    '';
  const ip = ctx.request.headers.get('x-real-ip') ?? ctx.request.ip;
  logger.info(`${url} : ${ip} : ${ua}`);
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

logger.info(`Server listening at http://${SERVER_HOST}:${SERVER_PORT}`);

await app.listen(
  SERVER_SSL_CERT !== 'none' && SERVER_SSL_KEY !== 'none'
    ? {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      secure: true,
      cert: SERVER_SSL_CERT,
      key: SERVER_SSL_KEY,
      alpnProtocols: ['h2', 'http/1.1'],
    }
    : {
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      secure: false,
    },
);
