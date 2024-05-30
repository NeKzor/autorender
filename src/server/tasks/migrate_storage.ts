/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This migrates all files that are stored with video_id to share_id.
 */

import 'dotenv/load.ts';

import { join } from 'path/join.ts';
import * as uuid from 'uuid/mod.ts';
import { db } from '../db.ts';
import { Storage } from '../utils.ts';
import { installLogger, logger } from '../logger.ts';
import { Video } from '~/shared/models.ts';

installLogger('migrate');

const rows = await db.query<Pick<Video, 'video_id' | 'share_id'>>(
  `select BIN_TO_UUID(video_id) as video_id
        , share_id
     from videos`,
);

const idLookup = new Map<string, string>();
rows.forEach((row) => idLookup.set(row.video_id, row.share_id));

const renameFiles = async (folder: string) => {
  for await (const file of Deno.readDir(folder)) {
    if (!file.isFile) {
      continue;
    }

    const videoId = file.name.slice(0, 36);
    if (!uuid.validate(videoId)) {
      logger.info(`Ignored: ${join(folder, file.name)}`);
      continue;
    }

    const shareId = idLookup.get(videoId);
    if (!shareId) {
      logger.info(`Look up failed for: ${join(folder, file.name)}`);
      continue;
    }

    logger.info(`${videoId} -> ${shareId}`);
    const rest = file.name.slice(36);

    await Deno.rename(join(folder, file.name), join(folder, `${shareId}${rest}`));
  }
};

await renameFiles(Storage.Demos);
await renameFiles(Storage.Videos);
