/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This checks if there are any videos to render from board.portal2.sr.
 */

import 'dotenv/load.ts';
import { db } from '../db.ts';
import {
  AuditSource,
  AuditType,
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
import { fetchDemo, formatCmTime, getChangelog } from './portal2_sr.ts';

const AUTORENDER_RUN_SKIP_COOP_VIDEOS_CHECK =
  Deno.env.get('AUTORENDER_RUN_SKIP_COOP_VIDEOS_CHECK')?.toLowerCase() === 'true';

const BOARD_INTEGRATION_UPDATE_INTERVAL = 60 * 1_000;
const BOARD_INTEGRATION_START_DATE = '2023-08-25';

const FAILED_RENDER_MIN_RETRY_MINUTES = 15;
const FAILED_RENDER_MAX_RETRY_MINUTES = 60;

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

const checkChangelogUpdates = async () => {
  const changelog = await getChangelog({
    endRank: 200,
    maxDaysAgo: 1,
    banned: 0,
    pending: 0,
  });

  if (!changelog) {
    return;
  }

  for (const entry of changelog) {
    if (entry.time_gained.slice(0, 10) < BOARD_INTEGRATION_START_DATE) {
      continue;
    }

    const [existingVideo] = await db.query(
      `select 1
       from videos
      where board_changelog_id = ?`,
      [entry.id],
    );

    if (existingVideo) {
      continue;
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
          await Deno.remove(filePath);
        } catch (err) {
          logger.error(err);
        }
      }
    };

    try {
      const { demo, originalFilename } = await fetchDemo(entry.id);

      if (!demo.ok) {
        logger.error(`Unable to download demo`);
        continue;
      }

      const videoId = uuid.v1.generate() as string;
      const shareId = generateShareId();

      filePath = getDemoFilePath(videoId);

      const demoFile = await Deno.open(filePath, { write: true, create: true });
      await demo.body?.pipeTo(demoFile.writable);
      try {
        demoFile.close();
        // deno-lint-ignore no-empty
      } catch {}

      const demoInfo = await getDemoInfo(filePath, { isBoardDemo: true });

      console.dir({ demoInfo });

      if (demoInfo === null || typeof demoInfo === 'string') {
        logger.error('Invalid demo', demoInfo);
        await fileCleanup();
        continue;
      }

      if (demoInfo.useFixedDemo) {
        fixedFilePath = getFixedDemoFilePath(videoId);
      }

      if (demoInfo.isWorkshopMap && !demoInfo.workshopInfo?.fileUrl) {
        logger.error(`Failed to resolve workshop map`);
        await fileCleanup();
        continue;
      }

      const [game] = await db.query<Game>(
        `select game_id
           from games
          where game_mod = ?`,
        [
          demoInfo.gameDir,
        ],
      );

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
    } catch (err) {
      logger.error(err);
      await fileCleanup();
    }
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

const update = async () => {
  try {
    await checkChangelogUpdates();
  } catch (err) {
    logger.error(err);
  }

  try {
    await resetFailedAutorenders();
  } catch (err) {
    logger.error(err);
  }
};

setInterval(update, BOARD_INTEGRATION_UPDATE_INTERVAL);
