/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { db } from '../db.ts';
import {
  AuditSource,
  AuditType,
  BoardSource,
  FixedDemoStatus,
  Game,
  MapModel,
  MapType,
  PendingStatus,
  RenderQuality,
} from '~/shared/models.ts';
import * as uuid from 'uuid/mod.ts';
import { generateShareId, getDemoFilePath, getFixedDemoFilePath } from '../utils.ts';
import { getDemoInfo } from '../demo.ts';
import { logger } from '../logger.ts';
import { ChangelogEntry, fetchDemo, formatCmTime } from './portal2_sr.ts';
import { fetchMelDemo } from './mel.ts';

const AUTORENDER_RUN_SKIP_COOP_VIDEOS_CHECK =
  Deno.env.get('AUTORENDER_RUN_SKIP_COOP_VIDEOS_CHECK')?.toLowerCase() === 'true';

export const insertVideo = async (boardSource: BoardSource, entry: ChangelogEntry) => {
  const [existingVideo] = await db.query(
    `select 1
       from videos
      where board_source = ?
        and board_changelog_id = ?`,
    [
      boardSource,
      entry.id,
    ],
  );

  if (existingVideo) {
    return null;
  }

  logger.info(`Creating new video for ${entry.id}`);

  let filePath = '';
  let fixedFilePath = '';

  const fileCleanup = async () => {
    if (filePath) {
      try {
        await Deno.remove(filePath);
      } catch (err) {
        logger.error(err);
      }
    }

    if (fixedFilePath) {
      try {
        await Deno.remove(fixedFilePath);
      } catch (err) {
        logger.error(err);
      }
    }
  };

  try {
    const demoFetcher = boardSource === BoardSource.Mel ? fetchMelDemo : fetchDemo;
    const { demo, originalFilename } = await demoFetcher(entry.id);

    if (!demo.ok) {
      logger.error(`Unable to download demo`);
      return null;
    }

    const videoId = uuid.v1.generate() as string;
    const shareId = generateShareId();

    filePath = getDemoFilePath({ share_id: shareId });

    using demoFile = await Deno.open(filePath, { write: true, create: true });
    await demo.body?.pipeTo(demoFile.writable);

    const demoInfo = await getDemoInfo(filePath, { isBoardDemo: true });

    logger.info({ demoInfo });

    if (demoInfo === null || typeof demoInfo === 'string') {
      logger.error('Invalid demo', demoInfo);
      await fileCleanup();
      return null;
    }

    if (demoInfo.useFixedDemo) {
      fixedFilePath = getFixedDemoFilePath({ share_id: shareId });
    }

    if (demoInfo.isWorkshopMap && !demoInfo.workshopInfo?.fileUrl) {
      logger.error(`Failed to resolve workshop map`);
      await fileCleanup();
      return null;
    }

    const [game] = await db.query<Game>(
      `select game_id
         from games
        where game_mod = ?`,
      [
        demoInfo.gameDir,
      ],
    );

    if (!game) {
      logger.error(`Invalid game dir: ${demoInfo.gameDir}`);
      return null;
    }

    let [map] = await db.query<MapModel>(
      `select map_id
            , auto_fullbright
         from maps
        where game_id = ?
          and name = ?`,
      [
        game!.game_id,
        demoInfo.fullMapName,
      ],
    );

    if (!map) {
      await db.execute(
        `insert into maps (
                game_id
              , name
              , alias
              , type
              , workshop_file_id
              , creator_steam_id
            ) values (
                ?
              , ?
              , ?
              , ?
              , ?
              , ?
            )`,
        [
          game!.game_id,
          demoInfo.fullMapName,
          demoInfo.workshopInfo?.title ?? null,
          demoInfo.workshopInfo
            ? demoInfo.workshopInfo.isSinglePlayer ? MapType.WorkshopSinglePlayer : MapType.WorkshopCooperative
            : null,
          demoInfo.workshopInfo?.publishedFileId ?? null,
          demoInfo.workshopInfo?.creator ?? null,
        ],
      );

      const [newMap] = await db.query<MapModel>(
        `select map_id
              , auto_fullbright
           from maps
          where game_id = ?
            and name = ?`,
        [
          game!.game_id,
          demoInfo.fullMapName,
        ],
      );

      map = newMap!;
    }

    const title = `${entry.chamberName} in ${formatCmTime(parseInt(entry.score, 10))} by ${entry.player_name}`;
    const comment = entry.note;
    const renderQuality = RenderQuality.HD_720p;
    const renderOptions = [
      ...(map.auto_fullbright
        ? [
          `mat_ambient_light_r 0.05`,
          `mat_ambient_light_g 0.05`,
          `mat_ambient_light_b 0.05`,
        ]
        : []),
    ];

    if (AUTORENDER_RUN_SKIP_COOP_VIDEOS_CHECK && demoInfo.disableRenderSkipCoopVideos) {
      renderOptions.push('sar_render_skip_coop_videos 0');
    }

    const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
    const demoMetadata = JSON.stringify(demoInfo.metadata);
    const boardChangelogId = entry.id;
    const boardProfileNumber = entry.profile_number;
    const boardRank = entry.post_rank;

    const fields = [
      videoId,
      game!.game_id,
      map.map_id,
      shareId,
      title,
      comment,
      renderQuality,
      renderOptions.filter((command) => command !== null).join('\n'),
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
      boardSource,
      boardChangelogId,
      boardProfileNumber,
      boardRank,
      PendingStatus.RequiresRender,
    ];

    await db.execute(
      `insert into videos (
              video_id
            , game_id
            , map_id
            , share_id
            , title
            , comment
            , render_quality
            , render_options
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
            , board_source
            , board_changelog_id
            , board_profile_number
            , board_rank
            , pending
      ) values (UUID_TO_BIN(?), ${new Array(fields.length - 1).fill('?').join(',')})`,
      fields,
    );

    logger.info('Inserted video', { video_id: videoId });

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
          `Created video ${videoId} automatically`,
          AuditType.Info,
          AuditSource.Server,
          null,
        ],
      );
    } catch (err) {
      logger.error(err);
    }

    return shareId;
  } catch (err) {
    logger.error(err);
    await fileCleanup();
  }

  return null;
};
