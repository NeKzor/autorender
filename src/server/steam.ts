/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * Utility class to convert SteamID to SteamID64.
 * See: https://developer.valvesoftware.com/wiki/SteamID
 */

export enum SteamIdUniverse {
  Individual = 0,
  Public = 1,
  Beta = 2,
  Internal = 3,
  Dev = 4,
  Rc = 5,
}

export enum SteamIdType {
  Invalid = 0,
  Individual = 1,
  Multiseat = 2,
  GameServer = 3,
  AnonGameServer = 4,
  Pending = 5,
  ContentServer = 6,
  Clan = 7,
  Chat = 8,
  P2PSuperSeeder = 9,
  AnonUser = 10,
}

export enum SteamIdInstance {
  All = 0,
  Desktop = 1,
  Console = 2,
  Web = 4,
}

export class SteamId {
  universe = BigInt(SteamIdUniverse.Public);
  type = BigInt(SteamIdType.Individual);
  instance = BigInt(SteamIdInstance.Desktop);
  account = 0n;
  isValid = false;

  constructor(props?: { account: bigint; universe: bigint; isValid: boolean }) {
    Object.assign(this, props);
  }

  static from(steamId: string) {
    const groups = steamId.match(/^STEAM\_([0-9]+)\:([0-9]+)\:([0-9]+)$/);
    if (groups) {
      const [x, y, z] = groups.slice(1).map((value) => BigInt(value));

      return new this({
        account: (z! << 1n) | y!,
        universe: x!,
        isValid: true,
      });
    }

    return new this();
  }

  toSteamId64() {
    return this.isValid ? (this.universe << 56n) | (this.type << 52n) | (this.instance << 32n) | this.account : null;
  }
}
