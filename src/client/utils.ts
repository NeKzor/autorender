/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { dirname, join } from 'path/mod.ts';
import { GameConfig } from './config.ts';
import { UserAgent } from './constants.ts';

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

/**
 * Downloads a binary file.
 */
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
