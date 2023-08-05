/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * The client is responsible to render an incoming demo file. The final video
 * file will be send back to the server once it finished rendering.
 */

import { dirname, join } from 'https://deno.land/std@0.190.0/path/mod.ts';
import { logger } from './logger.ts';
import {
  AutorenderDataType,
  AutorenderMessages,
  AutorenderMessageVideos,
  AutorenderSendDataType,
  AutorenderSendMessages,
  VideoPayload,
} from './protocol.ts';
import { RenderQuality } from '../shared/models.ts';
import { ClientState, ClientStatus } from './state.ts';
import { UploadWorkerDataType } from './upload.ts';
import { GameConfig, getConfig } from './config.ts';
import { getOptions } from './options.ts';
import { WorkerDataType } from './worker.ts';
import { UserAgent } from './version.ts';

addEventListener('error', (ev) => {
  console.dir({ error: ev.error }, { depth: 16 });
});

addEventListener('unhandledrejection', (ev) => {
  console.dir({ unhandledrejection: ev.reason }, { depth: 16 });
});

const _options = await getOptions();
const config = await getConfig();

// TODO: Upstream sar_on_renderer feature
const AUTORENDER_PATCHED_SAR = true;

const createFolders = async () => {
  for (const game of config.games) {
    const commonDir = dirname(game.dir);

    const { state: readAccess } = await Deno.permissions.request({
      name: 'read',
      path: commonDir,
    });

    if (readAccess !== 'granted') {
      logger.error(`Unable to get read access for path ${commonDir}`);
      Deno.exit(1);
    }

    const { state: writeAccess } = await Deno.permissions.request({
      name: 'write',
      path: commonDir,
    });

    if (writeAccess !== 'granted') {
      logger.error(`Unable to get write access for path ${commonDir}`);
      Deno.exit(1);
    }

    try {
      const autorenderDir = join(game.dir, game.mod, config.autorender['folder-name']);
      await Deno.mkdir(autorenderDir);
      logger.info(`Created autorender directory ${autorenderDir}`);
      // deno-lint-ignore no-empty
    } catch {}

    try {
      const workshopDir = join(game.dir, game.mod, 'maps', 'workshop');
      await Deno.mkdir(workshopDir);
      logger.info(`Created workshop directory ${workshopDir}`);
      // deno-lint-ignore no-empty
    } catch {}
  }
};

await createFolders();

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
    const autorenderDir = join(game.dir, game.mod, config.autorender['folder-name']);

    for await (const file of Deno.readDir(autorenderDir)) {
      if (
        file.isFile &&
        (file.name.endsWith('.dem') || file.name.endsWith('.mp4'))
      ) {
        const filename = join(autorenderDir, file.name);

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
  }

  // Claim video and request demo file.
  for (const { video_id } of videos) {
    send({ type: AutorenderSendDataType.Demo, data: { video_id } });
  }
};

let gameProcess: Deno.ChildProcess | null = null;
let gameProcessName = '';
let timeout: number | null = null;

/**
 * Kills the game process.
 */
const killGameProcess = () => {
  if (!gameProcess) {
    return;
  }

  // Negative PID in Unix means killing the entire process group.
  const pid = Deno.build.os === 'windows' ? gameProcess.pid : -gameProcess.pid;

  logger.info(`Killing process ${pid}`);

  //Deno.kill(pid, "SIGKILL");

  // Deno.kill does not work for some reason :>
  if (Deno.build.os !== 'windows') {
    const kill = new Deno.Command('pkill', { args: [gameProcessName] });
    const { code } = kill.outputSync();
    logger.info(`pkill ${gameProcessName}`, { code });
  } else {
    Deno.kill(pid, 'SIGKILL');
  }

  logger.info('killed');
};

Deno.addSignalListener('SIGINT', () => {
  if (gameProcess) {
    try {
      logger.info('Handling termination...');
      killGameProcess();
      logger.info('Termination game process');
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
const handleMessageStart = async (game: GameConfig) => {
  try {
    if (!state.videos.length) {
      throw new Error('No videos available');
    }

    state.status = ClientStatus.Rendering;

    const command = await prepareGameLaunch(game);

    logger.info('Spawning process...');

    gameProcess = command.spawn();
    gameProcessName = game.proc;

    logger.info(`Spawned process ${gameProcess.pid}`);

    const calculatedTimeout = state.videos.reduce(
      (total, video) => {
        return total + (video.demo_playback_time * config.autorender['scale-timeout']) +
          config.autorender['load-timeout'];
      },
      config.autorender['base-timeout'],
    );

    logger.info(`Process timeout in ${calculatedTimeout.toFixed(2)} seconds`);

    timeout = setTimeout(() => {
      if (gameProcess) {
        try {
          logger.warn('Timeout of process');
          killGameProcess();
          logger.warn('Killed process');
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

    logger.info('Game exited', { code });

    // Let the upload thread do the work.
    const autorenderDir = join(game.dir, game.mod, config.autorender['folder-name']);

    upload.postMessage({
      type: UploadWorkerDataType.Upload,
      data: {
        videos: state.videos,
        autorenderDir,
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
      const mapFile = join(game.dir, game.mod, 'maps', `${video.full_map_name}.bsp`);
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
      join(game.dir, game.mod, config.autorender['folder-name'], `${video.video_id}.dem`),
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
const getGameResolution = (): [string, string] => {
  // Quality for each video should be the same.
  // This is handled server-side.
  const { render_quality } = state.videos.at(0)!;

  switch (render_quality) {
    case RenderQuality.SD_480p:
      // NOTE: This is 16:10 for now...
      return ['768', '480'];
    case RenderQuality.HD_720p:
      return ['1280', '720'];
    case RenderQuality.FHD_1080p:
      return ['1920', '1080'];
    case RenderQuality.QHD_1440p:
      return ['2560', '1440'];
    case RenderQuality.UHD_2160p:
      return ['3840', '2160'];
    default:
      return ['1280', '720'];
  }
};

/**
 * Prepares autoexec.cfg to queue all demos.
 */
const prepareGameLaunch = async (game: GameConfig) => {
  const getDemoName = ({ video_id }: VideoPayload) => {
    return join(config.autorender['folder-name'], video_id.toString());
  };

  const exitCommand = 'wait 300;exit';

  const playdemo = (
    video: VideoPayload,
    index: number,
    videos: VideoPayload[],
  ) => {
    const demoName = getDemoName(video);
    const isLastVideo = index == videos.length - 1;
    const nextCommand = isLastVideo ? exitCommand : `autorender_video_${index + 1}`;
    const renderOptions = video.render_options?.split('\n')?.join(';') ?? '';

    return (
      `sar_alias autorender_video_${index} "${renderOptions};playdemo ${demoName};` +
      `sar_alias autorender_queue ${nextCommand}"`
    );
  };

  const usesQueue = state.videos.length > 1;
  const nextCommand = usesQueue ? 'autorender_queue' : exitCommand;
  const eventCommand = AUTORENDER_PATCHED_SAR ? 'sar_on_renderer_finish' : 'sar_on_demo_stop';

  const [width, height] = getGameResolution();

  const firstVideo = state.videos.at(0)!;
  const renderOptions = firstVideo.render_options?.split('\n')?.join(';') ?? '';

  const autoexec = [
    `exec ${game.cfg}`,
    `sar_quickhud_set_texture crosshair/quickhud${height}-`,
    ...state.videos.slice(1).map(playdemo),
    ...(usesQueue ? ['sar_alias autorender_queue autorender_video_0'] : []),
    `${eventCommand} "${nextCommand}"`,
    `${renderOptions};playdemo ${getDemoName(firstVideo)}`,
  ];

  await Deno.writeTextFile(
    join(game.dir, game.mod, 'cfg', 'autoexec.cfg'),
    autoexec.join('\n'),
  );

  const getCommand = (): [string, string] => {
    const command = join(game.dir, game.exe);

    switch (Deno.build.os) {
      case 'windows':
        return [command, game.exe];
      case 'linux':
        return ['/bin/bash', command];
      default:
        throw new Error('Unsupported operating system');
    }
  };

  const [command, argv0] = getCommand();

  const args = [
    argv0,
    '-game',
    game.mod === 'portalreloaded' ? 'portal2' : game.mod,
    '-novid',
    // TODO: vulkan is not always available
    //"-vulkan",
    '-windowed',
    '-w',
    width,
    '-h',
    height,
  ];

  console.log({ command, args });

  return new Deno.Command(command, { args });
};
