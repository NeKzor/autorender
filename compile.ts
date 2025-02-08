/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { join } from 'jsr:@std/path';
import { Command } from 'jsr:@cliffy/command@1.0.0-rc.7';
import { colors } from 'jsr:@cliffy/ansi@1.0.0-rc.7/colors';

const devHostname = 'autorender.portal2.local';

type SupportedTarget = {
  target: string;
  binaryName: string;
  steamappsDir?: string;
};

const supportedTargets: Record<string, SupportedTarget> = {
  linux: {
    target: 'x86_64-unknown-linux-gnu',
    binaryName: 'autorenderclient',
  },
  windows: {
    target: 'x86_64-pc-windows-msvc',
    binaryName: 'autorenderclient.exe',
    steamappsDir: 'C:\\\\Program Files (x86)\\\\Steam\\\\steamapps',
  },
};

export const supportedGames: Record<string, { sourcemod: boolean }> = {
  'Portal 2': { sourcemod: false },
  'Aperture Tag': { sourcemod: false },
  'Thinking with Time Machine': { sourcemod: false },
  'Portal Stories Mel': { sourcemod: false },
  // 'Portal 2 Community Edition': { sourcemod: false },
  'Portal Reloaded': { sourcemod: false },
  'Portal 2 Speedrun Mod': { sourcemod: true },
};

const getCompilationOptions = (os: string) => {
  const target = supportedTargets[os];
  if (!target) {
    console.log(colors.red('Operating system not supported'));
    Deno.exit(1);
  }
  return target;
};

const main = async () => {
  await new Command()
    .name('autorender-compile-tool')
    .version('1.0.0')
    .description('Command line tool for compiling the autorender client.')
    .option('--os <linux|windows>', 'The operating system for this to be compiled to.')
    .option('--all', 'Compile for all supported operating systems.')
    .option('--release', 'Compile without developer flags.')
    .action(async ({ os, all, release }) => {
      const systems = all ? ['linux', 'windows'] : [os ?? Deno.build.os];

      for (const os of systems) {
        const { target, binaryName, steamappsDir } = getCompilationOptions(os);
        const developerFlags = release ? '' : `--unsafely-ignore-certificate-errors=${devHostname}`;

        const env = {
          COMPILATION_TARGET: target,
          COMPILATION_BINARY_NAME: binaryName,
          COMPILATION_DEVELOPER_FLAGS: developerFlags,
          COMPILATION_READ_WRITE_GAME_PATHS: steamappsDir
            ? ',' + Object.entries(supportedGames)
              .map(([gameName, { sourcemod }]) => join(steamappsDir, sourcemod ? 'sourcemods' : 'common', gameName!))
              .join(',')
            : '',
        };

        const args = [
          'task',
          '--cwd',
          'src/client',
          'compile',
        ];

        await new Deno.Command('deno', { env, args })
          .spawn()
          .output();
      }
    })
    .parse(Deno.args);
};

await main();
