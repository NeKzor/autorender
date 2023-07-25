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
  configExplanation,
  downloadSourceAutoRecord,
  gameModsWhichSupportWorkshop,
  getConfigOnly,
  parseAndValidateConfig,
} from './config.ts';
import { AutorenderVersion, UserAgent } from './version.ts';
import { YAMLError } from 'https://deno.land/std@0.193.0/yaml/_error.ts';

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
      .option('-e, --explain', 'Explain all config options.')
      .option('-a, --validate', 'Validate if the config file is correct.')
      .action(async ({ verbose, check, dev, sar, explain, validate }) => {
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
  const res = await fetch(url);

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

      // TODO: Ignore because repo is private for now.
      //Deno.exit(1);
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
        join(game.dir, sarFilename),
        join(game.dir, game.mod, config.autorender['folder-name']),
        join(game.dir, game.mod, 'cfg', game.cfg),
        join(game.dir, game.mod, 'crosshair'),
      ];

      if (gameModsWhichSupportWorkshop.includes(game.mod)) {
        files.push(join(game.dir, game.mod, 'maps', 'workshop'));
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
