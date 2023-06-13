/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * 
 * This defines the protocol between the server and the bot.
 */

export enum BotDataType {
  Upload = "upload",
  Error = "error",
}

export interface VideoUpload {
  video_id: number;
  title: string | null;
  requested_by_id: string;
}

export interface ErrorStatus {
  status: number;
  message: string;
  requested_by_id: string;
}

export type BotMessage<T extends BotDataType, P> = {
  type: T;
  data: P;
};

export type BotMessageUpload = BotMessage<BotDataType.Upload, VideoUpload>;
export type BotMessageError = BotMessage<BotDataType.Error, ErrorStatus>;
export type BotMessages = BotMessageUpload | BotMessageError;
