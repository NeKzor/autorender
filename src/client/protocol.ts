/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This defines the protocol between the server and the client.
 */

import { Video } from "../server/models.ts";

export type VideoPayload = Pick<Video, "video_id" | "file_url" | "full_map_name">;

export enum AutorenderDataType {
  Videos = "videos",
  Start = "start",
  Error = "error",
}

export type AutorenderMessage<T extends AutorenderDataType, P> = {
  type: T;
  data: P;
};

export type AutorenderMessageVideos = AutorenderMessage<
  AutorenderDataType.Videos,
  Pick<Video, "video_id">[]
>;

export type AutorenderMessageStart = AutorenderMessage<
  AutorenderDataType.Start,
  undefined
>;

export type AutorenderMessageError = AutorenderMessage<
  AutorenderDataType.Error,
  { status: number }
>;

export type AutorenderMessages =
  | AutorenderMessageVideos
  | AutorenderMessageStart
  | AutorenderMessageError;

export enum AutorenderSendDataType {
  Videos = "videos",
  Demo = "demo",
  Downloaded = "downloaded",
  Error = "error",
}

export type AutorenderSendMessage<T extends AutorenderSendDataType, P> = {
  type: T;
  data: P;
};

export type AutorenderSendMessageVideos = AutorenderSendMessage<
  AutorenderSendDataType.Videos,
  { game: string }
>;

export type AutorenderSendMessageDemo = AutorenderSendMessage<
  AutorenderSendDataType.Demo,
  { video_id: Video["video_id"] }
>;

export type AutorenderSendMessageDownloaded = AutorenderSendMessage<
  AutorenderSendDataType.Downloaded,
  { video_ids: Video["video_id"][] }
>;

export type AutorenderSendMessageError = AutorenderSendMessage<
  AutorenderSendDataType.Error,
  { video_id?: Video["video_id"]; message: string }
>;

export type AutorenderSendMessages =
  | AutorenderSendMessageVideos
  | AutorenderSendMessageDemo
  | AutorenderSendMessageDownloaded
  | AutorenderSendMessageError;
