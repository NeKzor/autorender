/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { join } from 'https://deno.land/std@0.192.0/path/mod.ts';
import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/command/mod.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';
import { Cell, Table } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/table/mod.ts';
import { logger } from './logger.ts';
import {
  Config,
  configExplanation,
  downloadAutorenderConfig,
  downloadQuickhud,
  downloadSourceAutoRecord,
  gameModsWhichSupportWorkshop,
  getConfigOnly,
  getGameName,
  parseAndValidateConfig,
} from './config.ts';
import { AutorenderVersion, UserAgent } from './version.ts';
import { YAMLError } from 'https://deno.land/std@0.193.0/yaml/_error.ts';
import { Confirm } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/confirm.ts';
import { Select } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/select.ts';
import * as yaml from 'https://deno.land/std@0.193.0/yaml/mod.ts';
import { gameFolder, gameModFolder, realGameModFolder } from './utils.ts';

export interface Options {
  devMode: boolean;
  verboseMode: boolean;
}

let options: Options | null = null;

export const getOptions = async () => {
  if (!options) {
    const { options: { verbose, dev } } = await new Command()
      .name('autorender')
      .version(AutorenderVersion)
      .description('Command line app for connecting to autorender.nekz.me')
      .option('-c, --check', 'Health check of the app.')
      .option('-v, --verbose', 'Turn on verbose logging.')
      .option('-d, --dev', 'Switch into developer mode.')
      .option('-s, --sar', 'Download latest SourceAutoRecord version.')
      .option('-C, --cfg', 'Download latest autorender.cfg file.')
      .option('-q, --quickhud', 'Download latest quickhud files.')
      .option('-b, --benchmark', 'Run a benchmark render for finding the correct scale-timeout value.')
      .option('-l, --launch', 'Test if a game can be launched.')
      .option('-e, --explain', 'Explain all config options.')
      .option('-a, --validate', 'Validate if the config file is correct.')
      .action(async ({ verbose, check, dev, sar, cfg, quickhud, benchmark, launch, explain, validate }) => {
        const options = {
          devMode: !!dev,
          verboseMode: !!verbose,
        };

        check && await runCheck(options);
        explain && runExplain();
        validate && await runValidate(options);

        if (sar) {
          await downloadSourceAutoRecord(await getConfigOnly(), options);
          Deno.exit(0);
        }

        if (cfg) {
          await downloadAutorenderConfig(await getConfigOnly(), options);
          Deno.exit(0);
        }

        if (quickhud) {
          await downloadQuickhud(await getConfigOnly(), options);
          Deno.exit(0);
        }

        if (benchmark) {
          await runBenchmark(await getConfigOnly(), options);
          Deno.exit(0);
        }

        if (launch) {
          await launchGame(await getConfigOnly(), options);
          Deno.exit(0);
        }
      })
      .parse(Deno.args);

    options = {
      devMode: !!dev,
      verboseMode: !!verbose,
    };
  }

  return options;
};

export const getOptionsOnly = () => {
  return options!;
};

export const getBinary = async (
  url: string,
  options: {
    onStart?: () => void;
    onProgress?: (event: { loaded: number; total: number }) => void;
    onEnd?: () => void;
  },
) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UserAgent,
    },
  });

  let loaded = 0;
  const total = Number(res.headers.get('Content-Length')) || 0;

  const { onStart, onProgress, onEnd } = options;

  return await new Response(
    new ReadableStream({
      async start(controller) {
        onStart && onStart();

        const reader = res.body!.getReader();

        onProgress && onProgress({ loaded, total });

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            onEnd && onEnd();
            return;
          }

          if (onProgress) {
            loaded += value.byteLength;
            onProgress({ loaded, total });
          }

          controller.enqueue(value);
        }
      },
    }),
    {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    },
  ).blob();
};

const runCheck = async (options: Options) => {
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

const runExplain = () => {
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

const runValidate = async ({ verboseMode }: Options) => {
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

const runBenchmark = async (
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
          options?.verboseMode === false && console.error(err);
        }
      }
    } catch (err) {
      console.log(colors.red('Failed to find rendered video'));
      options?.verboseMode === false && console.error(err);
    }
  } catch (err) {
    options?.verboseMode === false && console.error(err);
  } finally {
    if (autoexecFile) {
      try {
        await Deno.remove(autoexecFile);
      } catch (err) {
        console.log(colors.red(`Failed to remove temporary autoexec ${autoexecFile}`), err);
      }
    }
  }
};

const launchGame = async (
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
    options?.verboseMode === false && console.error(err);
  }
};

export const getRelease = async (
  url: string,
  options?: { verboseMode?: Options['verboseMode'] },
) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UserAgent,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} : status ${res.status}`);
    }
    return await res.json() as GitHubRelease;
  } catch (err) {
    options?.verboseMode === false && logger.error(err);
    return null;
  }
};

interface GitHubRelease {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: [
    {
      url: string;
      id: number;
      node_id: string;
      name: string;
      label: null;
      uploader: {
        login: string;
        id: number;
        node_id: string;
        avatar_url: string;
        gravatar_id: string;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
      };
      content_type: string;
      state: string;
      size: number;
      download_count: number;
      created_at: string;
      updated_at: string;
      browser_download_url: string;
    },
    {
      url: string;
      id: number;
      node_id: string;
      name: string;
      label: null;
      uploader: {
        login: string;
        id: number;
        node_id: string;
        avatar_url: string;
        gravatar_id: string;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
      };
      content_type: string;
      state: string;
      size: number;
      download_count: number;
      created_at: string;
      updated_at: string;
      browser_download_url: string;
    },
  ];
  tarball_url: string;
  zipball_url: string;
  body: string;
}
