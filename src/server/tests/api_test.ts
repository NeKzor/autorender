/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import 'dotenv/load.ts';

import { assertEquals } from 'testing/asserts.ts';

const testChangelogId = 123;
const hostUri = `http://${Deno.env.get('SERVER_HOST')}:${Deno.env.get('SERVER_PORT')}`;

Deno.test('Check existing videos', async () => {
  const url = `${hostUri}/api/v1/check-videos-exist`;

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
  const url = `${hostUri}/video.html?v=${testChangelogId}`;

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

Deno.test('Get redirect to video by changelog ID', async () => {
  const url = `${hostUri}/api/v1/video/${testChangelogId}/video`;

  console.info(`[GET] ${url}`);

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    redirect: 'manual',
  });

  assertEquals(res.status, 404);

  await res.blob();
});

Deno.test('Search videos', async () => {
  // TODO: Refactor
  interface SearchResponse {
    end: boolean;
    results: {
      comment: string;
      cur_rank: number;
      date: string;
      id: number;
      map: string;
      map_id: number;
      obsoleted: number;
      orig_rank: number;
      time: number;
      user: string;
      user_id: string;
      views: number;
      share_id: string;
    }[];
  }

  {
    const url = `${hostUri}/api/v1/search?q=${encodeURIComponent('123456 wr')}`;

    console.info(`[GET] ${url}`);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });

    assertEquals(res.status, 200);

    const search = await res.json() as SearchResponse;

    assertEquals(Array.isArray(search.results), true);
    assertEquals(search.results.length, 0);
  }

  {
    const url = `${hostUri}/api/v1/search?q`;

    console.info(`[GET] ${url}`);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });

    assertEquals(res.status, 200);

    const search = await res.json() as SearchResponse;

    assertEquals(Array.isArray(search.results), true);
    assertEquals(search.results.length, 30);
  }

  {
    const url = `${hostUri}/api/v1/search?q=${encodeURIComponent('Bomb Flings wr')}`;

    console.info(`[GET] ${url}`);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });

    assertEquals(res.status, 200);

    const search = await res.json() as SearchResponse;

    assertEquals(Array.isArray(search.results), true);
    assertEquals(search.results.length >= 4, true);
  }

  {
    const url = `${hostUri}/api/v1/search?q=${encodeURIComponent('Bridge Intro')}`;

    console.info(`[GET] ${url}`);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });

    assertEquals(res.status, 200);

    const search = await res.json() as SearchResponse;

    assertEquals(Array.isArray(search.results), true);
    assertEquals(search.results.length, 20);
  }
});
