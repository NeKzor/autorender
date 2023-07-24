/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { db } from '../db.ts';
import { Video } from '../models.ts';
import { generateShareId } from '../utils.ts';

const videos = await db.query<Pick<Video, 'video_id'>>(
  `select *
          , BIN_TO_UUID(video_id) as video_id
     from videos
    where LENGTH(share_id) = 0`,
);

for (const video of videos) {
  const shareId = generateShareId();
  await db.execute(
    `update videos
        set share_id = ?
      where video_id = UUID_TO_BIN(?)`,
    [
      shareId,
      video.video_id,
    ],
  );
  console.log(`set share_id ${shareId} for ${video.video_id}`);
}
