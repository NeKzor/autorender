/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This migrates all old renders from autorender v1.
 */

import 'dotenv/load.ts';

import { join } from 'path/join.ts';
import { db } from '../db.ts';
import { AuditSource, AuditType, FixedDemoStatus, MapModel, PendingStatus, RenderQuality } from '~/shared/models.ts';
import * as uuid from 'uuid/mod.ts';
import { generateShareId, Storage } from '../utils.ts';
import { getDemoInfo } from '../demo.ts';
import { logger } from '../logger.ts';
import { formatCmTime, getChangelog, getInfo } from './portal2_sr.ts';

const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;

// rsync: rsync -avvvhrP --stats rsync://board.portal2.sr:/demos /demos
// volume: /demos:/storage/demos/migration:rw
const demosDir = join(Storage.Demos, 'migration');

// From "games" table
const portal2GameId = 1;

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

const insertVideo = async (filePath: string, originalFilename: string) => {
  const [_chamberName, _score, _playerProfileNumber, changelogId] = originalFilename.slice(0, -4).split('_');
  logger.info(JSON.stringify({ originalFilename, changelogId }));

  const [existingVideo] = await db.query(
    `select 1
       from videos
      where board_changelog_id = ?`,
    [changelogId],
  );

  logger.info({ existingVideo });

  if (existingVideo) {
    return;
  }

  if (!changelogId) {
    throw new Error('No ID');
  }

  let isRendered = false;

  const entry = await (async () => {
    const info = await getInfo(changelogId);
    if (info) {
      isRendered = true;

      return {
        changelogId,
        chamber: info.map_id,
        chamberName: info.map,
        profile_number: info.user_id,
        post_rank: info.orig_rank,
        note: info.comment ?? '',
        score: info.time,
        player_name: info.user,
        rendered_by: info.rendered_by,
        date: info.date.replace('T', ' ').slice(0, -1),
      };
    } else {
      const [entry] = (await getChangelog({ id: Number(changelogId) })) ?? [];
      if (!entry) {
        try {
          await db.execute(
            `insert into audit_logs (
                    title
                  , audit_type
                  , source
                  , source_user_id
                ) values (
                    ?
                  , ?
                  , ?
                  , ?
                )`,
            [
              `Missing entry for changelog ID ${changelogId}`,
              AuditType.Error,
              AuditSource.Server,
              null,
            ],
          );
          logger.warn(`Inserted error audit log`);
        } catch (err) {
          logger.error(err);
        }
        return null;
      }

      return {
        changelogId,
        chamber: entry.mapid,
        chamberName: entry.chamberName,
        profile_number: entry.profile_number,
        post_rank: entry.post_rank,
        note: entry.note,
        score: Number(entry.score),
        player_name: entry.player_name,
        rendered_by: null,
        // If only the date was in ISO format...
        date: entry.time_gained,
      };
    }
  })();

  if (!entry) {
    return;
  }

  try {
    const videoId = uuid.v1.generate() as string;
    const shareId = generateShareId();

    const demoInfo = await getDemoInfo(filePath, { isBoardDemo: true });

    if (demoInfo === null || typeof demoInfo === 'string') {
      logger.error('Invalid demo', demoInfo);
      return;
    }

    const [map] = await db.query<MapModel>(
      `select map_id
           from maps
          where best_time_id = ?`,
      [
        entry.chamber,
      ],
    );

    const title = `${entry.chamberName} in ${formatCmTime(entry.score)} by ${entry.player_name}`;
    const comment = entry.note;
    const renderQuality = RenderQuality.HD_720p;
    const renderOptions: string[] = [];
    const createdAt = entry.date;
    const renderedAt = createdAt;
    const renderNode = entry.rendered_by;
    const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
    const demoMetadata = JSON.stringify(demoInfo.metadata);
    const boardChangelogId = entry.changelogId;
    const boardProfileNumber = entry.profile_number;
    const boardRank = entry.post_rank;
    // FIXME: The info API route should return these URLs :>
    const videoUrl = isRendered
      ? `https://f002.backblazeb2.com/file/portal2-boards-autorender/${entry.changelogId}.mp4`
      : null;
    const thumbnailUrlLarge = isRendered
      ? `https://f002.backblazeb2.com/file/portal2-boards-autorender/${entry.changelogId}.jpg`
      : null;
    const processed = 1;

    const fields = [
      videoId,
      portal2GameId,
      map!.map_id,
      shareId,
      title,
      comment,
      createdAt,
      renderedAt,
      renderQuality,
      renderOptions.filter((command) => command !== null).join('\n'),
      renderNode,
      originalFilename,
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

for await (const file of Deno.readDir(demosDir)) {
  try {
    if (file.isFile) {
      await insertVideo(join(demosDir, file.name), file.name);
    }
  } catch (err) {
    logger.error(err);
  }
}
