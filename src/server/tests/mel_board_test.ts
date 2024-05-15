/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { assert } from 'testing/asserts.ts';

const MEL_BOARD_DOMAIN = Deno.env.get('MEL_BOARD_DOMAIN')!;
const MEL_BOARD_API_TOKEN = Deno.env.get('MEL_BOARD_API_TOKEN')!;

Deno.test('Can set autorender on board.portal2.local', async () => {
  if (!MEL_BOARD_API_TOKEN) {
    return console.log('Mel board disabled. Skipped test.');
  }

  const res = await fetch(`https://${MEL_BOARD_DOMAIN}/api-v3/set-autorender`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MEL_BOARD_API_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    body: JSON.stringify({
      changelog_id: -1,
      autorender_id: '0123456789A',
    }),
  });

  assert(res.ok);

  const status = await res.json();
  assert(status);
  assert(status.affected === 0);
});
