/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Messages, NetMessages, ScoreboardTempUpdate, SourceDemo, SourceDemoParser, StringTables } from '@nekz/sdp';
import { logger } from './logger.ts';
import { basename, dirname, join } from 'path/mod.ts';
import { readSarData, SarDataType } from './sar.ts';
import { SteamId } from './steam.ts';

const AUTORENDER_MIN_PLAYBACK_TIME = 1;
const AUTORENDER_MAX_PLAYBACK_TIME = 6 * 60;

// Supported app IDs from mirror.nekz.me
enum WorkshopSteamAppId {
  None = 0,
  Portal2 = 620,
  ApertureTag = 280740,
  ThinkingWithTimeMachine = 286080,
  Portal2CommunityEdition = 440000,
  PortalReloaded = 1255980,
}

export enum GameMod {
  Portal2 = 'portal2',
  ThinkingWithTimeMachine = 'TWTM',
  ApertureTag = 'aperturetag',
  PortalStoriesMel = 'portal_stories',
  Portal2CommunityEdition = 'p2ce',
  PortalReloaded = 'portalreloaded',
  Portal2SpeedrunMod = 'Portal 2 Speedrun Mod',
}

export interface SupportedGame {
  name: string;
  workshopAppId: WorkshopSteamAppId;
}

// NOTE: Make sure that these are inserted into the "games" table.
export const supportedGameMods: { [gameDir: string]: SupportedGame } = {
  [GameMod.Portal2]: {
    name: 'Portal 2',
    workshopAppId: WorkshopSteamAppId.Portal2,
  },
  [GameMod.ThinkingWithTimeMachine]: {
    name: 'Thinking With Time Machine',
    workshopAppId: WorkshopSteamAppId.ThinkingWithTimeMachine,
  },
  [GameMod.ApertureTag]: {
    name: 'Aperture Tag',
    workshopAppId: WorkshopSteamAppId.ApertureTag,
  },
  [GameMod.PortalStoriesMel]: {
    name: 'Portal Stories Mel',
    workshopAppId: WorkshopSteamAppId.None,
  },
  // [GameMod.Portal2CommunityEdition]: {
  //   name: 'Portal 2: Community Edition',
  //   workshopAppId: WorkshopSteamAppId.Portal2CommunityEdition,
  // },
  [GameMod.PortalReloaded]: {
    name: 'Portal Reloaded',
    workshopAppId: WorkshopSteamAppId.PortalReloaded,
  },
  [GameMod.Portal2SpeedrunMod]: {
    name: 'Portal 2 SpeedrunMod',
    workshopAppId: WorkshopSteamAppId.None,
  },
};

export const supportedGameDirs = Object.keys(supportedGameMods);

export const getDemoInfo = async (filePath: string, options?: { isBoardDemo?: boolean }) => {
  const buffer = await Deno.readFile(filePath);

  try {
    const parser = SourceDemoParser.default()
      .setOptions({
        // Workshop info + challenge mode data
        packets: true,
        // Demo fixup
        dataTables: !options?.isBoardDemo,
        // Steam data
        stringTables: true,
      });

    let demo: SourceDemo;

    try {
      demo = parser
        .parse(buffer)
        .adjustTicks()
        .adjustRange();
    } catch (err) {
      logger.error(err);
      return 'Corrupted demo.';
    }

    const supportedGame = supportedGameMods[demo.gameDirectory!];
    if (supportedGame === undefined) {
      return 'Game is not supported.';
    }

    const playbackTime = demo.playbackTime ?? 0;

    if (playbackTime < AUTORENDER_MIN_PLAYBACK_TIME) {
      return 'Demo is too short.';
    }

    if (playbackTime > AUTORENDER_MAX_PLAYBACK_TIME) {
      return 'Demo is too long.';
    }

    let fixupResult: Awaited<ReturnType<typeof autoFixupOldPortal2Demo>> = false;

    if (demo.gameDirectory === 'portal2' && !options?.isBoardDemo) {
      fixupResult = await autoFixupOldPortal2Demo(
        demo,
        parser,
        buffer,
        filePath,
      );

      if (fixupResult === null || typeof fixupResult === 'string') {
        return fixupResult;
      }
    }

    const info = demo.findPacket(NetMessages.SvcServerInfo);
    if (!info?.mapName) {
      logger.error(
        `SvcServerInfo packet or map name not found in demo: ${filePath}`,
      );
      return 'Corrupted demo.';
    }

    // TODO: More strict validation
    const isWorkshopMap = !options?.isBoardDemo && demo.mapName !== info.mapName;
    const fullMapName = info.mapName.replaceAll('\\', '/');

    return {
      size: buffer.byteLength,
      mapName: demo.mapName,
      fullMapName,
      mapCrc: info.mapCrc,
      isWorkshopMap,
      workshopInfo: isWorkshopMap ? await getWorkshopInfo(supportedGame.workshopAppId, fullMapName) : null,
      gameDir: demo.gameDirectory,
      playbackTime: demo.playbackTime,
      useFixedDemo: fixupResult === true,
      tickrate: demo.getTickrate(),
      metadata: getSarData(demo),
      ...getChallengeModeData(demo),
      ...getPlayerInfo(demo),
    };
  } catch (err) {
    logger.error(err);
    return null;
  }
};

interface WorkshopInfo {
  fileUrl: string | null;
  title: string | null;
  publishedFileId: string | null;
  creator: string | null;
  isSinglePlayer: boolean | null;
}

// Example: workshop/271715738875416672/bhop_outdoors
export const getWorkshopInfo = async (appId: WorkshopSteamAppId, mapName: string): Promise<WorkshopInfo> => {
  const [path, ugc, name] = mapName.split('/', 3);

  if (path === 'workshop') {
    if (!name || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid map name found in demo: ${name}`);
    }

    if (appId === WorkshopSteamAppId.None) {
      throw new Error(`Found workshop map but app ID ${appId} is not supported.`);
    }

    const res = await fetch(
      `http://steampowered.com.mirror.nekz.me/api/v1/workshop/${appId}/files/ugc/${ugc}`,
      {
        headers: {
          'User-Agent': Deno.env.get('USER_AGENT')!,
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Request to mirror.nekz.me failed : ${res.status}`);
    }

    const item = await res.json() as {
      file_url?: string;
      title?: string;
      publishedfileid?: string;
      creator?: string;
      tags?: ({ tag: string })[];
    };

    return {
      fileUrl: item.file_url ?? null,
      title: item.title ?? null,
      publishedFileId: item.publishedfileid ?? null,
      creator: item.creator ?? null,
      isSinglePlayer: Array.isArray(item.tags) ? item.tags.some(({ tag }) => tag === 'Singleplayer') : null,
    };
  }

  return {
    fileUrl: null,
    title: null,
    publishedFileId: null,
    creator: null,
    isSinglePlayer: null,
  };
};

// Valve, please fix.
const autoFixupOldPortal2Demo = async (
  demo: SourceDemo,
  parser: SourceDemoParser,
  buffer: ArrayBuffer,
  filePath: string,
) => {
  try {
    const dt = demo.findMessage(Messages.DataTable)?.dataTable;
    if (!dt) {
      logger.error(`DataTable message not found in demo: ${filePath}`);
      return 'Corrupted demo.';
    }

    const pointSurvey = dt.tables
      .findIndex((table) => table.netTableName === 'DT_PointSurvey');

    // Fixup not needed for already fixed or new demos.
    if (pointSurvey === -1) {
      return false;
    }

    // Current fixup method does not work on these maps :>
    const mapsWhichUsePointSurvey = [
      'sp_a2_bts2',
      'sp_a2_bts3',
      'sp_a3_portal_intro',
      'sp_a2_core',
      'sp_a2_bts4',
    ];

    if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
      return 'Unable to fix old Portal 2 demo.';
    }

    dt.tables.splice(pointSurvey, 1);

    const svc = dt.serverClasses.find((table) => table.dataTableName === 'DT_PointSurvey');

    if (!svc) {
      logger.error(`CPointCamera server class not found in demo: ${filePath}`);
      return 'Corrupted demo.';
    }

    svc.className = 'CPointCamera';
    svc.dataTableName = 'DT_PointCamera';

    const saved = parser.save(demo, buffer.byteLength);

    const filename = basename(filePath).slice(0, -4);
    const fixedFilePath = join(dirname(filePath), `${filename}_fixed.dem`);

    await Deno.writeFile(fixedFilePath, saved);

    return true;
  } catch (err) {
    logger.error(err);
    return null;
  }
};

export interface SarDataSplit {
  name: string;
  ticks: number;
}

export interface SarDataSegment {
  name: string;
  ticks: number;
  splits: SarDataSplit[];
}

export interface SarDataTimestamp {
  year: number;
  mon: number;
  day: number;
  hour: number;
  min: number;
  sec: number;
}

export interface DemoMetadata {
  segments: SarDataSegment[] | null;
  timestamp: SarDataTimestamp | null;
}

// Get speedrun + timestamp data from SAR.
const getSarData = (demo: SourceDemo): DemoMetadata => {
  try {
    const sar = readSarData(demo);
    const speedrun = sar.messages.find((message) => message.type === SarDataType.SpeedrunTime);

    const segments: SarDataSegment[] = [];

    for (const split of speedrun?.speedrunTime?.splits ?? []) {
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

    const timestamp = sar.messages.find((message) => message.type === SarDataType.Timestamp);

    return {
      segments,
      timestamp: timestamp?.timestamp
        ? {
          year: timestamp.timestamp.year,
          mon: timestamp.timestamp.mon,
          day: timestamp.timestamp.day,
          hour: timestamp.timestamp.hour,
          min: timestamp.timestamp.min,
          sec: timestamp.timestamp.sec,
        }
        : null,
    };
  } catch (err) {
    logger.error(err);
  }

  return {
    segments: null,
    timestamp: null,
  };
};

export interface ChallengeModeData {
  portalScore: number | null;
  timeScore: number | null;
}

// Get portal + time scores.
const getChallengeModeData = (demo: SourceDemo): ChallengeModeData => {
  try {
    const scoreboard = demo.findPacket<NetMessages.SvcUserMessage>((message) => {
      return message instanceof NetMessages.SvcUserMessage &&
        message.userMessage instanceof ScoreboardTempUpdate;
    });

    if (scoreboard) {
      const { portalScore, timeScore } = scoreboard.userMessage?.as<ScoreboardTempUpdate>() ?? {};

      return {
        portalScore: portalScore ?? null,
        timeScore: timeScore ?? null,
      };
    }
  } catch (err) {
    logger.error(err);
  }

  return {
    portalScore: null,
    timeScore: null,
  };
};

export interface PlayerInfoData {
  playerName: string | null;
  steamId: string | null;
  partnerPlayerName: string | null;
  partnerSteamId: string | null;
  isHost: number | null;
}

// Extract Steam name and ID64 from string table entry.
const extractSteamData = (playerInfo?: StringTables.StringTableEntry): [string | null, string | null] => {
  if (!playerInfo) {
    return [null, null];
  }

  const guid = playerInfo.data?.guid;
  if (guid === undefined) {
    logger.error(`Found undefined player info GUID`);
    return [null, null];
  }

  const steamId = SteamId.from(guid).toSteamId64();
  if (steamId === null) {
    logger.error(`Found invalid SteamID: ${guid}`);
  }

  return [
    playerInfo.data?.name ?? null,
    steamId?.toString() ?? null,
  ];
};

// Get player names and IDs.
export const getPlayerInfo = (demo: SourceDemo): PlayerInfoData => {
  try {
    const message = demo.findMessage(Messages.StringTable);
    const isHost = demo.serverName!.startsWith('localhost');

    for (const stringTable of message?.stringTables ?? []) {
      const entries = stringTable.entries ?? [];
      const playerInfos = entries.filter((entry) => entry.data instanceof StringTables.PlayerInfo);

      if (!playerInfos.length) {
        continue;
      }

      const host = playerInfos.at(isHost ? 0 : 1);
      const partner = playerInfos.at(isHost ? 1 : 0);

      const [playerName, steamId] = extractSteamData(host);
      const [partnerPlayerName, partnerSteamId] = extractSteamData(partner);

      return {
        playerName,
        steamId,
        partnerPlayerName,
        partnerSteamId,
        isHost: isHost ? 1 : 0,
      };
    }
  } catch (err) {
    logger.error(err);
  }

  return {
    playerName: null,
    steamId: null,
    partnerPlayerName: null,
    partnerSteamId: null,
    isHost: null,
  };
};
