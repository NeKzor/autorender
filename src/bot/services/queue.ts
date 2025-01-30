/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

export interface InteractionCache {
  token: string;
  userId: bigint;
  timestamp: number;
}

export const Queue = {
  cache: new Map<string, InteractionCache>(),

  set(shareId: string, interaction: InteractionCache) {
    Queue.cache.set(shareId, interaction);
  },
  getAndDelete(shareId: string) {
    const interaction = Queue.cache.get(shareId);
    Queue.cache.delete(shareId);
    return interaction;
  },
  deleteOutdated() {
    const newCache = new Map<string, InteractionCache>();

    const now = new Date().getTime();
    const maxInteractionTime = 15 * 60 * 1_000;

    for (const [shareId, video] of Queue.cache) {
      if (video.timestamp + maxInteractionTime > now) {
        newCache.set(shareId, video);
      }
    }

    Queue.cache = newCache;
  },
};
