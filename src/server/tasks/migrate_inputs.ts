/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This extracts all inputs from demo files.
 */

import 'dotenv/load.ts';

import { join } from 'path/mod.ts';
import { SourceDemoParser } from '@nekz/sdp';
import { Video } from '~/shared/models.ts';
import { db } from '../db.ts';
import { getInputData } from '../demo.ts';
import { installLogger, logger } from '../logger.ts';
import { Storage, getDemoFilePath, getDemoInputsFilePath } from '../utils.ts';

installLogger('migrate');

// rsync: rsync -avvvhrP --stats rsync://board.portal2.sr:/demos demos
// volume: demos:/storage/demos/migration:ro
const demosDir = join(Storage.Demos, 'migration');

type VideoSelect = Pick<Video, 'video_id' | 'share_id' | 'board_changelog_id'>;

const videos = await db.query<VideoSelect>(
  `select BIN_TO_UUID(video_id) as video_id
        , share_id
        , board_changelog_id
     from videos
    where video_url is not null`,
);

const videoLookup = new Map<number, VideoSelect>();
videos.forEach((video) => video.board_changelog_id && videoLookup.set(video.board_changelog_id, video));

const parser = SourceDemoParser.default();

const extractInputs = async (file: string, video: VideoSelect) => {
  try {
    logger.info(`Parsing : ${video.share_id} : ${file}`);

    const buffer = await Deno.readFile(file);
    const demo = parser.parse(buffer);
    const inputs = getInputData(demo);
    if (!inputs) {
      return;
    }

    using inputsFile = await Deno.open(getDemoInputsFilePath(video), { create: true, write: true });
    await inputsFile.writable.getWriter().write(new Uint8Array(inputs.buffer));
  } catch (err) {
    logger.error(`Failed to write inputs ${video.share_id}`);
    logger.error(err);
  }
};

// Board demos
for await (const demo of Deno.readDir(demosDir)) {
  if (!demo.isFile) {
    continue;
  }

  const id = demo.name.slice(demo.name.lastIndexOf('_') + 1, -4);
  const video = videoLookup.get(parseInt(id, 10));
  if (!video) {
    logger.error(`Failed to lookup video for ${demo.name} : ${id}`);
    continue;
  }

  await extractInputs(join(demosDir, demo.name), video);
}

// Non-board demos
for (const video of videos) {
  if (video.board_changelog_id) {
    continue;
  }
  
  const file = getDemoFilePath(video);
  await extractInputs(file, video);
}
