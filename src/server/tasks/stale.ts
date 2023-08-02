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
import { PendingStatus, Video } from '../../shared/models.ts';
import { logger } from '../logger.ts';

const STALE_VIDEOS_UPDATE_INTERVAL = 60 * 1_000;
const MINUTES_PAST_TO_MARK_VIDEO_AS_STALE = 2;

const checkStaleVideos = async () => {
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

  logger.info('stale videos count', { affectedRows });
};

const update = async () => {
  try {
    logger.info('checking for stale videos');
    await checkStaleVideos();
  } catch (err) {
    logger.error(err);
  }
};

await update();

setInterval(update, STALE_VIDEOS_UPDATE_INTERVAL);
