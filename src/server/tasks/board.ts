/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This checks if there are any videos to render from board.portal2.sr.
 */

import 'dotenv/load.ts';
import { db } from '../db.ts';
import { PendingStatus } from '~/shared/models.ts';
import { installLogger, logger } from '../logger.ts';
import { getChangelog } from './portal2_sr.ts';
import { insertVideo } from './board_insert.ts';

const BOARD_INTEGRATION_UPDATE_INTERVAL = 60 * 1_000;
const BOARD_INTEGRATION_START_DATE = '2023-08-25';

const FAILED_RENDER_MIN_RETRY_MINUTES = 15;
const FAILED_RENDER_MAX_RETRY_MINUTES = 60;

installLogger('board');

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

const checkChangelogUpdates = async () => {
  const changelog = await getChangelog({
    endRank: 200,
    maxDaysAgo: 1,
    banned: 0,
    pending: 0,
  });

  if (!changelog) {
    return;
  }

  for (const entry of changelog) {
    if (entry.time_gained.slice(0, 10) < BOARD_INTEGRATION_START_DATE) {
      continue;
    }

    await insertVideo(entry);
  }
};

const resetFailedAutorenders = async () => {
  const { affectedRows } = await db.execute(
    `update videos
        set pending = ?
          , rendered_by = null
          , rendered_by_token = null
          , render_node = null
      where pending in (?, ?)
        and video_url is null
        and board_changelog_id is not null
        and rendered_by_token is not null
        and TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= ?
        and TIMESTAMPDIFF(MINUTE, created_at, NOW()) <= ?`,
    [
      PendingStatus.RequiresRender,
      PendingStatus.FinishedRender,
      PendingStatus.StartedRender,
      FAILED_RENDER_MIN_RETRY_MINUTES,
      FAILED_RENDER_MAX_RETRY_MINUTES,
    ],
  );

  if (affectedRows) {
    logger.info(`Reset ${affectedRows} failed renders`);
  }
};

const update = async () => {
  try {
    await checkChangelogUpdates();
  } catch (err) {
    logger.error(err);
  }

  try {
    await resetFailedAutorenders();
  } catch (err) {
    logger.error(err);
  }
};

setInterval(update, BOARD_INTEGRATION_UPDATE_INTERVAL);
