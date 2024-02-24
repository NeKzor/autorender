/*
 * Copyright (c) 2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * Get Video ID by Share ID or vice versa.
 */

import 'dotenv/load.ts';
import * as uuid from 'uuid/mod.ts';
import { db } from '../db.ts';
import { Video } from '~/shared/models.ts';
import { validateShareId } from '../utils.ts';

const id = Deno.args.at(0);
if (id === undefined) {
  console.log('Usage: deno task id <share ID or video ID> (--all)');
  Deno.exit(1);
}

const isShareId = validateShareId(id);
const isUuid = uuid.validate(id);

if (!isShareId && !isUuid) {
  console.log('Invalid share ID or UUID.');
  Deno.exit(1);
}

const { rows } = await db.execute<Video>(
  `select *
        , BIN_TO_UUID(video_id) as video_id
     from videos
    where ${isShareId ? 'share_id = ?' : 'video_id = UUID_TO_BIN(?)'}`,
  [
    id,
  ],
);

const video = rows.at(0);
if (!video) {
  console.log('Video not found.');
  Deno.exit(1);
}

if (Deno.args.at(1)?.toLowerCase() === '--all') {
  console.dir(video);
} else {
  console.log(`Share ID: ${video.share_id}`);
  console.log(`Video ID: ${video.video_id}`);
}
