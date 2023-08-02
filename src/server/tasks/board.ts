/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This checks if there are any videos to render from board.portal2.sr.
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { db } from '../db.ts';
import { AuditSource, AuditType, FixedDemoStatus, PendingStatus, RenderQuality } from '../../shared/models.ts';
import * as uuid from 'https://deno.land/std@0.192.0/uuid/mod.ts';
import { generateShareId, getDemoFilePath, getFixedDemoFilePath } from '../utils.ts';
import { getDemoInfo } from '../demo.ts';
import { logger } from '../logger.ts';

const BOARD_INTEGRATION_UPDATE_INTERVAL = 60 * 1_000;
const BOARD_INTEGRATION_STARTED_DATE = '2023-08-01';

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { ev });
});

const formatCmTime = (time: number) => {
  if (isNaN(time)) return '0.00';
  const cs = time % 100;
  const secs = Math.floor(time / 100);
  const sec = secs % 60;
  const min = Math.floor(secs / 60);
  return min > 0
    ? `${min}:${sec < 10 ? `0${sec}` : `${sec}`}.${cs < 10 ? `0${cs}` : `${cs}`}`
    : `${sec}.${cs < 10 ? `0${cs}` : `${cs}`}`;
};

const fetchDemo = async (url: string) => {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
    redirect: 'manual',
  });

  const location = res.headers.get('Location');
  if (!location) {
    logger.error({ url: res.url, headers: res.headers });
    throw new Error('Unable to redirect without location.');
  }

  const redirect = new URL(res.url);
  redirect.pathname = location;

  const demo = await fetch(redirect.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
  });

  return {
    demo,
    originalFilename: location.slice(location.lastIndexOf('/') + 1),
  };
};

const mapsWhichAreWayTooDark: { map: string; value: number }[] = [
  { map: 'sp_a2_bts3', value: 1 },
];

export type ChangelogOptions =
  & {
    id?: number;
    chamber?: string;
    chapter?: string;
    boardName?: string;
    profileNumber?: string;
    type?: string;
    sp?: 0 | 1;
    coop?: 0 | 1;
    wr?: 0 | 1;
    demo?: 0 | 1;
    yt?: 0 | 1;
    endDate?: string;
    startRank?: number;
    endRank?: number;
    submission?: 0 | 1;
    banned?: 0 | 1;
    pending?: 0 | 1 | 2;
  }
  & (
    {
      maxDaysAgo?: number;
    } | {
      startDate?: string;
    }
  );

export interface ChangelogEntry {
  player_name: string;
  avatar: string;
  profile_number: string;
  score: string;
  id: string;
  pre_rank: string;
  post_rank: string;
  wr_gain: string;
  time_gained: string;
  hasDemo: string;
  youtubeID: string | null;
  note: string;
  banned: string;
  submission: string;
  pending: string;
  previous_score: string | null;
  chamberName: string;
  chapterId: string;
  mapid: string;
  improvement: number;
  rank_improvement: number | null;
  pre_points: number | null;
  post_point: number | null;
  point_improvement: number | null;
}

const BASE_API = 'https://board.portal2.sr';

const getChangelog = async (options?: ChangelogOptions) => {
  const params = new URLSearchParams();

  Object.entries(options ?? {}).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, value.toString());
    }
  });

  const query = params.toString();

  const url = `${BASE_API}/changelog/json?${query}`;
  logger.info(`[GET] ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': Deno.env.get('USER_AGENT')!,
    },
  });

  if (!res.ok) {
    logger.error('Failed to fetch changelog. Status:', res.statusText);
    return null;
  }

  return await res.json() as ChangelogEntry[];
};

const checkChangelogUpdates = async () => {
  const changelog = await getChangelog({
    endRank: 200,
    maxDaysAgo: 1,
    submission: 1,
    pending: 0,
    banned: 0,
  });

  if (!changelog) {
    return;
  }

  for (const entry of changelog) {
    if (entry.time_gained.slice(0, 10) < BOARD_INTEGRATION_STARTED_DATE) {
      continue;
    }

    const [existingVideo] = await db.query(
      `select 1
       from videos
      where board_changelog_id = ?`,
      [entry.id],
    );

    logger.info({ id: entry.id, existingVideo });

    if (existingVideo) {
      continue;
    }

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
      const { demo, originalFilename } = await fetchDemo(`${BASE_API}/getDemo?id=${entry.id}`);

      if (!demo.ok) {
        logger.error(`Unable to download demo`);
        continue;
      }

      const videoId = uuid.v1.generate() as string;
      const shareId = generateShareId();

      filePath = getDemoFilePath(videoId);

      const demoFile = await Deno.open(filePath, { write: true, create: true });
      await demo.body?.pipeTo(demoFile.writable);

      const demoInfo = await getDemoInfo(filePath);

      if (demoInfo === null || typeof demoInfo === 'string') {
        logger.error('Invalid demo', demoInfo);
        await fileCleanup();
        continue;
      }

      if (demoInfo.useFixedDemo) {
        fixedFilePath = getFixedDemoFilePath(videoId);
      }

      if (demoInfo.isWorkshopMap && !demoInfo.fileUrl) {
        logger.error(`Failed to resolve workshop map`);
        await fileCleanup();
        continue;
      }

      const fullbrightOption = mapsWhichAreWayTooDark.find(({ map }) => map === demoInfo.mapName);

      const title = `${entry.chamberName} in ${formatCmTime(parseInt(entry.score, 10))} by ${entry.player_name}`;
      const comment = entry.note;
      const requestedByName = null;
      const requestedById = null;
      const requestedInGuildId = null;
      const requestedInGuildName = null;
      const requestedInChannelId = null;
      const requestedInChannelName = null;
      const renderQuality = RenderQuality.HD_720p;
      const renderOptions = [
        fullbrightOption !== undefined ? `mat_fullbright ${fullbrightOption.value}` : null,
      ];
      const requiredDemoFix = demoInfo.useFixedDemo ? FixedDemoStatus.Required : FixedDemoStatus.NotRequired;
      const demoMetadata = JSON.stringify(demoInfo.metadata);
      const boardChangelogId = entry.id;
      const boardProfileNumber = entry.profile_number;
      const boardRank = entry.post_rank;

      logger.info({ filename: fullbrightOption });
      if (fullbrightOption) {
        Deno.exit(1);
      }

      const fields = [
        videoId,
        shareId,
        title,
        comment,
        requestedByName,
        requestedById,
        requestedInGuildId,
        requestedInGuildName,
        requestedInChannelId,
        requestedInChannelName,
        renderQuality,
        renderOptions.filter((command) => command !== null).join('\n'),
        originalFilename,
        demoInfo.fileUrl,
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
        demoMetadata,
        boardChangelogId,
        boardProfileNumber,
        boardRank,
        PendingStatus.RequiresRender,
      ];

      await db.execute(
        `insert into videos (
              video_id
            , share_id
            , title
            , comment
            , requested_by_name
            , requested_by_id
            , requested_in_guild_id
            , requested_in_guild_name
            , requested_in_channel_id
            , requested_in_channel_name
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

const update = async () => {
  try {
    logger.info('checking for changelog updates');
    await checkChangelogUpdates();
  } catch (err) {
    logger.error(err);
  }
};

await update();

setInterval(update, BOARD_INTEGRATION_UPDATE_INTERVAL);
