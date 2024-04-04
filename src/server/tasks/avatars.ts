/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This downloads and updates all user avatars and banners.
 */

import 'dotenv/load.ts';
import { join } from 'path/mod.ts';
import { db } from '../db.ts';
import { getUserPath, tryMakeDir } from '../utils.ts';
import { User } from '~/shared/models.ts';

const users = await db.query<User>(
  `select * from users`,
);

for (const user of users) {
  console.log('[+]', user.username);

  if (user.discord_avatar) {
    const userPath = getUserPath(user);
    await tryMakeDir(userPath);
    const avatar = user.discord_avatar + (user.discord_avatar.startsWith('a_') ? '.gif' : '.png');
    const url = `https://cdn.discordapp.com/avatars/${user.discord_id}/${avatar}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });
    if (res.ok) {
      using file = await Deno.open(join(userPath, 'avatar'), { create: true, write: true, truncate: true });
      await res.body?.pipeTo(file.writable);
      console.log('[+] Downloaded', url);
    } else {
      console.error('[-] Failed to fetch avatar', res.statusText, url, await res.text());
    }
  }

  if (user.discord_banner) {
    const userPath = getUserPath(user);
    await tryMakeDir(userPath);
    const banner = user.discord_banner + (user.discord_banner.startsWith('a_') ? '.gif' : '.png');
    const url = `https://cdn.discordapp.com/banners/${user.discord_id}/${banner}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
    });
    if (res.ok) {
      using file = await Deno.open(join(userPath, 'banner'), { create: true, write: true, truncate: true });
      await res.body?.pipeTo(file.writable);
      console.log('[+] Downloaded', url);
    } else {
      console.error('Failed to fetch banner', res.statusText, url, await res.text());
    }
  }
}
