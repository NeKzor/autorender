/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  DemoMessages,
  Messages,
  NetMessages,
  ScoreboardTempUpdate,
  SourceDemo,
  SourceDemoBuffer,
  SourceDemoParser,
  StringTables,
} from '@nekz/sdp';
import { logger } from './logger.ts';
import { basename, dirname, join } from '@std/path';
import { getPlayerSteamData, isSarMessage, readSarMessages, SarDataType, SteamIdResult } from '@nekz/sdp/utils';

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
  tickrate: number;
  autoFixup: boolean;
}

// NOTE: Make sure that these are inserted into the "games" table.
export const supportedGameMods: { [gameDir: string]: SupportedGame } = {
  [GameMod.Portal2]: {
    name: 'Portal 2',
    workshopAppId: WorkshopSteamAppId.Portal2,
    tickrate: 60,
    autoFixup: true,
  },
  [GameMod.ThinkingWithTimeMachine]: {
    name: 'Thinking With Time Machine',
    workshopAppId: WorkshopSteamAppId.ThinkingWithTimeMachine,
    tickrate: 60,
    autoFixup: false,
  },
  [GameMod.ApertureTag]: {
    name: 'Aperture Tag',
    workshopAppId: WorkshopSteamAppId.ApertureTag,
    tickrate: 60,
    autoFixup: false,
  },
  [GameMod.PortalStoriesMel]: {
    name: 'Portal Stories Mel',
    workshopAppId: WorkshopSteamAppId.None,
    tickrate: 60,
    autoFixup: false,
  },
  // [GameMod.Portal2CommunityEdition]: {
  //   name: 'Portal 2: Community Edition',
  //   workshopAppId: WorkshopSteamAppId.Portal2CommunityEdition,
  //   tickrate: 60,
  //   autoFixup: false,
  // },
  [GameMod.PortalReloaded]: {
    name: 'Portal Reloaded',
    workshopAppId: WorkshopSteamAppId.PortalReloaded,
    tickrate: 60,
    autoFixup: false,
  },
  [GameMod.Portal2SpeedrunMod]: {
    name: 'Portal 2 Speedrun Mod',
    workshopAppId: WorkshopSteamAppId.None,
    tickrate: 60,
    autoFixup: true,
  },
};

export const supportedGameDirs = Object.keys(supportedGameMods);

const parser = SourceDemoParser.default();

export const getDemoInfo = async (filePath: string, options?: { isBoardDemo?: boolean }) => {
  const buffer = await Deno.readFile(filePath);

  try {
    const buf = parser.prepare(buffer.buffer);
    const demo = SourceDemo.default();

    try {
      demo.readHeader(buf);
    } catch (err) {
      logger.error('readHeader', filePath, err);
      return 'Corrupted demo.';
    }

    const isSillyP2SMRelease = demo.gameDirectory === 'Portal 2 Speedrun mod';

    const supportedGame = supportedGameMods[demo.gameDirectory!] ||
      (isSillyP2SMRelease ? supportedGameMods[GameMod.Portal2SpeedrunMod] : undefined);

    if (supportedGame === undefined) {
      return 'Game is not supported.';
    }

    try {
      demo.readMessages(buf);
    } catch (err) {
      logger.error('readMessages', filePath, err);
    }

    let fixupResult: Awaited<ReturnType<typeof autoFixupOldPortal2Demo>> = false;

    if (supportedGame.autoFixup && !options?.isBoardDemo) {
      fixupResult = await autoFixupOldPortal2Demo(
        demo,
        parser,
        buffer.buffer,
        filePath,
      );

      if (fixupResult === null || typeof fixupResult === 'string') {
        return fixupResult;
      }
    }

    let disableRenderSkipCoopVideos: boolean;

    try {
      demo.readPackets();
    } catch (err) {
      logger.error('readPackets', filePath, err);
    } finally {
      disableRenderSkipCoopVideos = isMultiplayer(demo) && !hasTransitionFadeout(demo);
    }

    // Fix playback time and negative non-synced ticks.
    try {
      demo
        .adjustTicks()
        .adjustRange(0, 0, supportedGame.tickrate);
    } catch (err) {
      logger.error('adjustTicks + adjustRange', filePath, err);
    }

    const playbackTime = demo.playbackTime ?? 0;

    if (playbackTime < AUTORENDER_MIN_PLAYBACK_TIME) {
      return 'Demo is too short.';
    }

    if (playbackTime > AUTORENDER_MAX_PLAYBACK_TIME) {
      return 'Demo is too long.';
    }

    const info = demo.findPacket(NetMessages.SvcServerInfo);
    if (!info?.mapName) {
      logger.error(
        `SvcServerInfo packet or map name not found in demo: ${filePath}`,
      );
      return 'Corrupted demo.';
    }

    try {
      demo.readStringTables();
    } catch (err) {
      logger.error('readStringTables', filePath, err);
    }

    const canTrustServerInfo = demo.gameDirectory === info.gameDir;
    console.log({ canTrustServerInfo });

    // TODO: More strict validation
    const isWorkshopMap = !options?.isBoardDemo && canTrustServerInfo && demo.mapName !== info.mapName;
    const fullMapName = canTrustServerInfo ? info.mapName.replaceAll('\\', '/') : demo.mapName;

    return {
      size: buffer.byteLength,
      mapName: demo.mapName,
      fullMapName,
      mapCrc: info.mapCrc,
      isWorkshopMap,
      workshopInfo: isWorkshopMap ? await getWorkshopInfo(supportedGame.workshopAppId, fullMapName!) : null,
      gameDir: isSillyP2SMRelease ? GameMod.Portal2SpeedrunMod : demo.gameDirectory,
      playbackTime: demo.playbackTime,
      useFixedDemo: fixupResult === true,
      disableRenderSkipCoopVideos,
      tickrate: demo.getTickrate(),
      metadata: getSarData(demo),
      ...getChallengeModeData(demo),
      ...getPlayerInfo(demo),
    };
  } catch (err) {
    logger.error(filePath, err);
    return null;
  }
};

const isMultiplayer = (demo: SourceDemo) => {
  return (demo.findPacket(NetMessages.SvcServerInfo)?.maxClients ?? 0) !== 0;
};

const hasTransitionFadeout = (demo: SourceDemo) => {
  return demo
    .findPackets(NetMessages.NetStringCmd)
    .some((packet) => packet.command?.startsWith('stop_transition_videos_fadeout '));
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
    demo.readDataTables();
  } catch (err) {
    logger.error('readDataTables', filePath, err);
  }

  try {
    const dt = demo.findMessage(Messages.DataTable)?.dataTable;
    if (!dt) {
      logger.error(`DataTable message not found in demo: ${filePath}`);
      return 'Corrupted demo.';
    }

    // Current fixup method does not work on these maps :>
    const mapsWhichUsePointSurvey = [
      'sp_a2_bts2',
      'sp_a2_bts3',
      'sp_a3_portal_intro',
      'sp_a2_core',
      'sp_a2_bts4',
    ];

    const pointCameraClasses = dt.serverClasses.filter((table) => table.className === 'CPointCamera');

    // Fixup not needed for already fixed demos.
    if (pointCameraClasses.length === 2) {
      if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
        return 'This demo has been corrupted by demofixup.\nSee [p2sr/demofixup#2](https://github.com/p2sr/demofixup/issues/2)';
      }

      return false;
    }

    const pointSurvey = dt.tables
      .findIndex((table) => table.netTableName === 'DT_PointSurvey');

    // Fixup not needed for new demos.
    if (pointSurvey === -1) {
      return false;
    }

    if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
      return 'This demo cannot be fixed.\nSee [p2sr/demofixup#2](https://github.com/p2sr/demofixup/issues/2)';
    }

    dt.tables.splice(pointSurvey, 1);

    const svc = dt.serverClasses.find((table) => table.dataTableName === 'DT_PointSurvey');

    if (!svc) {
      logger.error(`CPointCamera server class not found in demo: ${filePath}`);
      return 'Corrupted demo.';
    }

    svc.className = 'CPointCamera';
    svc.dataTableName = 'DT_PointCamera';

    demo.writeDataTables();

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
const extractSteamData = (
  playerInfo?: StringTables.StringTableEntry,
): [playerName: string | null, steamId: string | null] => {
  if (!playerInfo) {
    return [null, null];
  }

  const guid = playerInfo.data?.guid;
  if (guid === undefined || guid === 'STEAM_1:0:1' || guid === 'STEAM_1:1:1') {
    logger.error(`Found invalid player info guid "${guid}"`);
    return [null, null];
  }

  const [result, status] = getPlayerSteamData(playerInfo);

  switch (status) {
    case SteamIdResult.Ok: {
      return [result.playerName, result.steamId];
    }
    case SteamIdResult.NoPlayerInfoGuid: {
      logger.error(`No player player info guid found`);
      return [null, null];
    }
    case SteamIdResult.InvalidSteamId: {
      logger.error(`Found invalid SteamID: ${result}`);
      return [playerInfo.data?.name ?? null, null];
    }
    default: {
      return [null, null];
    }
  }
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

export const getInputData = (demo: SourceDemo): Uint32Array | null => {
  try {
    demo.detectGame()
      .adjustTicks()
      .adjustRange()
      .readUserCmds();

    const msgs = demo.findMessages<Messages.UserCmd>((msg) => {
      return msg instanceof DemoMessages.UserCmd &&
        msg.slot === 0 &&
        !!msg.userCmd?.buttons &&
        !!msg.tick;
    });

    // Tick  = bit  0..19 = 20 bits (more than enough for demo length)
    // Input = bit 20..31 = 12 bits (9 input types at the moment)
    const tickMask = 0b0000_0000_0000_1111_1111_1111_1111_1111;
    const buttonsOffset = 20;

    const inputs = new Uint32Array(msgs.length + 2);

    inputs[0] = 1; // Version

    let idx = 1;

    for (const { tick, userCmd } of msgs) {
      const buttons = userCmd!.buttons!;
      inputs[idx++] = (tick! & tickMask) |
        ((buttons & 0b0000_0000_0001) << buttonsOffset) | // attack
        ((buttons & 0b0000_0000_0010) << buttonsOffset) | // jump
        ((buttons & 0b0000_0000_0100) << buttonsOffset) | // duck
        ((buttons & 0b0000_0000_1000) << buttonsOffset) | // forward
        ((buttons & 0b0000_0001_0000) << buttonsOffset) | // back
        ((buttons & 0b0000_0010_0000) << buttonsOffset) | // use
        ((buttons & 0b0010_0000_0000) << buttonsOffset) | // moveleft
        ((buttons & 0b0100_0000_0000) << buttonsOffset) | // moveright
        ((buttons & 0b1000_0000_0000) << buttonsOffset); // attack2
    }

    // Write last tick for syncing
    inputs[idx] = demo.playbackTicks! & tickMask;

    return inputs;
  } catch (err) {
    logger.error(err);
  }

  return null;
};

// Imported from: https://github.com/NeKzor/sdp/blob/main/examples/tools/repair.ts
export const repairDemo = (buffer: ArrayBuffer): Uint8Array => {
  const parser = SourceDemoParser.default()
    .setOptions({ packets: true, dataTables: true });

  const demo = SourceDemo.default();

  try {
    const buf = parser.prepare(buffer);
    demo.readHeader(buf)
      .readMessages(buf);
  } catch (err) {
    console.error(err);
  }
  try {
    demo.readDataTables();
  } catch (err) {
    console.error(err);
  }
  try {
    demo.readPackets();
  } catch (err) {
    console.error(err);
  }

  const tryFixup = () => {
    const dt = demo.findMessage(Messages.DataTable)?.dataTable;
    if (!dt) {
      return;
    }

    const mapsWhichUsePointSurvey = [
      'sp_a2_bts2',
      'sp_a2_bts3',
      'sp_a3_portal_intro',
      'sp_a2_core',
      'sp_a2_bts4',
    ];

    const pointCameraClasses = dt.serverClasses.filter((table) => table.className === 'CPointCamera');
    if (pointCameraClasses.length === 2) {
      return;
    }

    const pointSurvey = dt.tables.findIndex((table) => table.netTableName === 'DT_PointSurvey');
    if (pointSurvey === -1) {
      return;
    }

    if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
      return;
    }

    dt.tables.splice(pointSurvey, 1);

    const svc = dt.serverClasses.find((table) => table.dataTableName === 'DT_PointSurvey');
    if (!svc) {
      return;
    }

    svc.className = 'CPointCamera';
    svc.dataTableName = 'DT_PointCamera';
  };

  tryFixup();

  let paused = false;
  let coop = false;
  let coopCmEndTick = -1;
  let didPopulateCustomCallbackMap = false;

  const didCoopChallengeModeFinish = (message: Messages.Message) => {
    // Start dropping messages on the next tick
    const drop = coopCmEndTick !== -1 && message.tick! > coopCmEndTick;
    return drop;
  };

  demo.messages = demo.messages!.filter((message) => {
    if (message instanceof Messages.Packet) {
      if (didCoopChallengeModeFinish(message)) {
        return false;
      }

      let pausePacketCount = 0;

      for (const packet of message.packets!) {
        if (packet instanceof NetMessages.SvcServerInfo) {
          coop = (packet.maxClients ?? 0) !== 0;
        } else if (packet instanceof NetMessages.SvcSetPause) {
          paused = packet.paused!;
          pausePacketCount += 1;
        } else if (
          coop &&
          packet instanceof NetMessages.SvcUserMessage &&
          packet.userMessage instanceof ScoreboardTempUpdate
        ) {
          coopCmEndTick = message.tick! + 60; // Add 1s delay
        }
      }

      // Drop the whole message during a pause but only if there aren't any other packets.
      const dropMessage = paused && (!pausePacketCount || message.packets!.length <= pausePacketCount);
      return !dropMessage;
    }

    if (
      message instanceof Messages.UserCmd ||
      message instanceof Messages.CustomData
    ) {
      if (!didPopulateCustomCallbackMap && message instanceof Messages.CustomData) {
        didPopulateCustomCallbackMap = message.unk === -1;

        if (!didPopulateCustomCallbackMap) {
          return false;
        }
      }

      if (didCoopChallengeModeFinish(message)) {
        return false;
      }

      return !paused;
    }

    if (message instanceof Messages.ConsoleCmd) {
      if (didCoopChallengeModeFinish(message)) {
        return false;
      }
    }

    return true;
  });

  const lastMessage = demo.messages!.at(-1);
  if (lastMessage && !(lastMessage instanceof Messages.Stop)) {
    demo.detectGame()
      .adjustTicks()
      .adjustRange();

    const stopMessage = new Messages.Stop(0x07)
      .setTick(lastMessage.tick!)
      .setSlot(lastMessage.slot!);

    stopMessage.restData = new SourceDemoBuffer(new ArrayBuffer(0));

    demo.messages![demo.messages!.length - 1] = stopMessage;
  }

  return parser
    .setOptions({ packets: false })
    .save(demo, buffer.byteLength);
};
