/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import 'dotenv/load.ts';

import { assertEquals } from 'testing/asserts.ts';

const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;

Deno.test('Check existing videos', async () => {
  const url = `${AUTORENDER_PUBLIC_URI}/api/v1/check-videos-exist`;

  console.info(`[POST] ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ids: [],
    }),
  });

  assertEquals(res.status, 200);

  const { ids } = await res.json() as { ids: number[] };

  assertEquals(Array.isArray(ids), true);
  assertEquals(ids.length, 0);
});

Deno.test('Get video via video.html', async () => {
  const url = `${AUTORENDER_PUBLIC_URI}/video.html?v=${123}`;

  console.info(`[GET] ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
  });

  assertEquals(res.status, 404);

  await res.body?.cancel();
});
