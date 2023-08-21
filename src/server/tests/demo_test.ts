/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { assert, assertEquals } from 'testing/asserts.ts';
import { SourceDemoParser } from '@nekz/sdp';
import { getPlayerInfo } from '../demo.ts';

Deno.test('Correctly get player info of a coop demo', () => {
  const demo = SourceDemoParser.default()
    .setOptions({ stringTables: true })
    .parse(Deno.readFileSync('./tests/demos/coop.dem'));

  const { steamId } = getPlayerInfo(demo);

  assert(steamId);
  assertEquals(76561198039230536n, BigInt(steamId!));
});

Deno.test('Correctly get player info of a coop demo (host)', () => {
  const demo = SourceDemoParser.default()
    .setOptions({ stringTables: true })
    .parse(Deno.readFileSync('./tests/demos/coop_host.dem'));

  const { steamId } = getPlayerInfo(demo);

  assert(steamId);
  assertEquals(76561198917972968n, BigInt(steamId!));
});
