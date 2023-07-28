/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This marks all stale videos as finished if no client
 * was available to pick it up.
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { db } from '../db.ts';
import { PendingStatus, Video } from '../models.ts';

const MINUTES_PAST_TO_MARK_VIDEO_AS_STALE = 2;

const { affectedRows } = await db.execute<Video>(
  `update videos
      set pending = ?
    where pending = ?
      and TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?
      and board_changelog_id is null
    `,
  [
    PendingStatus.FinishedRender,
    PendingStatus.RequiresRender,
    MINUTES_PAST_TO_MARK_VIDEO_AS_STALE,
  ],
);

console.log({ affectedRows });
