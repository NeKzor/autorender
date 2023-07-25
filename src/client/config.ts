/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as yaml from 'https://deno.land/std@0.193.0/yaml/mod.ts';
import { Checkbox, Input, prompt, Secret, Select } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/mod.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';
import { bgCyan } from 'https://deno.land/std@0.192.0/fmt/colors.ts';
import { join } from 'https://deno.land/std@0.192.0/path/mod.ts';
import { getBinary, getOptionsOnly, getRelease, Options } from './options.ts';
import { BlobReader, Uint8ArrayWriter, ZipReader } from 'https://deno.land/x/zipjs@v2.7.20/index.js';
import ProgressBar from 'https://deno.land/x/progress@v1.3.8/mod.ts';
import { logger } from './logger.ts';
import { writeAll } from 'https://deno.land/std@0.189.0/streams/write_all.ts';
import { UserAgent } from './version.ts';

const isWindows = Deno.build.os === 'windows';

export interface Config {
  autorender: {
    'access-token': string;
    'connect-uri': string;
    'base-api': string;
    'folder-name': string;
    protocol: string;
    'max-supported-quality': string;
    // Timeout interval in ms to check if there are new videos to render.
    'check-interval': number;
    // Approximated scaling factor for multiplying the demo playback time.
    'scale-timeout': number;
    // Approximated time in seconds of how long it takes to load a demo.
    'load-timeout': number;
    // Approximated time in seconds of how long it takes to start/exit the game process.
    'base-timeout': number;
  };
  sar: {
    version: string;
  };
  games: GameConfig[];
}

type ConfigDescription<T> = Record<Extract<keyof T, string> & `${Extract<keyof T, string>}*`, string>;

export const configExplanation: {
  autorender: ConfigDescription<Config['autorender']>;
  sar: ConfigDescription<Config['sar']>;
  games: ConfigDescription<Config['games']['0']>[];
} = {
  autorender: {
    'access-token': 'Copied access token from the website.',
    'connect-uri': 'Connection URI to the server.',
    'base-api': 'Base API URI to the website.',
    'folder-name': 'Name of the folder in which each game saves the rendered videos.',
    protocol: 'Current protocol version between client and server.',
    'max-supported-quality*': 'The render quality that the client is able to provide. Options are: 1080p, 720p, 480p',
    'check-interval*': 'Timeout interval in ms to check if there are new videos to render.',
    'scale-timeout*': 'Approximated scaling factor for multiplying the demo playback time.',
    'load-timeout*': 'Approximated time in seconds of how long it takes to load a demo.',
    'base-timeout*': 'Approximated time in seconds of how long it takes to start and exit the game process.',
  },
  sar: {
    version: 'Currently installed SAR version.',
  },
  games: [
    {
      exe: 'Name of the games\'s executable file.',
      proc: 'Name of the game\'s process.',
      cfg: 'Name of the installed autorender cfg file for the game.',
      mod: 'Name of the game\'s mod directory.',
      dir: 'Path where the game is installed.',
    },
  ],
};

export type GameMods =
  | 'portal2'
  | 'aperturetag'
  | 'twtm'
  | 'portalstories'
  | 'p2ce'
  | 'portalreloaded';

export const gameModsWhichSupportWorkshop: GameMods[] = [
  'portal2',
  'aperturetag',
  'twtm',
  'p2ce',
  'portalreloaded',
];

export interface GameConfig {
  exe: string;
  proc: string;
  cfg: string;
  mod: GameMods;
  dir: string;
}

const supportedGames: Record<string, Partial<GameConfig>> = {
  'Portal 2': {
    mod: 'portal2',
  },
  'Aperture Tag': {
    mod: 'aperturetag',
  },
  'Thinking with Time Machine': {
    mod: 'twtm',
  },
  'Portal Stories Mel': {
    mod: 'portalstories',
  },
  'Portal 2 Community Edition': {
    mod: 'p2ce',
  },
  'Portal Reloaded': {
    mod: 'portalreloaded',
  },
};

const configFile = join(Deno.env.get('PWD') ?? '', 'autorender.yaml');

let config: Config | null = null;

export const getConfig = async () => {
  if (!config) {
    try {
      config = yaml.parse(await Deno.readTextFile(configFile)) as Config;
    } catch {
      config = await createConfig();
    }
  }
  return config;
};

export const getConfigOnly = async () => {
  if (!config) {
    try {
      config = yaml.parse(await Deno.readTextFile(configFile)) as Config;
    } catch {
      return null;
    }
  }
  return config;
};

const createConfig = async () => {
  const options = getOptionsOnly();

  const [connectUri, baseApi] = options.devMode
    ? [
      'ws://autorender.portal2.local:8001/connect/client',
      'http://autorender.portal2.local:8001',
    ]
    : [
      'wss://autorender.nekz.me/connect/client',
      'https://autorender.nekz.me',
    ];

  console.log(colors.bold.white('Client setup for autorender!'));
  console.log(
    colors.white(`Please visit ${baseApi} to get your token.`),
  );

  const setup = await prompt([
    {
      name: 'access_token',
      message: '🔑️ Enter or paste your access token here:',
      type: Secret,
      after: async ({ access_token }, next) => {
        if (access_token) {
          const res = await fetch(`${baseApi}/tokens/test`, {
            method: 'POST',
            headers: {
              'User-Agent': UserAgent,
            },
            body: JSON.stringify({ token_key: access_token }),
          });

          if (res.ok) {
            return await next();
          }

          console.warn(
            colors.yellow(
              `Entered token seems to be expired or does not exist. Status: ${res.statusText}`,
            ),
          );
        }

        await next('access_token');
      },
    },
    {
      name: 'supported_quality',
      message: '📺️ What is the maximum quality you want to support? (default: 1080p)',
      type: Select,
      options: ['1080p (default)', '720p', '480p'],
    },
    {
      name: 'game_mod',
      message: '🎮️ Which games do you support? (default: Portal 2) Select a game with spacebar.',
      type: Checkbox,
      options: Object.keys(supportedGames),
      minOptions: 1,
      confirmSubmit: false,
    },
    {
      name: 'steam_common',
      message: '📂️ Please enter your Steam\'s common directory path where all games are installed.',
      suggestions: [
        isWindows ? 'C:\\Program Files\\Steam\\steamapps\\common' : join(
          '/home/',
          Deno.env.get('USER') ?? 'user',
          '/.steam/steam/steamapps/common',
        ),
      ],
      type: Input,
      after: async ({ steam_common, game_mod }, next) => {
        if (steam_common) {
          try {
            const { state } = await Deno.permissions.request({
              name: 'read',
              path: steam_common,
            });
            if (state !== 'granted') {
              console.log(
                colors.red('❌️ Access denied for Steam\'s common folder.'),
              );
              Deno.exit(1);
            }

            const stat = await Deno.stat(steam_common);
            if (stat.isDirectory) {
              let errored = false;

              for (const game of game_mod ?? []) {
                try {
                  await Deno.stat(join(steam_common, game));
                } catch (err) {
                  options.verboseMode && logger.error(err);

                  console.error(
                    colors.red(`❌️ ${game} is not installed.`),
                  );

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

  const config: Config = {
    'autorender': {
      'access-token': setup.access_token!,
      'connect-uri': connectUri,
      'base-api': baseApi,
      'folder-name': 'autorender',
      'protocol': 'autorender-v1',
      'max-supported-quality': '1080p',
      'check-interval': 1_000,
      'scale-timeout': 9,
      'load-timeout': 5,
      'base-timeout': 30,
    },
    sar: {
      version: '',
    },
    'games': [
      ...setup.game_mod!.map((game) => {
        return {
          exe: isWindows ? 'portal2.exe' : 'portal2.sh',
          proc: isWindows ? 'portal2.exe' : 'portal2_linux',
          cfg: 'autorender.cfg',
          ...supportedGames[game as keyof typeof supportedGames],
          dir: join(setup.steam_common!, game),
        } as Config['games']['0'];
      }),
    ],
  };

  try {
    await downloadSourceAutoRecord(config, options);
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red(`❌️ Failed to install SourceAutoRecord`));
    Deno.exit(1);
  }

  try {
    await downloadAutorenderConfig(config, options);
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red(`❌️ Failed to install autorender.cfg`));
    Deno.exit(1);
  }

  try {
    await downloadQuickhud(config, options);
  } catch (err) {
    options.verboseMode && console.error(err);
    console.log(colors.red(`❌️ Failed to install quickhud`));
    Deno.exit(1);
  }

  // deno-lint-ignore no-explicit-any
  const autorenderYaml = yaml.stringify(config as any);
  await Deno.writeTextFile(configFile, autorenderYaml);

  console.log(colors.green(`🛠️  Generated config file ${configFile}`));

  return config;
};

// Download and install SAR
export const downloadSourceAutoRecord = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  await writeAll(
    Deno.stdout,
    new TextEncoder().encode(colors.white('\r🗿️ Getting SourceAutoRecord')),
  );

  const sarRelease = await getRelease(
    'https://api.github.com/repos/NeKzor/sar/releases/latest',
    options,
  );

  config.sar.version = sarRelease?.tag_name ?? '';

  const url = sarRelease
    ?.assets
    ?.find(({ name }) => name.includes('linux'))
    ?.browser_download_url;

  if (!url) {
    console.log(colors.red(`❌️ Failed to get latest SourceAutoRecord release`));
    Deno.exit(1);
  }

  let progress = {} as ProgressBar;

  await writeAll(
    Deno.stdout,
    new TextEncoder().encode(colors.white('\r🗿️ Found SourceAutoRecord release')),
  );

  const sar = await getBinary(url, {
    onStart: () => {
      progress = new ProgressBar({
        title: colors.white('🗿️ Downloading SourceAutoRecord'),
        total: 100,
        complete: bgCyan(' '),
        clear: true,
      });
    },
    onProgress: (event) => {
      const completed = Math.floor((event.loaded / event.total) * 100);
      if (completed <= 100) {
        progress.render(completed);
      }
    },
    onEnd: () => {
      progress.end();
    },
  });

  if (!sar) {
    console.log(colors.red(`❌️ Failed to download SourceAutoRecord`));
    Deno.exit(1);
  }

  console.log(colors.white(`🗿️ Downloaded SourceAutoRecord`));

  let zip: ZipReader<BlobReader> | null = null;

  try {
    zip = new ZipReader(new BlobReader(sar), { useWebWorkers: false });

    const binary = (await zip.getEntries()).shift();
    if (!binary) {
      throw new Error('Failed to find sar binary inside zip.');
    }

    const data = await binary.getData!(new Uint8ArrayWriter());

    for (const game of config.games) {
      const file = join(game.dir, binary.filename);

      try {
        const { state } = await Deno.permissions.request({
          name: 'write',
          path: game.dir,
        });

        if (state !== 'granted') {
          Deno.exit(1);
        }

        await Deno.writeFile(file, data);

        console.log(
          colors.white(`🗿️ Installed ${colors.italic.gray(file)}`),
        );
      } catch (err) {
        options.verboseMode && logger.error(err);

        console.log(colors.red(`❌️ Failed to install ${file}`));
        Deno.exit(1);
      }
    }

    await zip.close();
  } catch (err) {
    options.verboseMode && logger.error(err);

    console.log(colors.red(`❌️ Failed to install SourceAutoRecord`));
    Deno.exit(1);
  } finally {
    await zip?.close();
  }
};

// Download and install autorender.cfg
export const downloadAutorenderConfig = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  console.log(colors.white(`📄️ Getting autorender.cfg`));

  const res = await fetch(`${config.autorender['base-api']}/storage/files/autorender.cfg`, {
    headers: {
      'User-Agent': UserAgent,
    },
  });

  if (!res.ok) {
    console.log(colors.red(`❌️ Failed to fetch autorender.cfg`));
    Deno.exit(1);
  }

  console.log(colors.white(`📄️ Downloaded autorender.cfg`));

  const data = new Uint8Array(await res.arrayBuffer());

  for (const game of config.games) {
    const file = join(game.dir, game.mod, 'cfg', 'autorender.cfg');

    try {
      const { state } = await Deno.permissions.request({
        name: 'write',
        path: file,
      });

      if (state !== 'granted') {
        Deno.exit(1);
      }

      await Deno.writeFile(file, data);

      console.log(
        colors.white(`📄️ Installed ${colors.italic.gray(file)}`),
      );
    } catch (err) {
      options.verboseMode && logger.error(err);

      console.log(colors.red(`❌️ Failed to install ${colors.italic.gray(file)}`));
      Deno.exit(1);
    }
  }
};

// Download and install quickhud.zip
export const downloadQuickhud = async (
  config: Config | null,
  options: Options,
) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  console.log(colors.white(`🔵️ Getting quickhud.zip`));

  let progress = {} as ProgressBar;

  const quickhud = await getBinary(`${config.autorender['base-api']}/storage/files/quickhud.zip`, {
    onStart: () => {
      progress = new ProgressBar({
        title: colors.white('🔵️ Downloading quickhud'),
        total: 100,
        complete: bgCyan(' '),
        clear: true,
      });
    },
    onProgress: (event) => {
      const completed = Math.floor((event.loaded / event.total) * 100);
      if (completed <= 100) {
        progress.render(completed);
      }
    },
    onEnd: () => {
      progress.end();
    },
  });

  if (!quickhud) {
    console.log(colors.red(`\r❌️ Failed to download quickhud`));
    Deno.exit(1);
  }

  console.log(colors.white(`\r🔵️ Downloaded quickhud`));

  let zip: ZipReader<BlobReader> | null = null;

  try {
    zip = new ZipReader(new BlobReader(quickhud), { useWebWorkers: false });
    const entries = await zip.getEntries();

    for (const game of config.games) {
      for (const entry of entries) {
        const data = await entry.getData!(new Uint8ArrayWriter());
        const folder = join(game.dir, game.mod, 'crosshair');
        const file = join(folder, entry.filename);

        try {
          const { state } = await Deno.permissions.request({
            name: 'write',
            path: folder,
          });

          if (state !== 'granted') {
            Deno.exit(1);
          }

          try {
            await Deno.mkdir(folder);
            // deno-lint-ignore no-empty
          } catch {
          }

          await Deno.writeFile(file, data);

          console.log(
            colors.white(`🔵️ Installed ${colors.italic.gray(file)}`),
          );
        } catch (err) {
          options.verboseMode && logger.error(err);

          console.log(colors.red(`❌️ Failed to install ${colors.italic.gray(file)}`));
          Deno.exit(1);
        }
      }
    }
  } catch (err) {
    options.verboseMode && logger.error(err);

    console.log(colors.red(`❌️ Failed to install quickhud`));
    Deno.exit(1);
  } finally {
    await zip?.close();
  }
};
