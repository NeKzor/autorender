/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This resets the permissions of the dev user.
 * A re-login is required after execution.
 */

import { db } from '../db.ts';
import { UserPermissions } from '~/shared/models.ts';

const { affectedRows } = await db.execute(
  `update users
        set permissions = ?
      where discord_id = ?`,
  [
    UserPermissions.All,
    Deno.env.get('DISCORD_USER_ID')!,
  ],
);

console.log({ affectedRows });
