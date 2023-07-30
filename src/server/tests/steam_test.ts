/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { assert, assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
import { SourceDemoParser } from 'npm:@nekz/sdp';
import { SteamId } from '../steam.ts';
import { getPlayerInfo } from '../demo.ts';

Deno.test('Convert SteamID to SteamID64', () => {
  assertEquals(76561198095730281n, SteamId.from('STEAM_1:1:67732276').toSteamId64());
});

Deno.test('Parse SteamID64 from demo', () => {
  const demo = SourceDemoParser.default()
    .setOptions({ stringTables: true })
    .parse(Deno.readFileSync('./tests/demos/short.dem'));

  const { steamId } = getPlayerInfo(demo);

  assert(steamId);
  assertEquals(76561198049848090n, BigInt(steamId));
});