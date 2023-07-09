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
import { logger } from "./logger.ts";
import {
  AutorenderDataType,
  AutorenderMessages,
  AutorenderMessageVideos,
  AutorenderSendDataType,
  AutorenderSendMessages,
  VideoPayload,
} from "./protocol.ts";
import { RenderQuality, Video as VideoModel } from "../server/models.ts";
import { ClientState, ClientStatus } from "./state.ts";
import { UploadWorkerDataType } from "./upload.ts";

const GAME_DIR = Deno.env.get("GAME_DIR")!;
const GAME_MOD = Deno.env.get("GAME_MOD")!;
const GAME_EXE = Deno.env.get("GAME_EXE")!;
const GAME_PROC = Deno.env.get("GAME_PROC")!;
const GAME_MOD_PATH = join(GAME_DIR, GAME_MOD);

const AUTORENDER_FOLDER_NAME = Deno.env.get("AUTORENDER_FOLDER_NAME")!;
const AUTORENDER_CFG = Deno.env.get("AUTORENDER_CFG")!;
const AUTORENDER_DIR = join(GAME_MOD_PATH, AUTORENDER_FOLDER_NAME);
const AUTORENDER_MAX_SUPPORTED_QUALITY = Deno.env.get("AUTORENDER_MAX_SUPPORTED_QUALITY")!;
// TODO: Upstream sar_on_renderer feature
const AUTORENDER_PATCHED_SAR = true;
// Timeout interval in ms to check if there are new videos to render.
const AUTORENDER_CHECK_INTERVAL = 1_000;
// Approximated scaling factor for multiplying the demo playback time.
const AUTORENDER_SCALE_TIMEOUT = 9;
// Approximated time in seconds of how long it takes to load a demo.
const AUTORENDER_LOAD_TIMEOUT = 5;
// Approximated time in seconds of how long it takes to start/exit the game process.
const AUTORENDER_BASE_TIMEOUT = 20;

try {
  await Deno.mkdir(AUTORENDER_DIR);
  logger.info(`Created autorender directory ${AUTORENDER_DIR}`);
  // deno-lint-ignore no-empty
} catch {}

try {
  const workshopDirectory = join(GAME_MOD_PATH, "maps", "workshop");
  await Deno.mkdir(workshopDirectory);
  logger.info(`Created workshop directory ${workshopDirectory}`);
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

// Upload worker thread for uploading files to the server.
const upload = new Worker(new URL("./upload.ts", import.meta.url).href, {
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
          idleTimer = null;
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

upload.addEventListener("message", (message: MessageEvent) => {
  const { type, data } = message.data;
  switch (type) {
    case "error":
      send({
        type: AutorenderSendDataType.Error,
        data,
      });
      break;
    default:
      logger.error(
        `Unhandled message type from upload worker: ${message.data.type}`,
      );
      break;
  }
});

const send = (
  data: AutorenderSendMessages,
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
            data: {
              game: GAME_MOD,
              maxRenderQuality: AUTORENDER_MAX_SUPPORTED_QUALITY,
            },
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
          `Failed to remove file ${filename}:`,
          err,
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
let timeout: number | null = null;

/**
 * Kills the game process.
 */
const killGameProcess = () => {
  if (!gameProcess) {
    return;
  }

  // Negative PID in Unix means killing the entire process group.
  const pid = Deno.build.os === "windows" ? gameProcess.pid : -gameProcess.pid;

  logger.info(`Killing process ${pid}`);

  //Deno.kill(pid, "SIGKILL");

  // Deno.kill does not work for some reason :>
  if (Deno.build.os !== "windows") {
    const kill = new Deno.Command("pkill", { args: [GAME_PROC] });
    const { code } = kill.outputSync();
    logger.info(`pkill ${GAME_PROC}`, { code });
  } else {
    Deno.kill(pid, "SIGKILL");
  }

  logger.info("killed");
};

Deno.addSignalListener("SIGINT", () => {
  if (gameProcess) {
    try {
      logger.info("Handling termination...");
      killGameProcess();
      logger.info("Termination game process");
    } catch (err) {
      logger.error(err);
    } finally {
      gameProcess = null;
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

    logger.info(`Spawned process ${gameProcess.pid}`);

    const calculatedTimeout = state.videos.reduce(
      (total, video) => {
        return total + (video.demo_playback_time * AUTORENDER_SCALE_TIMEOUT) +
          AUTORENDER_LOAD_TIMEOUT;
      },
      AUTORENDER_BASE_TIMEOUT,
    );

    logger.info(`Process timeout in ${calculatedTimeout.toFixed(2)} seconds`);

    timeout = setTimeout(() => {
      if (gameProcess) {
        try {
          logger.warn("Timeout of process");
          killGameProcess();
          logger.warn("Killed process");
        } catch (err) {
          logger.error(err);
        } finally {
          gameProcess = null;
        }
      }
    }, calculatedTimeout * 1_000);

    const { code } = await gameProcess.output();

    clearTimeout(timeout);
    gameProcess = null;
    timeout = null;

    logger.info("Game exited", { code });

    // Let the upload thread do the work.
    upload.postMessage({
      type: UploadWorkerDataType.Upload,
      data: {
        videos: state.videos,
        autorenderDir: AUTORENDER_DIR,
      },
    });
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }

    state.toDownload = 0;
    state.videos = [];
    state.status = ClientStatus.Idle;

    if (gameProcess) {
      try {
        killGameProcess();
      } catch (err) {
        logger.error(err);
      } finally {
        gameProcess = null;
      }
    }

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

  try {
    await Deno.mkdir(dirname(mapFile));
  } catch (err) {
    logger.error(err);
  }

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
 * Get window width and height.
 * NOTE: This will also be used for the custom crosshair.
 */
const getGameResolution = () => {
  // Quality for each video should be the same.
  // This is handled server-side.
  const { render_quality } = state.videos.at(0)!;

  switch (render_quality) {
    case RenderQuality.SD_480p:
      // NOTE: This is 16:10 for now...
      return ["768", "480"];
    case RenderQuality.HD_720p:
      return ["1280", "720"];
    case RenderQuality.FHD_1080p:
      return ["1920", "1080"];
    case RenderQuality.QHD_1440p:
      return ["2560", "1440"];
    case RenderQuality.UHD_2160p:
      return ["3840", "2160"];
    default:
      return ["1280", "720"];
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

  const [width, height] = getGameResolution();

  const autoexec = [
    `exec ${AUTORENDER_CFG}`,
    `sar_quickhud_set_texture crosshair/quickhud${height}-`,
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
      width,
      "-h",
      height,
    ],
  });
};
