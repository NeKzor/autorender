/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The client is responsible to render an incoming demo file. The final video
 * file will be send back to the server once it finished rendering.
 */

import { dirname, join } from 'path/mod.ts';
import { logger } from './logger.ts';
import {
  AutorenderDataType,
  AutorenderMessages,
  AutorenderMessageVideos,
  AutorenderSendDataType,
  AutorenderSendMessages,
  VideoPayload,
} from './protocol.ts';
import { ClientState, ClientStatus } from './state.ts';
import { UploadWorkerDataType } from './upload.ts';
import { GameConfig, getConfig } from './config.ts';
import { WorkerDataType } from './worker.ts';
import { UserAgent } from './constants.ts';
import { createFolders, GameProcess } from './game.ts';
import { gameModFolder, realGameModFolder } from './utils.ts';
import { parseArgs } from './cli.ts';

addEventListener('error', (ev) => {
  console.dir({ error: ev.error }, { depth: 16 });
});

addEventListener('unhandledrejection', (ev) => {
  console.dir({ unhandledrejection: ev.reason }, { depth: 16 });
});

const _args = await parseArgs();
const config = await getConfig();

await createFolders(config);

const state: ClientState = {
  toDownload: 0,
  videos: [],
  status: ClientStatus.Idle,
  payloads: [],
};

let idleTimer: number | null = null;

// Worker thread for connecting to the server.
const worker = new Worker(new URL('./worker.ts', import.meta.url).href, {
  type: 'module',
});

worker.postMessage({ type: WorkerDataType.Config, data: { config } });
worker.postMessage({ type: WorkerDataType.Connect });

// Upload worker thread for uploading files to the server.
const upload = new Worker(new URL('./upload.ts', import.meta.url).href, {
  type: 'module',
});

upload.postMessage({
  type: UploadWorkerDataType.Config,
  data: {
    config,
  },
});

worker.addEventListener('message', async (message: MessageEvent) => {
  try {
    if (message.data instanceof ArrayBuffer) {
      await onMessage(message.data);
    } else {
      const { type, data } = message.data;
      switch (type) {
        case WorkerDataType.Connected:
          fetchNextVideos();
          break;
        case WorkerDataType.Disconnected:
          if (idleTimer !== null) {
            clearTimeout(idleTimer);
            idleTimer = null;
          }
          break;
        case WorkerDataType.Message:
          await onMessage(data);
          break;
        default:
          logger.error(
            `Unhandled message type from worker: ${message.data.type}`,
          );
          break;
      }
    }
  } catch (err) {
    logger.error(err);
  }
});

upload.addEventListener('message', (message: MessageEvent) => {
  try {
    const { type, data } = message.data;
    switch (type) {
      case UploadWorkerDataType.Error:
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
  } catch (err) {
    logger.error(err);
  }
});

const send = (
  data: AutorenderSendMessages,
  options?: { dropDataIfDisconnected: boolean },
) => {
  worker.postMessage({
    type: WorkerDataType.Send,
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
              gameMods: config.games.map(({ mod }) => mod),
              maxRenderQuality: config.autorender['max-supported-quality'],
            },
          },
          {
            dropDataIfDisconnected: true,
          },
        ),
      config.autorender['check-interval'] * 1_000,
    );
  }
};

/**
 * Check for new videos to render.
 */
const handleMessageVideos = async (videos: AutorenderMessageVideos['data']) => {
  if (!videos.length) {
    return fetchNextVideos();
  }

  // Save how many videos we expect to download.
  state.toDownload = videos.length;
  state.videos = [];

  // Delete demo and video files from previous render.
  for (const game of config.games) {
    const autorenderDir = realGameModFolder(game, config.autorender['folder-name']);

    for await (const file of Deno.readDir(autorenderDir)) {
      if (
        file.isFile &&
        (file.name.endsWith('.dem') || file.name.endsWith('.mp4'))
      ) {
        const filename = join(autorenderDir, file.name);

        try {
          await Deno.remove(filename);
        } catch (err) {
          logger.error(
            `Failed to remove file ${filename}:`,
            err,
          );
        }
      }
    }
  }

  // Claim video and request demo file.
  for (const { video_id } of videos) {
    send({ type: AutorenderSendDataType.Demo, data: { video_id } });
  }
};

const gameProcess = new GameProcess();

/**
 * Server requests the start of a render after it got the confirmed videos.
 */
const handleMessageStart = async (game: GameConfig) => {
  try {
    if (!state.videos.length) {
      throw new Error('No videos available');
    }

    state.status = ClientStatus.Rendering;

    // Render the video.
    await gameProcess.launch({
      config,
      game,
      videos: state.videos,
    });

    // Let another thread handle the upload.
    upload.postMessage({
      type: UploadWorkerDataType.Upload,
      data: {
        videos: state.videos,
      },
    });
  } finally {
    gameProcess.clearTimeout();

    state.toDownload = 0;
    state.videos = [];
    state.status = ClientStatus.Idle;

    gameProcess.tryKillGameProcess();
    await gameProcess.removeAutoexec();

    fetchNextVideos();
  }
};

const downloadWorkshopMap = async (mapFile: string, video: VideoPayload) => {
  logger.info('Downloading map', video.file_url);

  const steamResponse = await fetch(video.file_url, {
    headers: {
      'User-Agent': UserAgent,
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

  logger.info('Downloaded map to', mapFile);
};

/**
 * Handle claimed video:
 *      0 ... 4 bytes  = length of json payload
 *      5 ... length   = video data
 *      length + 1 ... = demo file
 */
const handleMessageBuffer = async (buffer: ArrayBuffer) => {
  let videoId: VideoPayload['video_id'] | undefined = undefined;

  try {
    const length = new DataView(buffer).getUint32(0);
    const payload = buffer.slice(4, length + 4);
    const demo = buffer.slice(length + 4);
    const decoded = new TextDecoder().decode(payload);

    logger.info('Decoded payload:', decoded);
    logger.info('Demo byte length:', demo.byteLength);

    const video = JSON.parse(decoded) as VideoPayload;

    videoId = video.video_id;

    const game = config.games.find(({ mod }) => mod === video.demo_game_dir);
    if (!game) {
      throw new Error(
        `Unable to handle message buffer because unsupported game mod "${video.demo_game_dir}" found.`,
      );
    }

    // Check if a workshop map needs to be downloaded.
    if (video.file_url) {
      const mapFile = gameModFolder(game, 'maps', `${video.full_map_name}.bsp`);
      let downloadMapFile = false;

      try {
        await Deno.stat(mapFile);
        logger.info('Map', mapFile, 'already downloaded');
      } catch {
        downloadMapFile = true;
      }

      if (downloadMapFile) {
        await downloadWorkshopMap(mapFile, video);
      }
    }

    await Deno.writeFile(
      realGameModFolder(game, config.autorender['folder-name'], `${video.video_id}.dem`),
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
    return logger.warn('Got message during rendering... should not happen');
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
          // NOTE: Expected to only be one video at a time
          const gameDir = state.videos.at(0)?.demo_game_dir;
          const game = config.games.find(({ mod }) => mod === gameDir);
          if (!game) {
            logger.error(`Unable to start because unsupported game mod "${gameDir}" found.`);
            break;
          }
          await handleMessageStart(game);
          break;
        }
        case AutorenderDataType.Error: {
          logger.error(`Error code ${data.status}${data.message ? ` : ${data.message}` : ''}`);
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
