/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/command/mod.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';

const devHostname = 'autorender.portal2.local';

const supportedTargets: Record<string, { target: string; binaryName: string }> = {
  linux: {
    target: 'x86_64-unknown-linux-gnu',
    binaryName: 'autorenderclient',
  },
  windows: {
    target: 'x86_64-pc-windows-msvc',
    binaryName: 'autorenderclient.exe',
  },
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
        const { target, binaryName } = getCompilationOptions(os);
        const developerFlags = release ? '' : `--unsafely-ignore-certificate-errors=${devHostname}`;

        const command = new Deno.Command('deno', {
          env: {
            COMPILATION_TARGET: target,
            COMPILATION_BINARY_NAME: binaryName,
            COMPILATION_DEVELOPER_FLAGS: developerFlags,
          },
          args: [
            'task',
            '--cwd',
            'src/client',
            'compile',
          ],
        });

        await command
          .spawn()
          .output();
      }
    })
    .parse(Deno.args);
};

await main();
