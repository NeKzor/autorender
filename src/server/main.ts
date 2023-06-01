/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import "https://deno.land/std@0.190.0/dotenv/load.ts";
import { Client } from "https://deno.land/x/mysql@v2.11.0/mod.ts";
import "https://deno.land/std@0.177.0/dotenv/load.ts";
import {
  Application,
  Context,
  Router,
  Status,
} from "https://deno.land/x/oak@v12.5.0/mod.ts";
import {
  ResponseBody,
  ResponseBodyFunction,
} from "https://deno.land/x/oak@v12.5.0/response.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { refresh } from "https://deno.land/x/refresh@1.0.0/mod.ts";
import { logger } from "./logger.ts";
import { index } from "./app/index.tsx";
import b2CloudStorage from "npm:b2-cloud-storage";
import {
  AccessPermission,
  AccessToken,
  PendingStatus,
  Video,
} from "./models.ts";
import { basename, join } from "https://deno.land/std@0.190.0/path/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import * as _bcrypt_worker from "https://deno.land/x/bcrypt@v0.4.1/src/worker.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";

const db = await new Client().connect({
  hostname: Deno.env.get("DB_HOST") ?? "127.0.0.1",
  port: parseInt(Deno.env.get("DB_PORT") ?? "3306", 10),
  username: Deno.env.get("DB_USER") ?? "p2render",
  password: Deno.env.get("DB_PASS") ?? "p2render",
  db: Deno.env.get("DB_NAME") ?? "p2render",
});

const MAX_VIDEOS_PER_REQUEST = 3;
const AUTORENDER_V1 = "autorender-v1";

const BOT_AUTH_TOKEN_HASH = await bcrypt.hash(
  Deno.env.get("BOT_AUTH_TOKEN") ?? ""
);

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

const apiV1 = new Router();

apiV1
  // Incoming render request containing the demo file.
  .put("/videos/render", async (ctx) => {
    if (!ctx.request.hasBody) {
      return ctx.throw(Status.UnsupportedMediaType);
    }

    // TODO: allow render from web platform

    const [authType, authToken] = (
      ctx.request.headers.get("Authorization") ?? ""
    ).split(" ");

    if (authType !== "Bearer") {
      return ctx.throw(Status.BadRequest);
    }

    if (!(await bcrypt.compare(authToken, BOT_AUTH_TOKEN_HASH))) {
      return ctx.throw(Status.Unauthorized);
    }

    const body = ctx.request.body({ type: "form-data" });
    const reader = body.value;
    const data = await reader.read({
      customContentTypes: {
        "application/octet-stream": "dem",
      },
      outPath: "./demos",
    });

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
        data.fields.requested_by_name,
        data.fields.requested_by_id,
        data.fields.render_options,
        file.originalName,
        filePath,
        PendingStatus.RequiresRender,
      ]
    );

    Ok(ctx, { inserted: result.affectedRows });
  })
  // Pending videos for clients.
  .get("/videos/pending", async (ctx) => {
    // TODO: authentication

    const videos = await db.execute(
      `select video_id from videos where pending = ? limit ?`,
      [PendingStatus.RequiresRender, MAX_VIDEOS_PER_REQUEST]
    );
    Ok(ctx, { result: videos.rows });
  })
  // Download pending demo file.
  .get("/videos/pending/:video_id(\\d+)", async (ctx) => {
    // TODO: authentication
    const videoId = Number(ctx.params.video_id);

    const updated = await db.execute(
      `update videos set pending = ? where video_id = ? and pending = ?`,
      [PendingStatus.StartedRender, videoId, PendingStatus.RequiresRender]
    );

    if (updated.affectedRows !== 0) {
      return ctx.throw(Status.NotFound);
    }

    const { rows } = await db.execute(
      `select file_path from videos where video_id = ?`,
      [videoId]
    );

    const video = rows?.at(0) as Video | undefined;
    if (!video) {
      return ctx.throw(Status.NotFound);
    }

    ctx.send({ path: video.file_path, root: "." });
  })
  // Client finished a render, upload it.
  .put("/videos/upload/:video_id(\\d+)", async (ctx) => {
    const { rows } = await db.execute(
      `select * from videos where video_id = ?`,
      [Number(ctx.params.video_id)]
    );

    const video = rows?.at(0) as Video | undefined;
    if (!video) {
      return ctx.throw(Status.NotFound);
    }

    const body = ctx.request.body({ type: "form-data" });
    const reader = body.value;
    const data = await reader.read({
      customContentTypes: {
        "application/octet-stream": "dem",
      },
    });

    const file = data.files?.at(0);
    if (!file?.filename) {
      return ctx.throw(Status.BadRequest);
    }

    try {
      const results = await new Promise((resolve, reject) => {
        b2.uploadFile(
          file.filename,
          {
            bucketId: "p2render",
            fileName: `${video.video_id}.dem`,
            contentType: "application/octet-stream",
            onUploadProgress: (update: {
              percent: number;
              bytesCopied: number;
              bytesTotal: number;
              bytesDispatched: number;
            }) => {
              console.log(
                `Upload: ${update.percent}% (${update.bytesDispatched}/${update.bytesTotal}`
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

        discordBot.send(JSON.stringify({ type: "upload", data: notification }));
      }

      Ok(ctx, { uploaded: true });
    } catch (err) {
      console.error(err);
      ctx.throw(Status.InternalServerError);
    }
  })
  // Viewed a video.
  .put("/videos/:video_id(\\d+)/view", async (ctx) => {
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
  .get("/(.*)", (ctx) => {
    Err(ctx, Status.NotFound, "Route not found :(");
  });

const router = new Router();

const isHotReloadEnabled = Deno.env.get("HOT_RELOAD")?.toLowerCase() === "yes";
if (isHotReloadEnabled) {
  const refreshMiddleware = refresh();

  router.get("/_r", (ctx) => {
    if (ctx.isUpgradable) {
      const response = refreshMiddleware(
        new Request(ctx.request.url, {
          headers: new Headers(ctx.request.headers),
        })
      );

      if (response) {
        ctx.response.body = response.body;
        for (const [headerName, headerValue] of response.headers) {
          ctx.response.headers.set(headerName, headerValue);
        }
        ctx.response.status = response.status;
        ctx.upgrade();
      }
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
router.get("/(.*)", async (ctx) => {
  ctx.response.body = await index(ctx.request.url.pathname.toString());
});

const app = new Application();

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

const hostname = Deno.env.get("SERVER_HOST") ?? "127.0.0.1";
const port = parseInt(Deno.env.get("SERVER_PORT") ?? "8001", 10);
const cert = Deno.env.get("SERVER_SSL_CERT");
const key = Deno.env.get("SERVER_SSL_KEY");

console.log(`server listening at http://${hostname}:${port}`);

await app.listen(
  cert !== "none" && key !== "none"
    ? {
        hostname,
        port,
        secure: true,
        cert,
        key,
        alpnProtocols: ["h2", "http/1.1"],
      }
    : {
        hostname,
        port,
        secure: false,
      }
);
