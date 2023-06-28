/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The client is responsible to render an incoming demo file. The final video
 * file will be send back to the server once it finished rendering.
 */

import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { dirname, join } from "https://deno.land/std@0.190.0/path/mod.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";
import { logger } from "./logger.ts";
import {
  AutorenderDataType,
  AutorenderMessages,
  AutorenderMessageVideos,
  AutorenderSendDataType,
  AutorenderSendMessages,
  VideoPayload,
} from "./protocol.ts";
import { Video as VideoModel } from "../server/models.ts";
import { ClientState, ClientStatus } from "./state.ts";

const GAME_DIR = Deno.env.get("GAME_DIR")!;
const GAME_MOD = Deno.env.get("GAME_MOD")!;
const GAME_EXE = Deno.env.get("GAME_EXE")!;
const GAME_MOD_PATH = join(GAME_DIR, GAME_MOD);

const AUTORENDER_FOLDER_NAME = Deno.env.get("AUTORENDER_FOLDER_NAME")!;
const AUTORENDER_CFG = Deno.env.get("AUTORENDER_CFG")!;
const AUTORENDER_DIR = join(GAME_MOD_PATH, AUTORENDER_FOLDER_NAME);
const AUTORENDER_PATCHED_SAR = true; // TODO: Upstream sar_on_renderer feature
const AUTORENDER_CHECK_INTERVAL = 1_000;

try {
  await Deno.mkdir(AUTORENDER_DIR);
  logger.info(`Created autorender directory in ${GAME_DIR}`);
  // deno-lint-ignore no-empty
} catch {}

const state: ClientState = {
  toDownload: 0,
  videos: [],
  status: ClientStatus.Idle,
  payloads: [],
};

let idleTimer: number | null = null;

// Worker thread for connecting to the server.
const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
  type: "module",
});

worker.addEventListener("message", async (message: MessageEvent) => {
  if (message.data instanceof ArrayBuffer) {
    await onMessage(message.data);
  } else {
    const { type, data } = message.data;
    switch (type) {
      case "connected":
        fetchNextVideos();
        break;
      case "disconnected":
        if (idleTimer !== null) {
          clearTimeout(idleTimer);
        }
        break;
      case "message":
        await onMessage(data);
        break;
      default:
        logger.error(
          `Unhandled message type from worker: ${message.data.type}`,
        );
        break;
    }
  }
});

const send = (
  data: Uint8Array | AutorenderSendMessages,
  options?: { dropDataIfDisconnected: boolean },
) => {
  worker.postMessage({
    type: "send",
    data: {
      data,
      options,
    },
  });
};

const fetchNextVideos = () => {
  if (state.status === ClientStatus.Idle) {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
    }

    idleTimer = setTimeout(
      () =>
        send(
          {
            type: AutorenderSendDataType.Videos,
            data: { game: GAME_MOD },
          },
          {
            dropDataIfDisconnected: true,
          },
        ),
      AUTORENDER_CHECK_INTERVAL,
    );
  }
};

/**
 * Check for new videos to render.
 */
const handleMessageVideos = async (videos: AutorenderMessageVideos["data"]) => {
  if (!videos.length) {
    return fetchNextVideos();
  }

  // Save how many videos we expect to download.
  state.toDownload = videos.length;
  state.videos = [];

  // Delete demo and video files from previous render.
  for await (const file of Deno.readDir(AUTORENDER_DIR)) {
    if (
      file.isFile &&
      (file.name.endsWith(".dem") || file.name.endsWith(".mp4"))
    ) {
      const filename = join(AUTORENDER_DIR, file.name);

      try {
        Deno.remove(filename);
      } catch (err) {
        logger.error(
          `failed to remove file ${filename}:`,
          err.toString(),
        );
      }
    }
  }

  // Claim video and request demo file.
  for (const { video_id } of videos) {
    send({ type: AutorenderSendDataType.Demo, data: { video_id } });
  }
};

let gameProcess: Deno.ChildProcess | null = null;

Deno.addSignalListener("SIGINT", () => {
  if (gameProcess) {
    try {
      logger.info("Handling termination...");
      gameProcess.kill();
      logger.info("Termination game process");
    } catch (err) {
      logger.error(err);
    }
  }

  Deno.exit();
});

/**
 * Server requests the start of a render after it got the confirmed videos.
 */
const handleMessageStart = async () => {
  try {
    if (!state.videos.length) {
      throw new Error("No videos available");
    }

    state.status = ClientStatus.Rendering;

    const command = await prepareGameLaunch();

    logger.info("Spawning process...");

    gameProcess = command.spawn();

    logger.info("Spawned");

    // TODO: Timeout based on demo time
    const { code } = await gameProcess.output();

    logger.info("Game exited", { code });

    gameProcess = null;

    const encoder = new TextEncoder();

    for (const { video_id } of state.videos) {
      try {
        const buffer = new Buffer();
        await buffer.write(encoder.encode(video_id));
        await buffer.write(
          await Deno.readFile(
            join(AUTORENDER_DIR, `${video_id}.dem.mp4`),
          ),
        );

        send(buffer.bytes());
      } catch (err) {
        logger.error(err);

        send({
          type: AutorenderSendDataType.Error,
          data: {
            video_id,
            message: err.toString(),
          },
        });
      }
    }
  } finally {
    state.toDownload = 0;
    state.videos = [];
    state.status = ClientStatus.Idle;

    gameProcess?.kill();
    gameProcess = null;

    fetchNextVideos();
  }
};

const downloadWorkshopMap = async (mapFile: string, video: VideoModel) => {
  logger.info("Downloading map", video.file_url);

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

  await Deno.mkdir(dirname(mapFile));

  const map = await steamResponse.arrayBuffer();
  await Deno.writeFile(mapFile, new Uint8Array(map));

  logger.info("Downloaded map to", mapFile);
};

/**
 * Handle claimed video:
 *      0 ... 4 bytes  = length of json payload
 *      5 ... length   = video data
 *      length + 1 ... = demo file
 */
const handleMessageBuffer = async (buffer: ArrayBuffer) => {
  let videoId: VideoModel["video_id"] | undefined = undefined;

  try {
    const length = new DataView(buffer).getUint32(0);
    const payload = buffer.slice(4, length + 4);
    const demo = buffer.slice(length + 4);
    const decoded = new TextDecoder().decode(payload);

    logger.info("Decoded payload:", decoded);
    logger.info("Demo byte length:", demo.byteLength);

    const video = JSON.parse(decoded) as VideoModel;

    videoId = video.video_id;

    // Check if a workshop map needs to be downloaded.
    if (video.file_url) {
      const mapFile = join(GAME_MOD_PATH, "maps", `${video.full_map_name}.bsp`);
      let downloadMapFile = false;

      try {
        await Deno.stat(mapFile);
        logger.info("Map", mapFile, "already downloaded");
      } catch {
        downloadMapFile = true;
      }

      if (downloadMapFile) {
        await downloadWorkshopMap(mapFile, video);
      }
    }

    await Deno.writeFile(
      join(AUTORENDER_DIR, `${video.video_id}.dem`),
      new Uint8Array(demo),
    );

    state.videos.push(video);
  } catch (err) {
    logger.error(err);

    state.toDownload -= 1;

    send({
      type: AutorenderSendDataType.Error,
      data: {
        video_id: videoId,
        message: err.toString(),
      },
    });
  } finally {
    // Confirm videos once all demos have been downloaded.
    if (state.videos.length === state.toDownload) {
      send({
        type: AutorenderSendDataType.Downloaded,
        data: {
          video_ids: state.videos.map(({ video_id }) => video_id),
        },
      });
    }
  }
};

const onMessage = async (messageData: ArrayBuffer | string) => {
  if (state.status === ClientStatus.Rendering) {
    return logger.warn("Got message during rendering... should not happen");
  }

  try {
    if (messageData instanceof ArrayBuffer) {
      await handleMessageBuffer(messageData);
    } else {
      const { type, data } = JSON.parse(messageData) as AutorenderMessages;

      switch (type) {
        case AutorenderDataType.Videos: {
          await handleMessageVideos(data);
          break;
        }
        case AutorenderDataType.Start: {
          await handleMessageStart();
          break;
        }
        case AutorenderDataType.Error: {
          logger.error(`Error code: ${data.status}`);
          fetchNextVideos();
          break;
        }
        default: {
          logger.error(`Unhandled type: ${type}`);
          break;
        }
      }
    }
  } catch (err) {
    logger.error(err);

    send({
      type: AutorenderSendDataType.Error,
      data: {
        message: err.toString(),
      },
    });

    fetchNextVideos();
  }
};

/**
 * Prepares autoexec.cfg to queue all demos.
 */
const prepareGameLaunch = async () => {
  const getDemoName = ({ video_id }: VideoPayload) => {
    return join(AUTORENDER_FOLDER_NAME, video_id.toString());
  };

  const exitCommand = "wait 300;exit";

  const playdemo = (
    video: VideoPayload,
    index: number,
    videos: VideoPayload[],
  ) => {
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
  const eventCommand = AUTORENDER_PATCHED_SAR
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
      //"-vulkan", // TODO: vulkan is not always available
      "-windowed",
      "-w",
      "1280",
      "-h",
      "720",
    ],
  });
};
