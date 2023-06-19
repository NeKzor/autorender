/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The client is responsible to render an incoming demo file. The final video
 * file will be send back to the server once it finished rendering.
 */

import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";
import { join } from "https://deno.land/std@0.190.0/path/mod.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";
import { logger } from "./logger.ts";
import { AutorenderDataType, AutorenderMessages } from "./protocol.ts";
import { Video as VideoModel } from "../server/models.ts";

const GAME_DIR = Deno.env.get("GAME_DIR")!;
const GAME_MOD = Deno.env.get("GAME_MOD")!;
const GAME_EXE = Deno.env.get("GAME_EXE")!;
const GAME_MOD_PATH = join(GAME_DIR, GAME_MOD);

const AUTORENDER_FOLDER_NAME = Deno.env.get("AUTORENDER_FOLDER_NAME")!;
const AUTORENDER_PROTOCOL = Deno.env.get("AUTORENDER_PROTOCOL")!;
const AUTORENDER_CFG = Deno.env.get("AUTORENDER_CFG")!;
const AUTORENDER_CONNECT_URI = Deno.env.get("AUTORENDER_CONNECT_URI")!;
const AUTORENDER_DIR = join(GAME_MOD_PATH, AUTORENDER_FOLDER_NAME);
//const AUTORENDER_TIMEOUT_BASE = parseInt(Deno.env.get("AUTORENDER_TIMEOUT_BASE")!);
const AUTORENDER_CHECK_INTERVAL = 1_000;

const usesOnRenderer = true; // TODO: upstream sar_on_renderer feature

try {
  await Deno.mkdir(AUTORENDER_DIR);
  logger.info(`created autorender directory in ${GAME_DIR}`);
  // deno-lint-ignore no-empty
} catch {}

enum ClientStatus {
  Idle = 0,
  Rendering = 1,
}

type Video = Pick<VideoModel, "video_id" | "file_url" | "full_map_name">;

interface ClientState {
  toDownload: number;
  videos: Video[];
  status: ClientStatus;
}

const state: ClientState = {
  toDownload: 0,
  videos: [],
  status: ClientStatus.Idle,
};

const connect = () => {
  const ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get("AUTORENDER_API_KEY")!),
  ]);

  let check: number | null = null;

  const fetchNextVideos = () => {
    if (check !== null) {
      clearTimeout(check);
    }

    check = setTimeout(() => {
      ws.send(JSON.stringify({ type: "videos", data: { game: GAME_MOD } }));
    }, AUTORENDER_CHECK_INTERVAL);
  };

  ws.onopen = () => {
    logger.info("Connected to server");

    fetchNextVideos();
  };

  ws.onmessage = async (message) => {
    logger.info("Server:", { message });

    if (state.status === ClientStatus.Rendering) {
      return console.warn("got message during rendering... should not happen");
    }

    try {
      if (message.data instanceof Blob) {
        const buffer = await message.data.arrayBuffer();
        const view = new DataView(buffer);

        const length = Number(view.getUint32(0));
        const payload = buffer.slice(4, length + 4);
        const demo = buffer.slice(length + 4);
        const decoded = new TextDecoder().decode(payload);

        logger.info("decoded payload:", decoded);
        logger.info("demo byte length:", demo.byteLength);

        const video = JSON.parse(decoded) as Pick<
          Video,
          "video_id" | "file_url" | "full_map_name"
        >;

        if (video.file_url) {
          const mapFile = join(GAME_MOD_PATH, 'maps', `${video.full_map_name}.bsp`);
          let downloadMapFile = false;

          try {
            await Deno.stat(mapFile);
            logger.info("map", mapFile, "already downloaded");
          } catch {
            downloadMapFile = true;
          }

          if (downloadMapFile) {
            logger.info("downloading map", video.file_url);

            try {
              const steamResponse = await fetch(video.file_url, {
                headers: {
                  "User-Agent": "autorender-client-v1",
                },
              });

              if (!steamResponse.ok) {
                throw new Error(
                  `Failed to download map ${video.file_url} for video ${video.video_id} : ${steamResponse.status}`,
                );
              }

              const map = await steamResponse.arrayBuffer();
              await Deno.writeFile(mapFile, new Uint8Array(map));

              logger.info("downloaded map to", mapFile);
            } catch (err) {
              logger.error(err);
              // TODO: Handle the error.
              state.toDownload--;
              throw err;
            }
          }
        }

        state.videos.push(video);

        await Deno.writeFile(
          join(AUTORENDER_DIR, `${video.video_id}.dem`),
          new Uint8Array(demo),
        );

        if (state.videos.length === state.toDownload) {
          ws.send(
            JSON.stringify({
              type: "downloaded",
              data: { count: state.toDownload },
            }),
          );
        }
      } else {
        const { type, data } = JSON.parse(message.data) as AutorenderMessages;

        switch (type) {
          case AutorenderDataType.Videos: {
            if (data.length) {
              state.toDownload = data.length;
              state.videos = [];

              for await (const file of Deno.readDir(AUTORENDER_DIR)) {
                if (
                  file.isFile &&
                  (file.name.endsWith(".dem") || file.name.endsWith(".mp4"))
                ) {
                  const filename = join(AUTORENDER_DIR, file.name);

                  try {
                    Deno.remove(filename);
                  } catch (err) {
                    console.error(
                      `failed to remove file ${filename}:`,
                      err.toString(),
                    );
                  }
                }
              }

              for (const { video_id } of data) {
                ws.send(JSON.stringify({ type: "demo", data: { video_id } }));
              }
            } else {
              fetchNextVideos();
            }

            break;
          }
          case AutorenderDataType.Start: {
            try {
              state.status = ClientStatus.Rendering;

              const command = await launchGame();

              let gameProcess: Deno.ChildProcess | null = null;
              logger.info("spawning process..");

              Deno.addSignalListener("SIGINT", () => {
                logger.info("exiting...");

                try {
                  gameProcess?.kill();
                } catch (err) {
                  console.error(err);
                }

                Deno.exit();
              });

              gameProcess = command.spawn();
              logger.info("spawned");

              logger.info("output");
              const { code } = await gameProcess.output();

              logger.info("game exited", { code });

              gameProcess = null;

              // TODO: timeout based on demo time
              //const timeoutAt = start + 1 * 1_000 + (RENDER_TIMEOUT_BASE * 1_000);

              for (const { video_id } of state.videos) {
                try {
                  const buffer = new Buffer();
                  const videoId = new Uint8Array(8);
                  new DataView(videoId.buffer).setBigUint64(
                    0,
                    BigInt(video_id),
                  );

                  await buffer.write(videoId);
                  await buffer.write(
                    await Deno.readFile(
                      join(AUTORENDER_DIR, `${video_id}.dem.mp4`),
                    ),
                  );

                  ws.send(buffer.bytes());
                } catch (err) {
                  console.error(err);

                  ws.send(
                    JSON.stringify({
                      type: "error",
                      data: { video_id, message: err.toString() },
                    }),
                  );
                }
              }
            } catch (err) {
              console.error(err);
              ws.send(JSON.stringify({ type: "error", data: err.toString() }));
            } finally {
              state.toDownload = 0;
              state.videos = [];
              state.status = ClientStatus.Idle;

              fetchNextVideos();
            }

            break;
          }
          case AutorenderDataType.Error: {
            console.error(`error code: ${data.status}`);

            fetchNextVideos();
            break;
          }
          default: {
            console.error(`Unhandled type: ${type}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(err);

      ws.send(
        JSON.stringify({ type: "error", data: { message: err.toString() } }),
      );

      fetchNextVideos();
    }
  };

  ws.onclose = async () => {
    logger.info("Disconnected from server");

    if (check !== null) {
      clearTimeout(check);
    }

    await delay(AUTORENDER_CHECK_INTERVAL);
    connect();
  };
};

const launchGame = async () => {
  if (!state.videos.length) {
    throw new Error("no videos available");
  }

  const getDemoName = ({ video_id }: Video) => {
    return join(AUTORENDER_FOLDER_NAME, video_id.toString());
  };

  const exitCommand = "wait 300;exit";

  const playdemo = (video: Video, index: number, videos: Video[]) => {
    const demoName = getDemoName(video);
    const isLastVideo = index == videos.length - 1;
    const nextCommand = isLastVideo
      ? exitCommand
      : `autorender_video_${index + 1}`;

    return (
      `sar_alias autorender_video_${index} "playdemo ${demoName};` +
      `sar_alias autorender_queue ${nextCommand}"`
    );
  };

  const usesQueue = state.videos.length > 1;
  const nextCommand = usesQueue ? "autorender_queue" : exitCommand;
  const eventCommand = usesOnRenderer
    ? "sar_on_renderer_finish"
    : "sar_on_demo_stop";

  const autoexec = [
    `exec ${AUTORENDER_CFG}`,
    ...state.videos.slice(1).map(playdemo),
    ...(usesQueue ? ["sar_alias autorender_queue autorender_video_0"] : []),
    `${eventCommand} "${nextCommand}"`,
    `playdemo ${getDemoName(state.videos.at(0)!)}`,
  ];

  await Deno.writeTextFile(
    join(GAME_DIR, "portal2", "cfg", "autoexec.cfg"),
    autoexec.join("\n"),
  );

  const getCommand = () => {
    const command = join(GAME_DIR, GAME_EXE);

    switch (Deno.build.os) {
      case "windows":
        return [command, GAME_EXE];
      case "linux":
        return ["/bin/bash", command];
      default: {
        throw new Error("unsupported operating system");
      }
    }
  };

  const [command, argv0] = getCommand();

  return new Deno.Command(command, {
    args: [
      argv0,
      "-game",
      GAME_MOD,
      "-novid",
      "-vulkan",
      "-windowed",
      "-w",
      "1280",
      "-h",
      "720",
    ],
  });
};

const testRender = async () => {
  state.videos = [{ video_id: 1 } as Video];
  //state.videos = [{ video_id: 1 } as Video, { video_id: 2 } as Video];
  //state.videos = [{ video_id: 1 } as Video, { video_id: 2 } as Video, { video_id: 3 } as Video];

  const command = await launchGame();

  let gameProcess: Deno.ChildProcess | null = null;
  logger.info("spawning process..");

  Deno.addSignalListener("SIGINT", () => {
    logger.info("exiting...");

    try {
      gameProcess?.kill();
    } catch (err) {
      console.error(err);
    }

    Deno.exit();
  });

  gameProcess = command.spawn();
  logger.info("spawned");

  logger.info("output");
  const { code } = await gameProcess.output();

  logger.info("game exited", { code });

  gameProcess = null;
};

//await testRender();

connect();
