/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { NetMessages, SourceDemoParser } from "npm:@nekz/sdp";
import { logger } from "./logger.ts";

export const getDemoInfo = async (buffer: ArrayBuffer) => {
  try {
    const demo = SourceDemoParser.default()
      .setOptions({ messages: true, packets: true })
      .parse(buffer)
      .adjustTicks()
      .adjustRange();

    // TODO: fix exports in sdp
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
