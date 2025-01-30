/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { ChangelogEntry, ChangelogOptions } from './portal2_sr.ts';

export const MEL_BOARD_BASE_API = 'https://mel.board.portal2.sr';

const DEFAULT_ABORT_TIMEOUT_MS = 10_000;

export const getMelChangelog = async (options?: ChangelogOptions) => {
  const params = new URLSearchParams();

  Object.entries(options ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, value.toString());
    }
  });

  const query = params.toString();

  const url = `${MEL_BOARD_BASE_API}/changelog/json?${query}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    signal: AbortSignal.timeout(DEFAULT_ABORT_TIMEOUT_MS),
  });

  if (!res.ok) {
    return null;
  }

  return await res.json() as ChangelogEntry[];
};

export const fetchMelDemo = async (id: string | number) => {
  const res = await fetch(`${MEL_BOARD_BASE_API}/getDemo?id=${id}`, {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(DEFAULT_ABORT_TIMEOUT_MS),
  });

  const location = res.headers.get('Location');
  if (!location) {
    throw new Error('Unable to redirect without location.');
  }

  const redirect = new URL(res.url);
  redirect.pathname = location;
  redirect.search = '';

  const demo = await fetch(redirect.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    signal: AbortSignal.timeout(DEFAULT_ABORT_TIMEOUT_MS),
  });

  return {
    demo,
    originalFilename: location.slice(location.lastIndexOf('/') + 1),
  };
};
