/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This defines the protocol between the server and the bot.
 */

import { RenderQuality, Video } from '~/shared/models.ts';

export enum BotDataType {
  Upload = 'upload',
  Error = 'error',
  Config = 'config',
  Clients = 'clients',
}

export type VideoUpload = Pick<
  Video,
  | 'share_id'
  | 'title'
  | 'requested_by_id'
  | 'requested_in_guild_id'
  | 'requested_in_channel_id'
>;

export interface ErrorStatus {
  status: number;
  message: string;
  share_id: string;
  requested_by_id: string;
  requested_in_guild_id: string;
  requested_in_channel_id: string;
}

export interface ServerConfig {
  maxDemoFileSize: number;
}

export interface RenderClient {
  clientId: number;
  name: string;
  username: string;
  maxRenderQuality: RenderQuality;
}

export type BotMessage<T extends BotDataType, P> = {
  type: T;
  data: P;
};

export type BotMessageUpload = BotMessage<BotDataType.Upload, VideoUpload>;
export type BotMessageError = BotMessage<BotDataType.Error, ErrorStatus>;
export type BotMessageConfig = BotMessage<BotDataType.Config, ServerConfig>;
export type BotMessageClients = BotMessage<BotDataType.Clients, RenderClient[]>;
export type BotMessages = BotMessageUpload | BotMessageError | BotMessageConfig | BotMessageClients;

export enum WorkerDataType {
  Clients = 'clients',
}

export type WorkerMessage<T extends WorkerDataType, P> = {
  type: T;
  data: P;
};

export type WorkerMessageClients = WorkerMessage<WorkerDataType.Clients, undefined>;

export type WorkerMessages = WorkerMessageClients;
