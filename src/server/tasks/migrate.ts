/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This migrates all old renders from autorender v1.
 */

import 'dotenv/load.ts';

import { join } from 'path/join.ts';
import { db } from '../db.ts';
import { FixedDemoStatus, MapModel, PendingStatus, RenderQuality } from '~/shared/models.ts';
import * as uuid from 'uuid/mod.ts';
import { generateShareId, Storage } from '../utils.ts';
import { getDemoInfo } from '../demo.ts';
import { installLogger, logger } from '../logger.ts';
import { formatCmTime } from './portal2_sr.ts';

const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;

installLogger('migrate');

// rsync: rsync -avvvhrP --stats rsync://board.portal2.sr:/demos demos
// volume: demos:/storage/demos/migration:ro
const demosDir = join(Storage.Demos, 'migration');

// Data dump from mirror :^)
// volume: board-portal2.changelogs_top_200.json:/storage/demos/board-portal2.changelogs_top_200.json:ro
const top200Data = join(Storage.Demos, 'board-portal2.changelogs_top_200.json');

// From "games" table
const portal2GameId = 1;

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

interface MirrorEntry {
  id: number;
  chamberName: string;
  mapid: number;
  note: string | null;
  player_name: string;
  post_rank: number;
  profile_number: string;
  score: number;
  time_gained: string;
  video_url: string;
  demo_name: string;
}

const main = async () => {
  const entries = JSON.parse(await Deno.readTextFile(top200Data)) as MirrorEntry[];

  const maps = await db.query<Pick<MapModel, 'map_id' | 'best_time_id'>>(
    `select map_id
          , best_time_id
       from maps
      where game_id = ?
        and best_time_id is not null`,
    [
      portal2GameId,
    ],
  );

  const mapIdMapping = maps.reduce(
    (cache, map) => cache.set(map.best_time_id, map.map_id),
    new Map<MapModel['best_time_id'], MapModel['map_id']>(),
  );

  for (const entry of entries) {
    try {
      const mapId = mapIdMapping.get(entry.mapid);
      if (mapId === undefined) {
        throw new Error(`No mapping for map ID ${entry.mapid} of entry ${entry.id}`);
      }

      await insertVideo(entry, mapId);
    } catch (err) {
      logger.error(err);
    }
  }
};

const insertVideo = async (entry: MirrorEntry, mapId: number) => {
  logger.info(JSON.stringify(entry));

  const [existingVideo] = await db.query(
    `select 1
       from videos
      where board_changelog_id = ?`,
    [entry.id],
  );

  if (existingVideo) {
    return;
  }

  const isRendered = entry.video_url !== null;

  try {
    const videoId = uuid.v1.generate() as string;
    const shareId = generateShareId();

    const demoInfo = await getDemoInfo(join(demosDir, entry.demo_name), { isBoardDemo: true });

    if (demoInfo === null || typeof demoInfo === 'string') {
      logger.error('Invalid demo', demoInfo);
      return;
    }

    const title = `${entry.chamberName} in ${formatCmTime(entry.score)} by ${entry.player_name}`;
    const comment = entry.note;
    const renderQuality = RenderQuality.HD_720p;
    const renderOptions: string[] = [];
    const createdAt = entry.time_gained;
    const renderedAt = createdAt;
    // FIXME: Use "rendered_by" field from autorender v1
    const renderNode = 'portal2-cm-autorender';
    const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
    const demoMetadata = JSON.stringify(demoInfo.metadata);
    const boardChangelogId = entry.id;
    const boardProfileNumber = entry.profile_number;
    const boardRank = entry.post_rank;
    // NOTE: I've verified that all URLs from autorender v1 are the same
    const videoUrl = isRendered ? `https://f002.backblazeb2.com/file/portal2-boards-autorender/${entry.id}.mp4` : null;
    const thumbnailUrlLarge = isRendered
      ? `https://f002.backblazeb2.com/file/portal2-boards-autorender/${entry.id}.jpg`
      : null;
    const processed = 1;

    const fields = [
      videoId,
      portal2GameId,
      mapId,
      shareId,
      title,
      comment,
      createdAt,
      renderedAt,
      renderQuality,
      renderOptions.filter((command) => command !== null).join('\n'),
      renderNode,
      entry.demo_name,
      demoInfo.workshopInfo?.fileUrl ?? null,
      demoInfo.fullMapName,
      demoInfo.size,
      demoInfo.mapCrc,
      demoInfo.gameDir,
      demoInfo.playbackTime,
      requiredDemoFix,
      demoInfo.tickrate,
      demoInfo.portalScore,
      demoInfo.timeScore,
      demoInfo.playerName,
      demoInfo.steamId,
      demoInfo.partnerPlayerName,
      demoInfo.partnerSteamId,
      demoInfo.isHost,
      demoMetadata,
      boardChangelogId,
      boardProfileNumber,
      boardRank,
      PendingStatus.FinishedRender,
      videoUrl,
      thumbnailUrlLarge,
      processed,
    ];

    await db.execute(
      `insert into videos (
              video_id
            , game_id
            , map_id
            , share_id
            , title
            , comment
            , created_at
            , rendered_at
            , render_quality
            , render_options
            , render_node
            , file_name
            , file_url
            , full_map_name
            , demo_size
            , demo_map_crc
            , demo_game_dir
            , demo_playback_time
            , demo_required_fix
            , demo_tickrate
            , demo_portal_score
            , demo_time_score
            , demo_player_name
            , demo_steam_id
            , demo_partner_player_name
            , demo_partner_steam_id
            , demo_is_host
            , demo_metadata
            , board_changelog_id
            , board_profile_number
            , board_rank
            , pending
            , video_url
            , thumbnail_url_large
            , processed
          ) values (UUID_TO_BIN(?), ${new Array(fields.length - 1).fill('?').join(',')})`,
      fields,
    );

    logger.info(
      `Inserted video ${videoId} : ${AUTORENDER_PUBLIC_URI}/videos/${shareId} : ${isRendered ? 'rendered' : 'missing'}`,
    );
  } catch (err) {
    logger.error(err);
  }
};

await main();
