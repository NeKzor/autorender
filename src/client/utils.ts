/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { dirname, join } from 'https://deno.land/std@0.192.0/path/mod.ts';
import { GameConfig } from './config.ts';

/**
 * Join paths with the game folder.
 */
export const gameFolder = (game: GameConfig, ...paths: string[]) => {
  return game.sourcemod ? join(dirname(dirname(game.dir)), 'common', 'Portal 2', ...paths) : join(game.dir, ...paths);
};

/**
 * Join paths with the real game mod folder.
 * Examples:
 *    - Portal 2              -> "C:\Program Files (x86)\Steam\steamapps\common\Portal 2\portal2"
 *    - Portal 2 Speedrun Mod -> "C:\Program Files (x86)\Steam\steamapps\sourcemods\Portal 2 Speedrun Mod"
 */
export const realGameModFolder = (game: GameConfig, ...paths: string[]) => {
  return game.sourcemod ? join(game.dir, ...paths) : join(game.dir, game.mod, ...paths);
};

/**
 * Join paths with the game mod folder.
 * Examples:
 *    - Portal 2              -> "C:\Program Files (x86)\Steam\steamapps\common\Portal 2\portal2"
 *    - Portal 2 Speedrun Mod -> "C:\Program Files (x86)\Steam\steamapps\common\Portal 2\portal2"
 */
export const gameModFolder = (game: GameConfig, ...paths: string[]) => {
  return game.sourcemod
    ? join(dirname(dirname(game.dir)), 'common', 'Portal 2', 'portal2', ...paths)
    : join(game.dir, game.mod, ...paths);
};
