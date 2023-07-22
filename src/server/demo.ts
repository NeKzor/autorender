/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Messages, NetMessages, SourceDemo, SourceDemoParser } from 'npm:@nekz/sdp';
import { logger } from './logger.ts';
import { basename, dirname, join } from 'https://deno.land/std@0.190.0/path/mod.ts';

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

// TODO: Add support for more games
const supportedGameMods: { [key: string]: WorkshopSteamAppId } = {
  'portal2': WorkshopSteamAppId.Portal2,
  // "TWTM": WorkshopSteamAppId.ThinkingWithTimeMachine,
  // "aperturetag": WorkshopSteamAppId.ApertureTag,
  // "portal_stories": WorkshopSteamAppId.None,
  // "portalreloaded": WorkshopSteamAppId.PortalReloaded,
  // "p2ce": WorkshopSteamAppId.Portal2CommunityEdition,
};

export const getDemoInfo = async (filePath: string) => {
  const buffer = await Deno.readFile(filePath);

  try {
    const parser = SourceDemoParser.default()
      .setOptions({
        packets: true,
        dataTables: true,
      });

    const demo = parser
      .parse(buffer)
      .adjustTicks()
      .adjustRange();

    const supportedGame = supportedGameMods[demo.gameDirectory!];
    if (!supportedGame) {
      return 'Game is not supported.';
    }

    const playbackTime = demo.playbackTime ?? 0;

    if (playbackTime < AUTORENDER_MIN_PLAYBACK_TIME) {
      return 'Demo is too short.';
    }

    if (playbackTime > AUTORENDER_MAX_PLAYBACK_TIME) {
      return 'Demo is too long.';
    }

    let fixupResult: Awaited<ReturnType<typeof tryToFixOldPortal2Demos>> = false;

    if (demo.gameDirectory === 'portal2') {
      fixupResult = await tryToFixOldPortal2Demos(
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
    const isWorkshopMap = demo.mapName !== info.mapName;
    const fullMapName = info.mapName.replaceAll('\\', '/');

    return {
      size: buffer.byteLength,
      mapName: demo.mapName,
      fullMapName,
      mapCrc: info.mapCrc,
      isWorkshopMap,
      fileUrl: isWorkshopMap ? await resolveFileUrl(supportedGame, fullMapName) : null,
      gameDir: demo.gameDirectory,
      playbackTime: demo.playbackTime,
      useFixedDemo: fixupResult === true,
    };
  } catch (err) {
    logger.error(err);
    return null;
  }
};

// Example: workshop/271715738875416672/bhop_outdoors
export const resolveFileUrl = async (appId: WorkshopSteamAppId, mapName: string) => {
  const [path, ugc, name] = mapName.split('/', 3);

  if (path === 'workshop') {
    if (name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid map name found in demo: ${name}`);
    }

    if (appId === WorkshopSteamAppId.None) {
      throw new Error(`Found workshop map but app ID ${appId} is not supported.`);
    }

    const res = await fetch(
      `http://steampowered.com.mirror.nekz.me/api/v1/workshop/${appId}/files/ugc/${ugc}`,
      {
        headers: {
          'User-Agent': 'autorender-v1',
        },
      },
    );

    if (!res.ok) {
      throw new Error(`Request to mirror.nekz.me failed : ${res.status}`);
    }

    const item = await res.json();
    return item.file_url ?? null;
  }

  return null;
};

// Valve, please fix.
const tryToFixOldPortal2Demos = async (
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
