/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { NetMessages, SourceDemoParser } from "npm:@nekz/sdp";
import { SvcServerInfo } from "../../../../.cache/deno/npm/registry.npmjs.org/@nekz/sdp/0.1.0/esm/src/types/NetMessages.js";

export const getDemoInfo = async (buffer: ArrayBuffer) => {
  try {
    const demo = SourceDemoParser.default()
      .setOptions({ messages: true, packets: true })
      .parse(buffer)
      .adjustTicks()
      .adjustRange();

    const info = demo.findPacket(NetMessages.SvcServerInfo) as
      | SvcServerInfo
      | undefined;

    if (!info) {
      return null;
    }

    const isWorkshopMap = demo.mapName !== info.mapName;

    return {
      mapName: demo.mapName,
      fullMapName: info.mapName,
      mapCrc: info.mapCrc,
      isWorkshopMap,
      fileUrl: isWorkshopMap ? await resolveFileUrl(info.mapName) : null,
      gameDir: demo.gameDirectory,
      playbackTime: demo.playbackTime,
    };
  } catch (err) {
    console.error(err);
    return null;
  }
};

export const resolveFileUrl = async (mapName: string) => {
  // Example: workshop/271715738875416672/bhop_outdoors
  const [path, ugc, _name] = mapName.split("/");

  if (path === "workshop") {
    const res = await fetch(
      `http://127.0.0.1:8001/api/v1/workshop/620/files/ugc/${ugc}`,
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

// console.log(await getDemoInfo(Deno.readFileSync('./demos/1dac53aa9ed488f4a54775bf19714f8d98e6a108.dem')));

// console.log(
//   await getDemoInfo(Deno.readFileSync("./tests/demos/bhop-outdoors_9-7.dem")),
// );
