/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This marks all stale videos as finished if no client was available
 * to pick it up or if a client could not finish the render.
 */

import { db } from '../db.ts';
import { PendingStatus, Video } from '~/shared/models.ts';
import { installLogger, logger } from '../logger.ts';

const STALE_VIDEO_UPDATE_INTERVAL = 60 * 1_000;
const STALE_VIDEO_MINUTES_WHEN_NOT_PICKED_UP = 2;
const STALE_VIDEO_MINUTES_WHEN_CLIENT_DID_NOT_FINISH = 30;

installLogger('stale');

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

const checkStaleVideos = async () => {
  const { affectedRows } = await db.execute<Video>(
    `update videos
      set pending = ?
        , processed = 1
    where (
        (
          pending = ?
          and TIMESTAMPDIFF(MINUTE, IFNULL(rerender_started_at, created_at), NOW()) >= ?
        ) or (
          pending = ?
          and TIMESTAMPDIFF(MINUTE, IFNULL(rerender_started_at, created_at), NOW()) >= ?
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

  if (affectedRows) {
    logger.info(`Marked ${affectedRows} videos as stale`);
  }
};

let isUpdating = false;

const update = async () => {
  if (isUpdating) {
    return;
  }

  try {
    isUpdating = true;
    await checkStaleVideos();
  } catch (err) {
    logger.error(err);
  } finally {
    isUpdating = false;
  }
};

setInterval(update, STALE_VIDEO_UPDATE_INTERVAL);
