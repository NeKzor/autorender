/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This inserts all inputs from demo files.
 */

import 'dotenv/load.ts';

import { SourceDemoParser } from '@nekz/sdp';
import { Video } from '~/shared/models.ts';
import { db } from '../db.ts';
import { getInputData } from '../demo.ts';
import { installLogger, logger } from '../logger.ts';
import { getDemoFilePath } from '../utils.ts';

installLogger('migrate');

const videos = await db.query<Pick<Video, 'video_id' | 'share_id' | 'board_changelog_id'>>(
  `select BIN_TO_UUID(video_id) as video_id
        , share_id
        , board_changelog_id
     from videos`,
);

const parser = SourceDemoParser.default();

for (const video of videos) {
  if (video.board_changelog_id) {
    continue;
  }

  try {
    const file = getDemoFilePath(video);
    logger.info(`Parsing : ${video.share_id} : ${file}`);

    const buffer = await Deno.readFile(file);
    const demo = parser.parse(buffer);
    const inputs = getInputData(demo);

    const { affectedRows } = await db.execute(
      `update videos
          set demo_inputs = ?
        where video_id = UUID_TO_BIN(?)`,
      [
        JSON.stringify(inputs),
        video.video_id,
      ],
    );

    logger.info({ affectedRows });
  } catch (err) {
    logger.error(`Failed to parse ${video.share_id}`);
    logger.error(err);
  }
}
