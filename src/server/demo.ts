/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

// TODO: Fix exports in sdp
import { DemoMessages, NetMessages, SourceDemoParser } from "npm:@nekz/sdp";
import { DataTable } from "npm:@nekz/sdp/messages";
import { logger } from "./logger.ts";

const AUTORENDER_MIN_PLAYBACK_TIME = 1;
const AUTORENDER_MAX_PLAYBACK_TIME = 6 * 60;

export const getDemoInfo = async (buffer: ArrayBuffer) => {
  try {
    const demo = SourceDemoParser.default()
      .setOptions({ messages: true, packets: true, dataTables: true })
      .parse(buffer)
      .adjustTicks()
      .adjustRange();

    const playbackTime = demo.playbackTime ?? 0;
    if (
      playbackTime < AUTORENDER_MIN_PLAYBACK_TIME ||
      playbackTime > AUTORENDER_MAX_PLAYBACK_TIME
    ) {
      return "Demo is too long.";
    }

    // TODO: Detect if this is the latest version of Portal 2
    const dt = demo.findMessage<DataTable>(DemoMessages.DataTable).dataTable;

    // Thank you Valve for the amazing backwards compatibility!
    if (
      // deno-lint-ignore no-explicit-any
      dt.tables.find((table: any) => table.netTableName === "DT_PointSurvey") ||
      // deno-lint-ignore no-explicit-any
      dt.serverClasses.find((svc: any) =>
        svc.dataTableName === "DT_PointSurvey"
      )
    ) {
      return "Demo is too old.";
    }

    // deno-lint-ignore no-explicit-any
    const info = demo.findPacket(NetMessages.SvcServerInfo) as any;

    if (!info) {
      return null;
    }

    const isWorkshopMap = demo.mapName !== info.mapName;
    const fullMapName = info.mapName.replaceAll("\\", "/");

    return {
      size: buffer.byteLength,
      mapName: demo.mapName,
      fullMapName,
      mapCrc: info.mapCrc,
      isWorkshopMap,
      fileUrl: isWorkshopMap ? await resolveFileUrl(fullMapName) : null,
      gameDir: demo.gameDirectory,
      playbackTime: demo.playbackTime,
    };
  } catch (err) {
    logger.error(err);
    return null;
  }
};

// Example: workshop/271715738875416672/bhop_outdoors
export const resolveFileUrl = async (mapName: string) => {
  const [path, ugc, name] = mapName.split("/", 3);

  if (path === "workshop") {
    if (name.includes("/") || name.includes("\\")) {
      throw new Error(`Invalid map name found in demo: ${name}`);
    }

    const res = await fetch(
      `http://steampowered.com.mirror.nekz.me/api/v1/workshop/620/files/ugc/${ugc}`,
      {
        headers: {
          "User-Agent": "autorender-v1",
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
