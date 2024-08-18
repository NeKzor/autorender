/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { RenderClient, ServerConfig } from '../protocol.ts';

export const Server = {
  config: {
    maxDemoFileSize: 0,
  } satisfies ServerConfig,
  clients: [] as RenderClient[],
};
