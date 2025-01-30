/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This checks if there are any videos to render from board.portal2.sr and mel.board.portal2.sr.
 */

import { db } from '../db.ts';
import { BoardSource, PendingStatus } from '~/shared/models.ts';
import { installLogger, logger } from '../logger.ts';
import { ChangelogOptions, getChangelog } from './portal2_sr.ts';
import { insertVideo } from './board_insert.ts';
import { getMelChangelog } from './mel.ts';

const BOARD_INTEGRATION_UPDATE_INTERVAL = 60 * 1_000;

const MEL_BOARD_MAXIMUM_SCORE = 4 * 60 * 100;

const FAILED_RENDER_MIN_RETRY_MINUTES = 15;
const FAILED_RENDER_MAX_RETRY_MINUTES = 60;

installLogger('board');

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

const options = {
  endRank: 200,
  maxDaysAgo: 1,
  banned: 0,
  pending: 0,
} satisfies ChangelogOptions;

const checkChangelogUpdates = async () => {
  const changelog = await getChangelog(options);
  if (!changelog) {
    return;
  }

  for (const entry of changelog) {
    await insertVideo(BoardSource.Portal2, entry);
  }
};

const checkMelChangelogUpdates = async () => {
  const changelog = await getMelChangelog(options);
  if (!changelog) {
    return;
  }

  for (const entry of changelog) {
    if (entry.score > MEL_BOARD_MAXIMUM_SCORE) {
      continue;
    }

    await insertVideo(BoardSource.Mel, entry);
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
        and deleted_at is null
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

let isUpdating = false;

const update = async () => {
  if (isUpdating) {
    return;
  }

  isUpdating = true;

  try {
    await checkChangelogUpdates();
  } catch (err) {
    logger.error(err);
  }

  try {
    await checkMelChangelogUpdates();
  } catch (err) {
    logger.error(err);
  }

  try {
    await resetFailedAutorenders();
  } catch (err) {
    logger.error(err);
  }

  isUpdating = false;
};

setInterval(update, BOARD_INTEGRATION_UPDATE_INTERVAL);
