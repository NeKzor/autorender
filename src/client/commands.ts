/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { dirname, join } from 'path/mod.ts';
import { colors } from 'cliffy/ansi/colors.ts';
import { Cell, Table } from 'cliffy/table/mod.ts';
import { logger } from './logger.ts';
import {
  Config,
  configExplanation,
  createGameConfig,
  downloadAutorenderConfig,
  downloadQuickhud,
  downloadSourceAutoRecord,
  gameModsWhichSupportWorkshop,
  getConfigOnly,
  getGameName,
  parseAndValidateConfig,
  supportedGames,
} from './config.ts';
import { AutorenderVersion, UserAgent } from './constants.ts';
import { YAMLError } from 'yaml/_error.ts';
import { Checkbox, Confirm, Input, prompt, Select } from 'cliffy/prompt/mod.ts';
import * as yaml from 'yaml/mod.ts';
import { gameFolder, gameModFolder, realGameModFolder } from './utils.ts';
import { Options } from './cli.ts';
import { getRelease } from './github.ts';

const isWindows = Deno.build.os === 'windows';

export const runCheck = async (options: Options) => {
  const { verboseMode } = options;

  try {
    // Check if autorender.yaml is configured
    const config = await getConfigOnly();
    if (!config) {
      console.log(
        colors.yellow('The autorender.yaml config file could not be found'),
      );
      Deno.exit(1);
    }

    console.log(
      colors.green(
        'Found existing autorender.yaml config file',
      ),
    );

    // Check for latest autorender version
    const autorender = await getRelease(
      'https://api.github.com/repos/NeKzor/autorender/releases/latest',
      options,
    );

    if (!autorender) {
      console.log(
        colors.red('Failed to fetch latest autorender release'),
      );

      Deno.exit(1);
    }

    if (autorender && autorender.tag_name !== AutorenderVersion) {
      console.log(
        colors.green(
          `A new release of autorender is available: ${colors.cyan(AutorenderVersion)} ${colors.white('→')} ${
            colors.cyan(autorender.tag_name)
          }`,
        ),
      );
      console.log(
        colors.italic.gray(
          `https://github.com/NeKzor/autorender/releases`,
        ),
      );
      Deno.exit(1);
    }

    console.log(
      colors.green(
        `Autorender is on latest version ${AutorenderVersion}`,
      ),
    );

    // Check if SAR needs to be downloaded
    const sar = await getRelease(
      'https://api.github.com/repos/NeKzor/sar/releases/latest',
      options,
    );

    if (!sar) {
      console.log(
        colors.red('Failed to fetch latest SourceAutoRecord release'),
      );
      Deno.exit(1);
    }

    if (sar.tag_name !== config.sar.version) {
      console.log(
        colors.green(
          `A new release of SourceAutoRecord is available: ${colors.cyan(config.sar.version)} ${colors.white('→')} ${
            colors.cyan(sar.tag_name)
          }`,
        ),
      );
      console.log(
        colors.italic.gray(
          `https://github.com/NeKzor/sar/releases`,
        ),
      );
      Deno.exit(1);
    }

    console.log(
      colors.green(
        `SourceAutoRecord is on latest version ${config.sar.version}`,
      ),
    );

    const sarFilename = Deno.build.os === 'windows' ? 'sar.dll' : 'sar.so';

    for (const game of config.games) {
      const { state } = await Deno.permissions.request({
        name: 'read',
        path: game.dir,
      });

      if (state !== 'granted') {
        Deno.exit(1);
      }

      const files = [
        gameFolder(game, sarFilename),
        realGameModFolder(game, config.autorender['folder-name']),
        realGameModFolder(game, 'cfg', game.cfg),
        realGameModFolder(game, 'crosshair'),
      ];

      if (gameModsWhichSupportWorkshop.includes(game.mod)) {
        files.push(gameModFolder(game, 'maps', 'workshop'));
      }

      for (const file of files) {
        try {
          await Deno.stat(file);
          console.log(
            colors.green(`Found ${file}`),
          );
        } catch (err) {
          if (err instanceof Deno.errors.NotFound) {
            console.log(
              colors.red(`${file} not found`),
            );
          } else {
            verboseMode && logger.error(err);
          }
        }
      }
    }

    console.log(
      colors.green(
        'Passed all checks',
      ),
    );

    Deno.exit(0);
  } catch (err) {
    verboseMode && logger.error(err);
    Deno.exit(1);
  }
};

export const runExplain = () => {
  const entries = Object.entries(configExplanation);

  const explanation = new Table(
    ...entries.map(([key, value]) => {
      const descriptions = Object.entries(Array.isArray(value) ? value.at(0)! : value);
      return [
        [
          new Cell(key).rowSpan(descriptions.length),
          new Cell(descriptions.at(0)!.at(0)!.toString().replace('*', colors.bold('*'))),
          new Cell(descriptions.at(0)!.at(1)!.toString()),
        ],
        ...descriptions.slice(1).map(([key, value]) => {
          return [
            new Cell(key.replace('*', colors.bold('*'))),
            new Cell(value as string),
          ];
        }),
      ];
    }).flat(),
  );

  explanation.border().render();

  console.log(`Options marked with ${colors.bold('*')} can be tweaked.`);

  Deno.exit(0);
};

export const runValidate = async ({ verboseMode }: Options) => {
  try {
    await parseAndValidateConfig();

    console.log(colors.green(`Validated config file with 0 errors.`));
    Deno.exit(0);
  } catch (err) {
    verboseMode && logger.error(err);

    if (err instanceof Deno.errors.NotFound) {
      console.log(colors.red(`❌️ Config file not found.`));
    } else if (err instanceof YAMLError) {
      console.log(colors.red(`❌️ ${err.message}`));
    }

    Deno.exit(1);
  }
};

export const runBenchmark = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  const game = config.games.find(({ mod }) => mod === 'portal2');
  if (!game) {
    console.log(colors.red(`❌️ Benchmark is currently only available on Portal 2`));
    Deno.exit(1);
  }

  let autoexecFile = '';

  const cleanupAutoexec = async () => {
    if (autoexecFile) {
      try {
        await Deno.remove(autoexecFile);
      } catch (err) {
        options.verboseMode && console.error(err);
        console.log(colors.red(`Failed to remove temporary autoexec ${autoexecFile}`));
      }
    }
  };

  try {
    const { state: readAccess } = await Deno.permissions.request({
      name: 'read',
      path: game.dir,
    });

    if (readAccess !== 'granted') {
      Deno.exit(1);
    }

    const { state: writeAccess } = await Deno.permissions.request({
      name: 'write',
      path: game.dir,
    });

    if (writeAccess !== 'granted') {
      Deno.exit(1);
    }

    const demoPlaybackTime = 9.666;
    const demoBenchmarkFile = 'portal2_benchmark.dem';

    console.log(colors.white(`🚦️ Downloading ${demoBenchmarkFile}`));

    const res = await fetch(`${config.autorender['base-api']}/storage/files/${demoBenchmarkFile}`, {
      headers: {
        'User-Agent': UserAgent,
      },
    });

    if (!res.ok) {
      console.log(colors.red(`❌️ Failed to fetch ${demoBenchmarkFile}`));
      Deno.exit(1);
    }

    console.log(colors.white(`🚦️ Downloaded ${demoBenchmarkFile}`));

    const data = new Uint8Array(await res.arrayBuffer());
    const file = realGameModFolder(game, config.autorender['folder-name'], demoBenchmarkFile);

    try {
      await Deno.writeFile(file, data);

      console.log(
        colors.white(`🚦️ Installed ${colors.italic.gray(file)}`),
      );
    } catch (err) {
      options.verboseMode && logger.error(err);

      console.log(colors.red(`❌️ Failed to install ${colors.italic.gray(file)}`));
      Deno.exit(1);
    }

    const videoFile = realGameModFolder(game, config.autorender['folder-name'], `${demoBenchmarkFile}.mp4`);

    try {
      await Deno.remove(videoFile);
      // deno-lint-ignore no-empty
    } catch {}

    const autoexec = [
      `exec ${game.cfg}`,
      `sar_quickhud_set_texture crosshair/quickhud720-`,
      `sar_on_renderer_finish "wait 300;exit"`,
      `playdemo ${join(config.autorender['folder-name'], demoBenchmarkFile)}`,
    ];

    autoexecFile = realGameModFolder(game, 'cfg', 'autoexec.cfg');

    await Deno.writeTextFile(autoexecFile, autoexec.join('\n'));

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

    const args = [
      argv0,
      '-game',
      game.mod === 'portalreloaded' ? 'portal2' : game.sourcemod ? `../../sourcemods/${game.mod}` : game.mod,
      '-novid',
      '-windowed',
      '-w',
      '1280',
      '-h',
      '720',
    ];

    const cmd = new Deno.Command(command, { args });

    const gameProcess = cmd.spawn();
    const gameProcessName = game.proc;

    console.log(colors.white(`Spawned process ${gameProcess.pid}`));

    let killed = false;

    const killGameProcess = () => {
      killed = true;

      const pid = Deno.build.os === 'windows' ? gameProcess.pid : -gameProcess.pid;

      console.log(colors.white(`Killing process ${pid}`));

      if (Deno.build.os !== 'windows') {
        const kill = new Deno.Command('pkill', { args: [gameProcessName] });
        const { code } = kill.outputSync();
        console.log(colors.white(`pkill ${gameProcessName}`), { code });
      } else {
        Deno.kill(pid, 'SIGKILL');
      }

      console.log(colors.white('killed'));
    };

    console.log(colors.white('Killing process after 5 minutes'));
    setTimeout(killGameProcess, 5 * 60 * 1_000);

    const start = performance.now();
    const { code } = await gameProcess.output();
    const end = performance.now();

    console.log(colors.white('Game exited'), { code });

    if (killed || code !== 0) {
      console.log(colors.red('Failed to render the benchmark video'));
      Deno.exit(1);
    }

    try {
      await Deno.stat(videoFile);
      console.log(colors.green('Successfully rendered the benchmark video'));

      const renderTime = (end - start) / 1_000;
      const scaleTimeout = renderTime / demoPlaybackTime;
      const suggestedScaleTimeout = Math.ceil(scaleTimeout) + 1;

      console.log(colors.white('Render time:'), renderTime.toFixed(3), 'seconds');
      console.log(colors.white('Suggested render scale-timeout setting:'), suggestedScaleTimeout);

      const confirmed = await Confirm.prompt('🚦️ Should this value be saved in the autorender config?');
      if (confirmed) {
        try {
          config.autorender['scale-timeout'] = suggestedScaleTimeout;
          // deno-lint-ignore no-explicit-any
          const autorenderYaml = yaml.stringify(config as any);
          const configFile = join(Deno.env.get('PWD') ?? '', 'autorender.yaml');
          await Deno.writeTextFile(configFile, autorenderYaml);

          console.log(colors.green(`🛠️  Saved config file ${configFile}`));
        } catch (err) {
          options.verboseMode && console.error(err);
          Deno.exit(1);
        }
      }
    } catch (err) {
      console.log(colors.red('Failed to find rendered video'));
      options.verboseMode && console.error(err);
      Deno.exit(1);
    }
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red('Error'));
    await cleanupAutoexec();
    Deno.exit(1);
  }

  await cleanupAutoexec();
  Deno.exit(0);
};

export const launchGame = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  try {
    const gameToLaunch = await Select.prompt<string>({
      message: '🎮️ Select a game to test if it can ben launched.',
      options: config.games.map((game) => ({ value: game.mod, name: getGameName(game) ?? '' })),
    });

    const game = config.games.find((game) => game.mod === gameToLaunch)!;

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

    const args = [
      argv0,
      '-game',
      game.mod === 'portalreloaded' ? 'portal2' : game.sourcemod ? `../../sourcemods/${game.mod}` : game.mod,
      '-novid',
      '-windowed',
      '-w',
      '1280',
      '-h',
      '720',
    ];

    const cmd = new Deno.Command(command, { args });

    console.log(colors.white('Spawning process'));

    const gameProcess = cmd.spawn();

    console.log(colors.white(`Spawned process ${gameProcess.pid}`));

    const { code } = await gameProcess.output();
    console.log(colors.white('Game exited'), { code });
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red('Error'));
    Deno.exit(1);
  }

  Deno.exit(0);
};

export const addNewGame = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  try {
    const availableGames = Object.entries(supportedGames)
      .filter(([_, game]) => !config.games.some(({ mod }) => mod === game.mod))
      .map(([name]) => name);

    if (!availableGames.length) {
      console.log(colors.white(`You already support all available games.`));
      Deno.exit(1);
    }

    const setup = await prompt([
      {
        name: 'game_mod',
        type: Checkbox,
        message: '🎮️ Which games should be added? Select a game with spacebar.',
        options: availableGames,
        minOptions: 1,
        confirmSubmit: false,
      },
      {
        name: 'steam_common',
        message: '📂️ Please enter your Steam\'s common directory path where all games are installed.',
        type: Input,
        suggestions: [
          isWindows
            ? 'C:\\Program Files (x86)\\Steam\\steamapps\\common'
            : join('/home/', Deno.env.get('USER') ?? 'user', '/.steam/steam/steamapps/common'),
        ],
        after: async ({ steam_common, game_mod }, next) => {
          if (steam_common) {
            try {
              const { state } = await Deno.permissions.request({
                name: 'read',
                path: steam_common,
              });

              if (state !== 'granted') {
                console.log(colors.red('❌️ Access denied for Steam\'s common folder.'));
                Deno.exit(1);
              }

              const stat = await Deno.stat(steam_common);
              if (stat.isDirectory) {
                let errored = false;

                for (const game of game_mod ?? []) {
                  const supportedGame = supportedGames[game as keyof typeof supportedGames]!;
                  const gamesDir = supportedGame.sourcemod ? join(dirname(steam_common), 'sourcemods') : steam_common;

                  if (supportedGame.sourcemod) {
                    const { state } = await Deno.permissions.request({
                      name: 'read',
                      path: gamesDir,
                    });

                    if (state !== 'granted') {
                      console.log(colors.red('❌️ Access denied for Steam\'s sourcemods folder.'));
                      Deno.exit(1);
                    }
                  }

                  try {
                    await Deno.stat(join(gamesDir, game));
                  } catch (err) {
                    options.verboseMode && logger.error(err);

                    console.error(colors.red(`❌️ ${game} is not installed.`));

                    errored = true;
                  }
                }

                if (errored) {
                  Deno.exit(1);
                }

                return await next();
              }
            } catch (err) {
              options.verboseMode && logger.error(err);
            }
          }

          console.log(colors.red('Invalid directory.'));
          await next('steam_common');
        },
      },
    ]);

    const newGames = setup.game_mod!.map(createGameConfig(setup.steam_common!));

    if (newGames.some((game) => !game.sourcemod)) {
      try {
        await downloadSourceAutoRecord(config, options, newGames);
      } catch (err) {
        options.verboseMode && console.error(err);
        console.log(colors.red(`❌️ Failed to install SourceAutoRecord`));
        Deno.exit(1);
      }
    }

    try {
      await downloadAutorenderConfig(config, options, newGames);
    } catch (err) {
      options.verboseMode && console.error(err);
      console.log(colors.red(`❌️ Failed to install autorender.cfg`));
      Deno.exit(1);
    }

    try {
      await downloadQuickhud(config, options, newGames);
    } catch (err) {
      options.verboseMode && console.error(err);
      console.log(colors.red(`❌️ Failed to install quickhud`));
      Deno.exit(1);
    }

    try {
      config.games.push(...newGames);

      // deno-lint-ignore no-explicit-any
      const autorenderYaml = yaml.stringify(config as any);
      const configFile = join(Deno.env.get('PWD') ?? '', 'autorender.yaml');
      await Deno.writeTextFile(configFile, autorenderYaml);

      console.log(colors.green(`🛠️  Saved config file ${configFile}`));
    } catch (err) {
      options.verboseMode && console.error(err);
      console.log(colors.red('Failed to save config file'));
      Deno.exit(1);
    }
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red('Error'));
    Deno.exit(1);
  }

  Deno.exit(0);
};
