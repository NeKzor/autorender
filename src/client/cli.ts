/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Command } from 'cliffy/command/mod.ts';
import { downloadAutorenderConfig, downloadQuickhud, downloadSourceAutoRecord, getConfigOnly } from './config.ts';
import { AutorenderVersion } from './constants.ts';
import { addNewGame, launchGame, runBenchmark, runCheck, runExplain } from './commands.ts';

export interface Options {
  devMode: boolean;
  verboseMode: boolean;
}

let options: Options | null = null;

export const getOptions = () => options;

// @deno-fmt-ignore
const cli = new Command()
  .name('autorender')
  .version(AutorenderVersion)
  .description('Command line app for rendering and uploading videos to autorender.portal2.sr.')
  .globalOption('-v, --verbose', 'Turn on verbose error logging.')
  .globalOption('-d, --dev', 'Switch into developer mode.', { hidden: true })
  .globalAction(({ verbose, dev }) => {
    options = {
      devMode: !!dev,
      verboseMode: !!verbose,
    };
  })
  .command('check')
    .description('Health check of the app.')
    .action(async () => await runCheck(options!))
  .command('sar')
    .description('Download latest SourceAutoRecord version.')
    .action(async () => await downloadSourceAutoRecord(await getConfigOnly(), options!) && Deno.exit(0))
  .command('cfg')
    .description('Download latest autorender.cfg file.')
    .action(async () => await downloadAutorenderConfig(await getConfigOnly(), options!) && Deno.exit(0))
  .command('quickhud')
    .description('Download latest quickhud files.')
    .action(async () => await downloadQuickhud(await getConfigOnly(), options!) && Deno.exit(0))
  .command('benchmark')
    .description('Run a benchmark render for finding the correct scale-timeout value.')
    .action(async () => await runBenchmark(await getConfigOnly(), options!))
  .command('launch')
    .description('Test if a game can be launched.')
    .action(async () => await launchGame(await getConfigOnly(), options!))
  .command('add-game')
    .description('Add a new game.')
    .action(async () => await addNewGame(await getConfigOnly(), options!))
  .command('explain')
    .description('Explain all config values in autorender.yaml.')
    .action(() => runExplain());

export const parseArgs = async () => {
  return await cli.parse(Deno.args);
};
