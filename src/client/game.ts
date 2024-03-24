/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { dirname, join } from 'path/mod.ts';
import { Config, GameConfig, gameModsWhichSupportWorkshop } from './config.ts';
import { logger } from './logger.ts';
import { colors } from 'cliffy/ansi/colors.ts';
import { gameFolder, realGameModFolder } from './utils.ts';
import { VideoPayload } from './protocol.ts';
import { RenderQuality } from '~/shared/models.ts';

// TODO: Upstream sar_on_renderer feature
const AUTORENDER_PATCHED_SAR = true;

/**
 * Request access to the game's subdirectory and create all folders for rendering.
 */
export const createFolders = async (config: Config | null) => {
  if (!config) {
    logger.error(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  for (const game of config.games) {
    const commonDir = dirname(game.dir);

    const gameDirReadAccess = await Deno.permissions.query({ name: 'read', path: game.dir });
    const gameDirWiteAccess = await Deno.permissions.query({ name: 'write', path: game.dir });

    if (gameDirReadAccess.state !== 'granted' || gameDirWiteAccess.state !== 'granted') {
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
    }

    try {
      const autorenderDir = realGameModFolder(game, config.autorender['folder-name']);
      await Deno.mkdir(autorenderDir);
      logger.info(`Created autorender directory ${autorenderDir}`);
      // deno-lint-ignore no-empty
    } catch {}

    if (gameModsWhichSupportWorkshop.includes(game.mod)) {
      try {
        const workshopDir = realGameModFolder(game, 'maps', 'workshop');
        await Deno.mkdir(workshopDir);
        logger.info(`Created workshop directory ${workshopDir}`);
        // deno-lint-ignore no-empty
      } catch {}
    }
  }
};

/**
 * Get window width and height.
 * NOTE: This will also be used for the custom crosshair.
 */
const getGameResolution = (renderQuality: VideoPayload['render_quality']): [number, number] => {
  switch (renderQuality) {
    case RenderQuality.SD_480p:
      // NOTE: This is 16:10 for now because SAR fails to render if PAR is not 1:1
      return [768, 480];
    case RenderQuality.HD_720p:
      return [1280, 720];
    case RenderQuality.FHD_1080p:
      return [1920, 1080];
    case RenderQuality.QHD_1440p:
      return [2560, 1440];
    case RenderQuality.UHD_2160p:
      return [3840, 2160];
    default:
      return [1280, 720];
  }
};

/**
 * Game specific quirks.
 */
const getAutoexecQuirks = (game: GameConfig) => {
  let sarTogglewait: string | null = 'sar_togglewait';
  let sndRestart: string | null = 'sar_on_demo_start snd_restart';
  let aliasExec: string | null = null;
  let aliasSvCheats: string | null = null;

  switch (game.mod) {
    case 'TWTM':
      // No snd_restart here because it crashes the game.
      sndRestart = null;
      // Disable exec because loading a map will execute autoexec.cfg again.
      aliasExec = 'sar_on_config_exec alias exec ""';
      // Disable sv_cheats after activation because the game will set it to 0.
      aliasSvCheats = 'sar_on_config_exec alias sv_cheats ""';
      break;
    case 'Portal 2 Speedrun Mod':
      // No sar_togglewait here because the smsm plugin enables it.
      sarTogglewait = null;
      break;
    default:
      break;
  }

  return [
    sarTogglewait,
    sndRestart,
    aliasExec,
    aliasSvCheats,
  ].filter((quirk) => quirk !== null) as string[];
};

/**
 * Prepares autoexec.cfg to queue all demos.
 */
export const prepareGameLaunch = async (
  options: {
    config: Config;
    game: GameConfig;
    videos?: VideoPayload[];
    noAutoexec?: boolean;
    benchmarkFile?: string;
  },
): Promise<[string, Deno.Command]> => {
  const { config, game, videos } = options;

  const getDemoName = (filename: string) => {
    return join(config.autorender['folder-name'], filename);
  };

  const exitCommand = 'wait 300;exit';

  const playdemo = (
    video: VideoPayload,
    index: number,
    videos: VideoPayload[],
  ) => {
    const demoName = getDemoName(video.video_id);
    const isLastVideo = index == videos.length - 1;
    const nextCommand = isLastVideo ? exitCommand : `autorender_video_${index + 1}`;
    const renderOptions = video.render_options?.split('\n')?.join(';') ?? '';

    return (
      `sar_alias autorender_video_${index} "${renderOptions};playdemo ${demoName};` +
      `sar_alias autorender_queue ${nextCommand}"`
    );
  };

  const usesQueue = (videos?.length ?? 0) > 1;
  const nextCommand = usesQueue ? 'autorender_queue' : exitCommand;
  const eventCommand = AUTORENDER_PATCHED_SAR ? 'sar_on_renderer_finish' : 'sar_on_demo_stop';
  const firstVideo = videos?.at(0);

  // Quality for each video here should be the same which is handled server-side.
  const [width, height] = getGameResolution(firstVideo?.render_quality ?? RenderQuality.HD_720p);

  let autoexecFile = '';

  if (!options.noAutoexec) {
    const renderOptions = firstVideo?.render_options?.split('\n')?.join(';') ?? '';
    const demoFile = firstVideo?.video_id ?? options.benchmarkFile;

    const autoexec = [
      `exec ${game.cfg}`,
      ...getAutoexecQuirks(game),
      `sar_quickhud_set_texture crosshair/quickhud${height}-`,
      `cl_crosshairgap ${height / 120}`,
      ...(videos ? videos.slice(1).map(playdemo) : []),
      ...(usesQueue ? ['sar_alias autorender_queue autorender_video_0'] : []),
      `${eventCommand} "${nextCommand}"`,
      ...(demoFile ? [`${renderOptions};playdemo ${getDemoName(demoFile)}`] : []),
    ];

    autoexecFile = realGameModFolder(game, 'cfg', 'autoexec.cfg');

    await Deno.writeTextFile(autoexecFile, autoexec.join('\n'));
  }

  const getCommand = (): [string, string] => {
    const command = gameFolder(game, game.exe);

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

  const args: string[] = [
    argv0,
    '-game',
    game.mod === 'portalreloaded' ? 'portal2' : game.sourcemod ? `../../sourcemods/${game.mod}` : game.mod,
    '-novid',
    // TODO: vulkan is not always available
    //"-vulkan",
    '-windowed',
    '-w',
    width.toString(),
    '-h',
    height.toString(),
  ];

  logger.info(JSON.stringify({ command, args }));

  return [autoexecFile, new Deno.Command(command, { args })];
};

export class GameProcess {
  process: Deno.ChildProcess | null = null;
  processName = '';
  timeout: number | null = null;
  autoexecFile = '';
  killed = false;

  constructor() {
    Deno.addSignalListener('SIGINT', () => {
      if (this.process) {
        try {
          logger.info('Handling termination...');
          this.killGameProcess();
          logger.info('Termination handled');
        } catch (err) {
          logger.error(err);
        } finally {
          this.process = null;
        }
      }

      Deno.exit();
    });
  }

  /**
   * Spawns a new game process.
   */
  async launch(
    options: {
      config: Config;
      game: GameConfig;
      videos?: VideoPayload[];
      timeoutInSeconds?: number;
      noTimeout?: boolean;
      noAutoexec?: boolean;
      benchmarkFile?: string;
    },
  ) {
    const { config, game, videos } = options;

    const [autoexecFilePath, command] = await prepareGameLaunch({
      config,
      game,
      videos,
      noAutoexec: options.noAutoexec,
      benchmarkFile: options.benchmarkFile,
    });

    this.autoexecFile = autoexecFilePath;

    logger.info('Spawning process...');

    this.killed = false;
    this.process = command.spawn();
    this.processName = game.proc;

    logger.info(`Spawned process ${this.process.pid}`);

    if (!options.noTimeout) {
      const processTimeout = options.timeoutInSeconds ?? videos?.reduce(
        (total, video) => {
          return total + (video.demo_playback_time * config.autorender['scale-timeout']) +
            config.autorender['load-timeout'];
        },
        config.autorender['base-timeout'],
      ) ?? config.autorender['base-timeout'];

      logger.info(`Process timeout in ${processTimeout.toFixed(2)} seconds`);

      this.timeout = setTimeout(() => {
        if (this.process) {
          try {
            logger.warn('Timeout of process');
            this.killGameProcess();
            logger.warn('Killed process');
          } catch (err) {
            logger.error(err);
          } finally {
            this.process = null;
          }
        }
      }, processTimeout * 1_000);
    }

    const { code } = await this.process.output();

    this.clearTimeout();
    this.process = null;

    logger.info('Game exited', { code });

    return {
      killed: this.killed,
      code,
    };
  }

  /**
   * Removes the temporary autoexec file.
   */
  async removeAutoexec() {
    if (this.autoexecFile) {
      try {
        await Deno.remove(this.autoexecFile);
      } catch (err) {
        logger.error(`Failed to remove temporary autoexec ${this.autoexecFile}`, err);
      }
    }
  }

  /**
   * Kills the game process.
   */
  killGameProcess() {
    if (!this.process) {
      return;
    }

    // Negative PID in Unix means killing the entire process group.
    const pid = Deno.build.os === 'windows' ? this.process.pid : -this.process.pid;

    logger.info(`Killing process ${pid}`);

    //Deno.kill(pid, "SIGKILL");

    // Deno.kill does not work for some reason :>
    if (Deno.build.os !== 'windows') {
      const kill = new Deno.Command('pkill', { args: [this.processName] });
      const { code } = kill.outputSync();
      logger.info(`pkill ${this.processName}`, { code });
    } else {
      Deno.kill(pid, 'SIGKILL');
    }

    this.killed = true;
    logger.info('killed');
  }

  /**
   * Safely tries to kill game process
   */
  tryKillGameProcess() {
    try {
      this.killGameProcess();
    } catch (err) {
      logger.error(err);
    } finally {
      this.process = null;
    }
  }

  /**
   * Clears process timeout.
   */
  clearTimeout() {
    if (this.timeout !== null) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}
