/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This marks all stale videos as finished if no client was available
 * to pick it up or if a client could not finish the render.
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { db } from '../db.ts';
import { PendingStatus, Video } from '../../shared/models.ts';
import { logger } from '../logger.ts';

const STALE_VIDEO_UPDATE_INTERVAL = 60 * 1_000;
const STALE_VIDEO_MINUTES_WHEN_NOT_PICKED_UP = 2;
const STALE_VIDEO_MINUTES_WHEN_CLIENT_DID_NOT_FINISH = 30;

const checkStaleVideos = async () => {
  const { affectedRows } = await db.execute<Video>(
    `update videos
      set pending = ?
    where (
        (
          pending = ?
          and TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?
        ) or (
          pending = ?
          and TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?
        )
      )
      and board_changelog_id is null
    `,
    [
      PendingStatus.FinishedRender,
      PendingStatus.RequiresRender,
      STALE_VIDEO_MINUTES_WHEN_NOT_PICKED_UP,
      PendingStatus.StartedRender,
      STALE_VIDEO_MINUTES_WHEN_CLIENT_DID_NOT_FINISH,
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

setInterval(update, STALE_VIDEO_UPDATE_INTERVAL);
