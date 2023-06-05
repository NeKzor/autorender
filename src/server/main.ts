/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import "https://deno.land/std@0.190.0/dotenv/load.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  Application,
  Context,
  CookiesSetDeleteOptions,
  Middleware,
  Router,
  Status,
} from "https://deno.land/x/oak@v12.2.0/mod.ts";
import {
  ResponseBody,
  ResponseBodyFunction,
} from "https://deno.land/x/oak@v12.2.0/response.ts";
import {
  CookieStore,
  Session,
} from "https://deno.land/x/oak_sessions@v4.1.4/mod.ts";
import {
  RateLimiter,
  MapStore,
} from "https://deno.land/x/oak_rate_limit@v0.1.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { logger } from "./logger.ts";
import { index } from "./app/index.tsx";
import b2CloudStorage from "npm:b2-cloud-storage";
import {
  AccessPermission,
  AccessToken,
  PendingStatus,
  Video,
  DiscordUser,
  UserPermissions,
  User,
  AuditType,
  AuditSource,
} from "./models.ts";
import { basename, join } from "https://deno.land/std@0.190.0/path/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import * as _bcrypt_worker from "https://deno.land/x/bcrypt@v0.4.1/src/worker.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";
import { AppState as ReactAppState } from "./app/AppState.ts";
import { db } from "./db.ts";
import {
  createStaticRouter,
} from "https://esm.sh/react-router-dom@6.11.2/server";
import { RequestContext, createFetchRequest, routeHandler, routes } from "./app/Routes.ts";

const SERVER_HOST = Deno.env.get("SERVER_HOST") ?? "127.0.0.1";
const SERVER_PORT = parseInt(Deno.env.get("SERVER_PORT") ?? "8001", 10);
const SERVER_SSL_CERT = Deno.env.get("SERVER_SSL_CERT");
const SERVER_SSL_KEY = Deno.env.get("SERVER_SSL_KEY");
const IS_HTTPS = SERVER_SSL_CERT !== "none" && SERVER_SSL_KEY !== "none";
const MAX_VIDEOS_PER_REQUEST = 3;
const AUTORENDER_V1 = "autorender-v1";
const DISCORD_AUTHORIZE_LINK = (() => {
  const url = new URLSearchParams();
  url.set("client_id", Deno.env.get("DISCORD_CLIENT_ID") ?? "");
  url.set("redirect_uri", Deno.env.get("DISCORD_REDIRECT_URI") ?? "");
  url.set("response_type", "code");
  url.set("scope", "identify");
  return `https://discord.com/api/oauth2/authorize?${url.toString()}`;
})();
const BOT_AUTH_TOKEN_HASH = await bcrypt.hash(
  Deno.env.get("BOT_AUTH_TOKEN") ?? ""
);

const cookieOptions: CookiesSetDeleteOptions = {
  expires: new Date(Date.now() + 86400000 * 30),
  sameSite: "lax",
  secure: IS_HTTPS,
};

const store = new CookieStore(Deno.env.get("COOKIE_SECRET_KEY") ?? "", {
  cookieSetDeleteOptions: cookieOptions,
});
const useSession = Session.initMiddleware(store, {
  cookieSetOptions: cookieOptions,
});

const requiresAuth: Middleware<AppState> = (ctx) => {
  if (!ctx.state.session.get("user")) {
    return ctx.throw(Status.Unauthorized);
  }
};

const useRateLimiter = await RateLimiter({
  store: new MapStore(),
  windowMs: 1000,
  max: 10,
});

let discordBot: WebSocket | null = null;

const b2 = new b2CloudStorage({
  auth: {
    accountId: Deno.env.get("B2_KEY_ID") ?? "",
    applicationKey: Deno.env.get("B2_APP_KEY") ?? "",
  },
});

// b2.authorize((err: Error) => {
//   if (err) throw err;
//   console.log("Logged into b2");
// });

await logger.initFileLogger("log/server", {
  rotate: true,
  maxBytes: 10 * 1024,
  maxBackupCount: 7,
});

const hasPermission = (ctx: Context, permission: UserPermissions) => {
  return ctx.state.session.get("user").permissions & permission;
};

const Ok = (
  ctx: Context,
  body: ResponseBody | ResponseBodyFunction,
  type?: string
) => {
  ctx.response.status = Status.OK;
  ctx.response.type = type ?? "application/json";
  ctx.response.body = body ?? {};
};

const Err = (ctx: Context, status: Status, message: string) => {
  ctx.response.status = status;
  ctx.response.type = "application/json";
  ctx.response.body = { status, message };
};

const apiV1 = new Router<AppState>();

apiV1
  // Incoming render request containing the demo file.
  .put("/videos/render", async (ctx) => {
    const authUser = ctx.state.session.get("user");

    if (authUser) {
      if (!hasPermission(ctx, UserPermissions.CreateVideos)) {
        return ctx.throw(Status.Unauthorized);
      }
    } else {
      const [authType, authToken] = (
        ctx.request.headers.get("Authorization") ?? ""
      ).split(" ");

      if (authType !== "Bearer") {
        return ctx.throw(Status.BadRequest);
      }

      if (!(await bcrypt.compare(authToken, BOT_AUTH_TOKEN_HASH))) {
        return ctx.throw(Status.Unauthorized);
      }
    }

    if (!ctx.request.hasBody) {
      return ctx.throw(Status.UnsupportedMediaType);
    }

    const body = ctx.request.body({ type: "form-data" });
    const data = await body.value.read({
      customContentTypes: {
        "application/octet-stream": "dem",
      },
      outPath: "./demos",
    });

    const requestedByName = authUser
      ? authUser.username
      : data.fields.requested_by_name;
    const requestedById = authUser
      ? authUser.discord_id
      : data.fields.requested_by_id;

    const file = data.files?.at(0);
    if (!file?.filename) {
      return ctx.throw(Status.BadRequest);
    }

    const filePath = join("./demos", basename(file.filename));
    await Deno.copyFile(file.filename, filePath);

    const result = await db.execute(
      `insert into videos (
            title
          , comment
          , requested_by_name
          , requested_by_id
          , render_options
          , file_name
          , file_path
          , pending
        ) values (
            ?
          , ?
          , ?
          , ?
          , ?
          , ?
          , ?
          , ?
        )`,
      [
        data.fields.title,
        data.fields.comment,
        requestedByName,
        requestedById,
        data.fields.render_options,
        file.originalName,
        filePath,
        PendingStatus.RequiresRender,
      ]
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
        `Created new video ${result.lastInsertId} for Discord user ${requestedByName}`,
        AuditType.Info,
        AuditSource.User,
        authUser?.user_id ?? null,
      ]
    );

    Ok(ctx, { inserted: result.affectedRows });
  })
  // Get video views and increment.
  // deno-lint-ignore no-explicit-any
  .post("/videos/:video_id(\\d+)/views", useRateLimiter as any, async (ctx) => {
    const { rows } = await db.execute(
      `select video_id, views from videos where video_id = ?`,
      [Number(ctx.params.video_id)]
    );

    const video = rows?.at(0) as Video | undefined;
    if (!video) {
      return ctx.throw(Status.NotFound);
    }

    await db.execute(`update videos set views = views + 1 where video_id = ?`, [
      video.video_id,
    ]);

    Ok(ctx, video);
  })
  // Create a new access token for a client application.
  .post("/application/new", requiresAuth, async (ctx) => {
    if (!hasPermission(ctx, UserPermissions.CreateTokens)) {
      return ctx.throw(Status.Unauthorized);
    }

    const userId = ctx.state.session.get("user")!.user_id;

    const { token_name } = ctx.request.body({
      type: "json",
    }).value as any;

    const inserted = await db.execute(
      `insert into access_tokens (
          user_id
        , token_name
        , token_key
        , permissions
      ) values (
          ?
        , ?
        , ?
        , ?
      )`,
      [
        userId,
        token_name,
        await bcrypt.hash(crypto.randomUUID()),
        AccessPermission.CreateVideos | AccessPermission.WriteVideos,
      ]
    );

    const { rows } = await db.execute<AccessToken>(
      `select * from access_tokens where access_token_id = ?`,
      [inserted.lastInsertId]
    );
    const accessToken = rows?.at(0);

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
        `Created access token ${accessToken!.access_token_id} for user ${userId}`,
        AuditType.Info,
        AuditSource.User,
        userId,
      ]
    );

    Ok(ctx, accessToken);
  })
  .get("/(.*)", (ctx) => {
    Err(ctx, Status.NotFound, "Route not found :(");
  });

const router = new Router<AppState>();

const isHotReloadEnabled = Deno.env.get("HOT_RELOAD")?.toLowerCase() === "yes";
if (isHotReloadEnabled) {
  let reload = true;

  router.get("/__hot_reload", (ctx) => {
    if (ctx.isUpgradable) {
      const ws = ctx.upgrade();
      ws.onmessage = () => {
        ws.send(reload ? "yes" : "no");
        reload = false;
      };
    }
  });
}

// Web API routes.

router.use("/api/v1", apiV1.routes());

// Discord bot connection.

router.get("/connect/bot", async (ctx) => {
  if (!ctx.isUpgradable) {
    return ctx.throw(Status.NotImplemented);
  }

  const [version, authToken] =
    ctx.request.headers.get("sec-websocket-protocol")?.split(", ") ?? [];

  if (version !== AUTORENDER_V1) {
    return ctx.throw(Status.NotAcceptable);
  }

  if (!(await bcrypt.compare(authToken, BOT_AUTH_TOKEN_HASH))) {
    return ctx.throw(Status.Unauthorized);
  }

  if (discordBot) {
    discordBot.close();
  }

  discordBot = ctx.upgrade();

  discordBot.onopen = () => {
    console.log("Bot connected");
  };

  discordBot.onmessage = (message) => {
    console.log("Bot:", message.data);

    const { type } = JSON.parse(message.data);

    switch (type) {
      case "status": {
        discordBot?.send(JSON.stringify({ type: "response", data: "ok" }));
        break;
      }
      default: {
        discordBot?.send(
          JSON.stringify({
            type: "error",
            data: { status: Status.BadRequest },
          })
        );
      }
    }
  };

  discordBot.onclose = () => {
    console.log("Bot disconnected");
    discordBot = null;
  };
});

// Client connections.

interface ClientState {
  demosToSend: number;
}

const clients = new Map<string, ClientState>();

router.get("/connect/client", async (ctx) => {
  if (!ctx.isUpgradable) {
    return ctx.throw(Status.NotImplemented);
  }

  const [version, authToken] =
    ctx.request.headers.get("sec-websocket-protocol")?.split(", ") ?? [];

  if (version !== AUTORENDER_V1) {
    return ctx.throw(Status.NotAcceptable);
  }

  const authTokenHash = await bcrypt.hash(authToken);
  const { rows } = await db.execute(
    `select permissions from access_tokens where token = ?`,
    [authTokenHash]
  );
  const accessToken = rows?.at(0) as AccessToken | undefined;

  if (!accessToken) {
    return ctx.throw(Status.Unauthorized);
  }

  const clientId = `${accessToken.user_id}-${accessToken.token_name}`;
  const ws = ctx.upgrade();

  ws.onopen = () => {
    console.log("Client connected");

    clients.set(clientId, {
      demosToSend: MAX_VIDEOS_PER_REQUEST,
    });
  };

  ws.onmessage = async (message) => {
    console.log("Client:", message.data);

    try {
      if (message.data instanceof Blob) {
        const buffer = await message.data.arrayBuffer();
        const view = new DataView(buffer, 0);
        const videoId = view.getBigUint64(0);

        const { rows } = await db.execute(
          `select * from videos where video_id = ?`,
          [Number(videoId)]
        );

        const video = rows?.at(0) as Video | undefined;
        if (!video) {
          return ws.send(
            JSON.stringify({ type: "error", data: { status: Status.NotFound } })
          );
        }

        const tempFile = await Deno.makeTempFile({
          prefix: `video-${video.video_id}-`,
        });
        await Deno.writeFile(tempFile, new Uint8Array(buffer.slice(8)));

        try {
          const results = await new Promise((resolve, reject) => {
            b2.uploadFile(
              tempFile,
              {
                bucketId: "p2render",
                fileName: `${video.video_id}.mp4`,
                contentType: "application/octet-stream",
                onUploadProgress: (update: {
                  percent: number;
                  bytesCopied: number;
                  bytesTotal: number;
                  bytesDispatched: number;
                }) => {
                  console.log(
                    `Uploading ${tempFile} - ${update.percent}% (${update.bytesDispatched}/${update.bytesTotal}`
                  );
                },
              },
              (err: Error, results: unknown) => {
                if (err) {
                  reject(err);
                } else {
                  resolve(results);
                }
              }
            );
          });

          console.log({ results });

          // TODO: update links
          // TODO: thumbnail

          await db.execute(
            `update videos
             set pending = ?
             , video_url = ?
             , thumb_url = ?
             , rendered_at = current_timestamp()
             where video_id = ?`,
            [PendingStatus.FinishedRender, "", "", video.video_id]
          );

          if (discordBot) {
            const notification = {
              video_id: video.video_id,
              title: video.title,
              requested_by_id: video.requested_by_id,
            };

            discordBot.send(
              JSON.stringify({ type: "upload", data: notification })
            );
          }

          ws.send(
            JSON.stringify({
              type: "finish",
              data: { video_id: video.video_id },
            })
          );
        } catch (err) {
          console.error(err);

          ws.send(
            JSON.stringify({
              type: "error",
              data: { status: Status.InternalServerError },
            })
          );
        } finally {
          try {
            Deno.remove(tempFile);
          } catch (err) {
            console.error("failed to remove temporary file:", err.toString());
          }
        }
      } else {
        const { type, data } = JSON.parse(message.data);

        switch (type) {
          case "videos": {
            if (accessToken.permissions & AccessPermission.CreateVideos) {
              const { rows } = await db.execute(
                `select video_id from videos where pending = ? limit ?`,
                [PendingStatus.RequiresRender, MAX_VIDEOS_PER_REQUEST]
              );

              const videos = rows ?? [];
              ws.send(JSON.stringify({ type: "videos", data: videos }));

              clients.set(clientId, {
                demosToSend: videos.length,
              });
            }
            break;
          }
          case "demo": {
            if (accessToken.permissions & AccessPermission.WriteVideos) {
              const videoId = Number(data.video_id);

              const updated = await db.execute(
                `update videos
                 set pending = ?
                   , rendered_by = ?
                   , render_node = ?
                 where video_id = ?
                   and pending = ?`,
                [
                  PendingStatus.StartedRender,
                  accessToken.user_id,
                  accessToken.token_name,
                  videoId,
                  PendingStatus.RequiresRender,
                ]
              );

              if (updated.affectedRows !== 0) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    data: { status: Status.NotFound },
                  })
                );
                break;
              }

              const { rows } = await db.execute(
                `select file_path from videos where video_id = ?`,
                [videoId]
              );

              const video = rows?.at(0) as Video | undefined;
              if (!video) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    data: { status: Status.NotFound },
                  })
                );
                break;
              }

              const buffer = new Buffer();
              const payload = new TextEncoder().encode(JSON.stringify(video));
              const length = new Uint8Array(4);
              new DataView(length).setUint32(0, payload.byteLength);

              await buffer.write(length);
              await buffer.write(payload);
              await buffer.write(await Deno.readFile(video.file_path));

              ws.send(buffer.bytes());
            }
            break;
          }
          case "error": {
            // TODO: handle error case
            break;
          }
          default: {
            return ws.send(
              JSON.stringify({
                type: "error",
                data: { status: Status.BadRequest },
              })
            );
          }
        }

        if (type === "video") {
          const state = clients.get(clientId);
          if (state) {
            state.demosToSend -= 1;

            if (state.demosToSend <= 0) {
              ws.send("start");
            }
          }
        }
      }
    } catch (err) {
      console.error(err);

      return ws.send(
        JSON.stringify({
          type: "error",
          data: { status: Status.InternalServerError },
        })
      );
    }
  };

  ws.onclose = () => {
    console.log("Client disconnected");
    clients.delete(clientId);
  };
});

router.get("/login/discord/authorize", useSession, async (ctx) => {
  const code = ctx.request.url.searchParams.get("code");
  if (!code) {
    //return ctx.throw(Status.BadRequest);
    return ctx.response.redirect("/");
  }

  // Discord OAuth2
  //    https://discord.com/developers/docs/topics/oauth2#authorization-code-grant

  const data = {
    grant_type: "authorization_code",
    client_id: Deno.env.get("DISCORD_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("DISCORD_CLIENT_SECRET") ?? "",
    code,
    redirect_uri: Deno.env.get("DISCORD_REDIRECT_URI") ?? "",
  };

  const oauthResponse = await fetch(
    "https://discord.com/api/v10/oauth2/token",
    {
      method: "POST",
      headers: {
        "User-Agent": AUTORENDER_V1,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: Object.entries(data)
        .map(
          ([key, value]) =>
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
        )
        .join("&"),
    }
  );

  if (!oauthResponse.ok) {
    //return ctx.throw(Status.Unauthorized);
    return ctx.response.redirect("/");
  }

  const { access_token } = await oauthResponse.json();

  // Fetch user data:
  //    https://discord.com/developers/docs/resources/user#get-current-user

  const usersResponse = await fetch("https://discord.com/api/users/@me", {
    headers: {
      authorization: `Bearer ${access_token}`,
    },
  });

  const discordUser = (await usersResponse.json()) as DiscordUser;

  const { rows } = await db.execute<User>(
    `select * from users where discord_id = ?`,
    [discordUser.id]
  );

  let user = rows?.at(0);
  if (!user) {
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
        `${discordUser.username}#${discordUser.discriminator}`, // TODO: fix this once hte new username system rolls out
        discordUser.id,
        discordUser.avatar,
        UserPermissions.ListVideos,
      ]
    );

    const { rows } = await db.execute<User>(
      `select * from users where discord_id = ?`,
      [discordUser.id]
    );
    user = rows?.at(0);
  }

  if (!user) {
    //return ctx.throw(Status.InternalServerError);
    return ctx.response.redirect("/");
  }

  ctx.state.session.set("user", user);
  ctx.response.redirect("/");
});
router.get("/users/@me", useSession, requiresAuth, (ctx) => {
  Ok(ctx, ctx.state.session.get("user"));
});
router.get("/users/:user_id(\\+d)", useSession, requiresAuth, async (ctx) => {
  const { rows } = await db.execute(`select * from users where user_id = ?`, [
    Number(ctx.params.user_id),
  ]);

  const user = rows?.at(0);
  if (!user) {
    return ctx.throw(Status.NotFound);
  }

  Ok(ctx, user);
});
router.get("/logout", useSession, async (ctx) => {
  await ctx.state.session.deleteSession();
  await ctx.cookies.delete("session");
  await ctx.cookies.delete("session_data");
  ctx.response.redirect("/");
});

const routeToApp = async (ctx: Context) => {
  const request = await createFetchRequest(ctx.request);
  const user = ctx.state.session.get("user") ?? null;

  const requestContext: RequestContext = {
    user,
    db,
  };

  const context = await routeHandler.query(request, { requestContext });

  if (context instanceof Response) {
    const location = context.headers.get("Location") ?? "/";
    ctx.response.status = context.status;
    return ctx.response.redirect(location);
  }

  const matchedPath = context.matches.at(0)?.route?.path;
  const matchedRoute = routes.find((route) => route.path === matchedPath);
  const meta =  matchedRoute?.meta ? matchedRoute.meta() : { title: '' };

  const initialState: ReactAppState = {
    user,
    meta,
    discordAuthorizeLink: DISCORD_AUTHORIZE_LINK,
  };

  const router = createStaticRouter(routeHandler.dataRoutes, context);

  ctx.response.body = await index(router, context, initialState);
  ctx.response.headers.set("content-type", "text/html");
};

router.post("/tokens/:access_token_id(\\d+)", useSession, routeToApp);
router.post("/tokens/:access_token_id(\\d+/delete)", useSession, routeToApp);
router.post("/tokens/new", useSession, routeToApp);
router.get("/(.*)", useSession, routeToApp);

type AppState = {
  session: Session & { get(key: "user"): User | undefined };
};

const app = new Application<AppState>();

app.addEventListener("error", (ev) => {
  console.error(ev.error);
});

app.use(oakCors());
app.use(async (ctx, next) => {
  const url = ctx.request.url;
  const ua =
    ctx.request.headers.get("user-agent")?.replace(/[\n\r]/g, "") ?? "";
  const ip = ctx.request.headers.get("x-real-ip") ?? ctx.request.ip;
  logger.info(`${url} : ${ip} : ${ua}`);
  await next();
});

app.use(router.routes());
app.use(router.allowedMethods());

console.log(`server listening at http://${SERVER_HOST}:${SERVER_PORT}`);

await app.listen(
  SERVER_SSL_CERT !== "none" && SERVER_SSL_KEY !== "none"
    ? {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        secure: true,
        cert: SERVER_SSL_CERT,
        key: SERVER_SSL_KEY,
        alpnProtocols: ["h2", "http/1.1"],
      }
    : {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        secure: false,
      }
);
