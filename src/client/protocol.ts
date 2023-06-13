/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 * 
 * 
 * This defines the protocol between the server and the client.
 */

import { Video } from "../server/models.ts";

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
  Partial<Video>[]
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
