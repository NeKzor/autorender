/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.ts';

export interface RenderPreset {
  userId: bigint;
  name: string;
  options: string;
}

export const Presets = {
  async find(userId: bigint, name: string) {
    return (await db.get<RenderPreset>(['presets', userId, name])).value;
  },
  async update(preset: RenderPreset) {
    return await db.set(['presets', preset.userId, preset.name], preset);
  },
  async delete(preset: RenderPreset) {
    await db.delete(['presets', preset.userId, preset.name]);
  },
  async list(userId: bigint) {
    const result = [];
    for await (const item of db.list<RenderPreset>({ prefix: ['presets', userId] })) {
      result.push(item.value);
    }
    return result;
  },
};
