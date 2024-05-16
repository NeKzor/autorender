/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as yaml from 'yaml/mod.ts';
import { Checkbox, Input, prompt, Secret, Select } from 'cliffy/prompt/mod.ts';
import { colors } from 'cliffy/ansi/colors.ts';
import { bgCyan } from 'fmt/colors.ts';
import { dirname, join } from 'path/mod.ts';
import { BlobReader, Uint8ArrayWriter, ZipReader } from 'zipjs/index.js';
import ProgressBar from 'progress/mod.ts';
import { logger } from './logger.ts';
import { writeAll } from 'streams/write_all.ts';
import { AutorenderBaseApi, AutorenderConnectUri, UserAgent } from './constants.ts';
import { RenderQuality } from '~/shared/models.ts';
import { gameFolder, getBinary, realGameModFolder } from './utils.ts';
import { getOptions, Options } from './cli.ts';
import { getRelease } from './github.ts';

const isWindows = Deno.build.os === 'windows';

export const supportedQualities: RenderQuality[] = [
  RenderQuality.FHD_1080p,
  RenderQuality.HD_720p,
  RenderQuality.SD_480p,
];

export interface Config {
  autorender: {
    'access-token': string;
    'connect-uri': string;
    'base-api': string;
    'folder-name': string;
    protocol: string;
    'max-supported-quality': RenderQuality;
    'check-interval': number;
    'scale-timeout': number;
    'load-timeout': number;
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
    'max-supported-quality*': `The render quality that the client is able to provide. Options are: ${
      supportedQualities.join(', ')
    }`,
    'check-interval*': 'Timeout interval in seconds to check if there are new videos to render.',
    'scale-timeout*': 'Approximated scaling factor for multiplying the demo playback time.',
    'load-timeout*': 'Approximated time in seconds of how long it takes to load a demo.',
    'base-timeout*': 'Approximated time in seconds of how long it takes to start and exit the game process.',
  },
  sar: {
    version: 'Currently installed SAR version.',
  },
  games: [
    {
      exe: "Name of the games's executable file.",
      proc: "Name of the game's process.",
      cfg: 'Name of the installed autorender cfg file for the game.',
      mod: "Name of the game's mod directory.",
      dir: 'Path where the game is installed.',
      sourcemod: 'If the game is a sourcemod.',
    },
  ],
};

export type GameMods =
  | 'portal2'
  | 'aperturetag'
  | 'TWTM'
  | 'portal_stories'
  // | 'p2ce'
  | 'portalreloaded'
  | 'Portal 2 Speedrun Mod';

export const gameModsWhichSupportWorkshop: GameMods[] = [
  'portal2',
  ...(isWindows ? ['aperturetag'] : []) as GameMods[],
  'TWTM',
  // 'p2ce',
  'portalreloaded',
];

export const supportedGameMods: GameMods[] = [
  'portal2',
  ...(isWindows ? ['aperturetag'] : []) as GameMods[],
  'TWTM',
  'portal_stories',
  // 'p2ce',
  'portalreloaded',
  'Portal 2 Speedrun Mod',
];

export interface GameConfig {
  exe: string;
  proc: string;
  cfg: string;
  mod: GameMods;
  dir: string;
  sourcemod: boolean;
}

export const supportedGames: Record<string, Partial<GameConfig>> = {
  'Portal 2': {
    mod: 'portal2',
  },
  ...(isWindows
    ? {
      'Aperture Tag': {
        mod: 'aperturetag',
      },
    }
    : {}),
  'Thinking with Time Machine': {
    mod: 'TWTM',
    exe: isWindows ? 'portal2.exe' : 'TWTM.sh',
    proc: isWindows ? 'portal2.exe' : 'TWTM_linux',
  },
  'Portal Stories Mel': {
    mod: 'portal_stories',
  },
  // 'Portal 2 Community Edition': {
  //   mod: 'p2ce',
  //   exe: isWindows ? 'p2ce.bat' : 'p2ce.sh',
  //   proc: isWindows ? 'chaos.exe' : 'chaos',
  // },
  'Portal Reloaded': {
    mod: 'portalreloaded',
  },
  'Portal 2 Speedrun Mod': {
    mod: 'Portal 2 Speedrun Mod',
    sourcemod: true,
  },
};

export const getGameName = (game: Pick<GameConfig, 'mod'>) => {
  const [name] = Object.entries(supportedGames).find(([_, { mod }]) => mod === game.mod) ?? [];
  return name;
};

const configFile = join(Deno.env.get('PWD') ?? '', 'autorender.yaml');

let config: Config | null = null;

export const parseAndValidateConfig = async () => {
  const config = yaml.parse(await Deno.readTextFile(configFile)) as Partial<Config>;

  const autorenderValidations: [
    keyof Config['autorender'],
    ['string' | 'number' | 'boolean', (number | ((value: unknown) => void))?],
  ][] = [
    ['access-token', ['string']],
    ['connect-uri', ['string']],
    ['base-api', ['string']],
    ['folder-name', ['string']],
    ['protocol', ['string']],
    ['max-supported-quality', ['string', (value: unknown) => {
      if (!value || !supportedQualities.includes(value.toString() as RenderQuality)) {
        console.log(
          colors.red(
            `❌️ Invalid value for "autorender" key "max-supported-quality". Valid values are: ${
              supportedQualities.join(', ')
            }`,
          ),
        );

        Deno.exit(1);
      }
    }]],
    ['check-interval', ['number', 1]],
    ['scale-timeout', ['number']],
    ['load-timeout', ['number']],
    ['base-timeout', ['number']],
  ];

  const sarValidations: [
    keyof Config['sar'],
    ['string' | 'number' | 'boolean', (number | ((value: string | number) => void))?],
  ][] = [
    ['version', ['string']],
  ];

  const gamesValidations: [
    keyof Config['games']['0'],
    ['string' | 'number' | 'boolean', (number | ((value: string | number, key: string) => void))?],
  ][] = [
    ['exe', ['string']],
    ['proc', ['string']],
    ['cfg', ['string']],
    ['mod', ['string', (value: string | number, key: string) => {
      if (!value || !supportedGameMods.includes(value.toString() as GameMods)) {
        console.log(
          colors.red(
            `❌️ Invalid value for ${key}. Valid values are: ${supportedGameMods.join(', ')}`,
          ),
        );

        Deno.exit(1);
      }
    }]],
    ['dir', ['string']],
    ['sourcemod', ['boolean']],
  ];

  const configValidations = [
    ['autorender', autorenderValidations],
    ['sar', sarValidations],
    ['games', [gamesValidations]],
  ] satisfies [keyof Config, typeof autorenderValidations | typeof sarValidations | [typeof gamesValidations]][];

  const bail = (message: string): never => {
    console.log(colors.red(`❌️ ${message}`));
    Deno.exit(1);
  };

  const checkInvalidKeys = (rootKey: string, obj: Record<string, unknown>, keys: string[]) => {
    if (obj === undefined || obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      bail(`Expected object value for key "${rootKey}"`);
    }

    for (const key of Object.keys(obj)) {
      if (!keys.includes(key)) {
        bail(`Found unknown key "${rootKey}" "${key}"`);
      }
    }
  };

  checkInvalidKeys('root', config, configValidations.map(([key]) => key));

  for (const [key, validations] of configValidations) {
    const obj = config[key] as Record<string, string | number>;

    if (obj === undefined || obj === null) {
      bail(`Expected value for key "${key}"`);
    }

    if (Array.isArray(validations.at(0)) && Array.isArray(validations.at(0)!.at(0))) {
      const innerValidations = validations.at(0)!;

      if (!Array.isArray(obj)) {
        bail(`Expected array value for key "${key}"`);
        Deno.exit(1); // Aaaaa TypScript...
      }

      obj.forEach((item: Record<string, string | number>, index: number) => {
        const itemKey = `${key}[${index}]`;

        checkInvalidKeys(itemKey, item, innerValidations.map(([key]) => key as string));

        for (const [objKey, innerValidator] of innerValidations) {
          const [expectedType, validator] = innerValidator as [
            'string' | 'number' | 'boolean',
            (number | ((value: unknown, key: string) => void) | undefined)?,
          ];

          const itemObjKey = `"${itemKey}" "${objKey}"`;

          const innerValue = item[objKey as string];
          if (innerValue === undefined || innerValue === null) {
            bail(`Expected value for key ${itemObjKey}`);
          }

          if (
            (expectedType === 'string' && typeof innerValue !== 'string') ||
            (expectedType === 'number' && typeof innerValue !== 'number') ||
            (expectedType === 'boolean' && typeof innerValue !== 'boolean')
          ) {
            bail(`Expected value type for key ${itemObjKey} to be of type ${expectedType}`);
          }

          if (validator !== undefined) {
            if (typeof validator === 'number') {
              if (innerValue as number < validator) {
                bail(`Invalid value for key ${itemObjKey}. Expected value to be greater or equal to ${validator}`);
              }
            } else {
              validator(innerValue, itemObjKey);
            }
          }
        }
      });
    } else {
      if (typeof obj !== 'object') {
        bail(`Expected object value for key "${key}"`);
      }

      checkInvalidKeys(key, obj, validations.map(([key]) => key as string));

      for (const [objKey, innerValidator] of validations) {
        const [expectedType, validator] = innerValidator as [
          'string' | 'number' | 'boolean',
          (number | ((value: unknown, key: string) => void) | undefined)?,
        ];

        const itemObjKey = `"${key}" "${objKey}"`;

        const innerValue = obj[objKey as string];

        if (innerValue === undefined || innerValue === null) {
          bail(`Expected value for key ${itemObjKey}`);
        }

        if (
          (expectedType === 'string' && typeof innerValue !== 'string') ||
          (expectedType === 'number' && typeof innerValue !== 'number') ||
          (expectedType === 'boolean' && typeof innerValue !== 'boolean')
        ) {
          bail(`Expected value type for key ${itemObjKey} to be of type ${expectedType}`);
        }

        if (validator !== undefined) {
          if (typeof validator === 'number') {
            if (innerValue as number < validator) {
              bail(`Invalid value for key ${itemObjKey}. Expected value to be greater or equal to ${validator}`);
            }
          } else {
            validator(innerValue, itemObjKey);
          }
        }
      }
    }
  }

  return config as Config;
};

export const getConfig = async () => {
  if (!config) {
    try {
      config = await parseAndValidateConfig();
    } catch {
      config = await createConfig();
    }
  }
  return config;
};

export const getConfigOnly = async () => {
  if (!config) {
    try {
      config = await parseAndValidateConfig();
    } catch {
      return null;
    }
  }
  return config;
};

export const createGameConfig = (steamCommon: string) => (mod: string) => {
  const supportedGame = supportedGames[mod as keyof typeof supportedGames]!;
  const gamesDir = supportedGame.sourcemod ? join(dirname(steamCommon), 'sourcemods') : steamCommon;

  return {
    exe: isWindows ? 'portal2.exe' : 'portal2.sh',
    proc: isWindows ? 'portal2.exe' : 'portal2_linux',
    cfg: 'autorender.cfg',
    sourcemod: false,
    ...supportedGame,
    dir: join(gamesDir, mod),
  } as Config['games']['0'];
};

const createConfig = async () => {
  const options = getOptions()!;

  const [connectUri, baseApi] = options.devMode
    ? [
      AutorenderConnectUri.dev,
      AutorenderBaseApi.dev,
    ]
    : [
      AutorenderConnectUri.prod,
      AutorenderBaseApi.prod,
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
      message: '🎮️ Which games do you support? Select a game with spacebar.',
      type: Checkbox,
      options: Object.keys(supportedGames),
      minOptions: 1,
      confirmSubmit: false,
      after: async ({ game_mod }, next) => {
        if (
          game_mod!.some((game) => supportedGames[game as keyof typeof supportedGames]!.sourcemod) &&
          !game_mod!.includes('Portal 2')
        ) {
          console.error(colors.red(`❌️ Portal 2 is required for sourcemods.`));
          await next('game_mod');
        } else {
          await next();
        }
      },
    },
    {
      name: 'steam_common',
      message: "📂️ Please enter your Steam's common directory path where all games are installed.",
      suggestions: [
        isWindows
          ? 'C:\\Program Files (x86)\\Steam\\steamapps\\common'
          : join('/home/', Deno.env.get('USER') ?? 'user', '/.steam/steam/steamapps/common'),
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
              console.log(colors.red("❌️ Access denied for Steam's common folder."));
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
                    console.log(colors.red("❌️ Access denied for Steam's sourcemods folder."));
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

  const config: Config = {
    'autorender': {
      'access-token': setup.access_token!,
      'connect-uri': connectUri,
      'base-api': baseApi,
      'folder-name': 'autorender',
      'protocol': 'autorender-v1',
      'max-supported-quality': RenderQuality.FHD_1080p,
      'check-interval': 1,
      'scale-timeout': 9,
      'load-timeout': 5,
      'base-timeout': 30,
    },
    sar: {
      version: '',
    },
    'games': [
      ...setup.game_mod!.map(createGameConfig(setup.steam_common!)),
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
  addedGames?: GameConfig[],
): Promise<true | never> => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

  await writeAll(
    Deno.stdout,
    new TextEncoder().encode(colors.white('\r🗿️ Getting SourceAutoRecord')),
  );

  const sarRelease = await getRelease('https://api.github.com/repos/p2sr/SourceAutoRecord/releases/latest', options);

  config.sar.version = sarRelease?.tag_name ?? '';

  const filename = isWindows ? 'sar.dll' : 'sar.so';

  const url = sarRelease
    ?.assets
    ?.find(({ name }) => name === filename)
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

  try {
    for (const game of addedGames ?? config.games) {
      if (game.sourcemod) {
        continue;
      }

      const filepath = gameFolder(game, filename);

      try {
        const { state } = await Deno.permissions.request({
          name: 'write',
          path: game.dir,
        });

        if (state !== 'granted') {
          Deno.exit(1);
        }

        using file = await Deno.open(filepath, { write: true, create: true });
        await sar.stream().pipeTo(file.writable);

        console.log(
          colors.white(`🗿️ Installed ${colors.italic.gray(filepath)}`),
        );
      } catch (err) {
        options.verboseMode && logger.error(err);

        console.log(colors.red(`❌️ Failed to install ${filepath}`));
        Deno.exit(1);
      }
    }
  } catch (err) {
    options.verboseMode && logger.error(err);

    console.log(colors.red(`❌️ Failed to install SourceAutoRecord`));
    Deno.exit(1);
  }

  return true;
};

// Download and install autorender.cfg
export const downloadAutorenderConfig = async (
  config: Config | null,
  options: Options,
  addedGames?: GameConfig[],
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

  for (const game of addedGames ?? config.games) {
    const file = realGameModFolder(game, 'cfg', 'autorender.cfg');

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

  return true;
};

// Download and install quickhud.zip
export const downloadQuickhud = async (
  config: Config | null,
  options: Options,
  addedGames?: GameConfig[],
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

    for (const game of addedGames ?? config.games) {
      for (const entry of entries) {
        const data = await entry.getData!(new Uint8ArrayWriter());
        const folder = realGameModFolder(game, 'crosshair');
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

  return true;
};
