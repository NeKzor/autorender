/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This task is able to update demo metadata of videos if
 * there are any new changes or issues.
 */

import { SourceDemo, SourceDemoParser } from '@nekz/sdp';
import { isSarMessage, readSarMessages, SarDataType } from '@nekz/sdp/utils';
import { db } from '../db.ts';
import type { DemoMetadata, SarDataSegment, SarDataSplit } from '../demo.ts';
import { getDemoFilePath } from '../utils.ts';
import { BoardSource, type Video } from '~/shared/models.ts';
import { fetchDemo } from './portal2_sr.ts';
import { fetchMelDemo } from './mel.ts';

const getSarData = (demo: SourceDemo): DemoMetadata => {
  const messages = readSarMessages(demo);
  const speedrun = messages.find(isSarMessage(SarDataType.SpeedrunTime));

  const segments: SarDataSegment[] = [];

  for (const split of speedrun?.splits ?? []) {
    const splits: SarDataSplit[] = [];
    let ticks = 0;

    for (const seg of split.segs ?? []) {
      splits.push({ name: seg.name, ticks: seg.ticks });
      ticks += seg.ticks;
    }

    segments.push({
      name: split.name,
      ticks,
      splits,
    });
  }

  const timestamp = messages.find(isSarMessage(SarDataType.Timestamp));

  return {
    segments,
    timestamp: timestamp
      ? {
        year: timestamp.year,
        mon: timestamp.mon,
        day: timestamp.day,
        hour: timestamp.hour,
        min: timestamp.min,
        sec: timestamp.sec,
      }
      : null,
  };
};

const videos = await db.query<Pick<Video, 'share_id' | 'board_source' | 'board_changelog_id'>>(
  `select share_id
        , board_source
        , board_changelog_id
     from videos
    where JSON_LENGTH(JSON_EXTRACT(demo_metadata, '$.segments')) = 0
      and board_changelog_id is not null
      and created_at >= DATE('2025-01-18')
 order by created_at`,
);

let count = 1;

for (const video of videos) {
  try {
    console.log(`[~] ${video.share_id} (${count++}/${videos.length})`);

    const buffer = await (async () => {
      if (video.board_source === BoardSource.None) {
        return Deno.readFileSync(getDemoFilePath(video)).buffer;
      }

      if (video.board_source === BoardSource.Portal2) {
        const { demo } = await fetchDemo(video.board_changelog_id);
        return demo.arrayBuffer();
      }

      if (video.board_source === BoardSource.Mel) {
        const { demo } = await fetchMelDemo(video.board_changelog_id);
        return demo.arrayBuffer();
      }

      throw new Error('Invalid board source: ' + video.board_source);
    })();

    const demo = SourceDemoParser.default().parse(buffer);
    const metadata = getSarData(demo);
    const demoMetadata = JSON.stringify(metadata);

    console.log('[+]', video.share_id, demoMetadata.length);

    await db.execute(
      `update videos
          set demo_metadata = ?
        where share_id = ?`,
      [
        demoMetadata,
        video.share_id,
      ],
    );
  } catch (err) {
    console.error('[-]', video.share_id, err);
  }
}
