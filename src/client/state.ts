/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { AutorenderSendMessages, VideoPayload } from './protocol.ts';

export enum ClientStatus {
  Idle = 0,
  Rendering = 1,
}

export interface ClientState {
  toDownload: number;
  videos: VideoPayload[];
  status: ClientStatus;
  payloads: (Uint8Array | AutorenderSendMessages)[];
}
