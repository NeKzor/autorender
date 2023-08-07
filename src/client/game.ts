/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { dirname } from 'https://deno.land/std@0.192.0/path/mod.ts';
import { Config, gameModsWhichSupportWorkshop } from './config.ts';
import { logger } from './logger.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';
import { realGameModFolder } from './utils.ts';

/**
 * Request access to the game's subdirectory and create all folders for rendering.
 */
export const createFolders = async (config: Config | null) => {
  if (!config) {
    console.log(colors.red(`❌️ Failed to find autorender.yaml config file`));
    Deno.exit(1);
  }

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
