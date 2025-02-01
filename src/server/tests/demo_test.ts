/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { assert, assertEquals } from '@std/assert';
import { SourceDemoParser } from '@nekz/sdp';
import { getPlayerInfo } from '../demo.ts';

Deno.test('Correctly get player info of a coop demo', () => {
  const demo = SourceDemoParser.default()
    .setOptions({ stringTables: true })
    .parse(Deno.readFileSync('./tests/demos/coop.dem').buffer);

  const { steamId, partnerSteamId } = getPlayerInfo(demo);

  assert(steamId);
  assert(partnerSteamId);

  assertEquals(BigInt(steamId!), 76561198039230536n);
  assertEquals(BigInt(partnerSteamId!), 76561198045034733n);
});

Deno.test('Correctly get player info of a coop demo (host)', () => {
  const demo = SourceDemoParser.default()
    .setOptions({ stringTables: true })
    .parse(Deno.readFileSync('./tests/demos/coop_host.dem').buffer);

  const { steamId, partnerSteamId } = getPlayerInfo(demo);

  assert(steamId);
  assert(partnerSteamId);

  assertEquals(BigInt(steamId!), 76561198917972968n);
  assertEquals(BigInt(partnerSteamId!), 76561198823602829n);
});
