/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread handles video uploads.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { join } from "https://deno.land/std@0.190.0/path/mod.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";
import { logger } from "./logger.ts";
import { ClientState } from "./state.ts";
import { Video } from "../server/models.ts";

const GAME_DIR = Deno.env.get("GAME_DIR")!;
const GAME_MOD = Deno.env.get("GAME_MOD")!;
const GAME_MOD_PATH = join(GAME_DIR, GAME_MOD);

const AUTORENDER_FOLDER_NAME = Deno.env.get("AUTORENDER_FOLDER_NAME")!;
const AUTORENDER_DIR = join(GAME_MOD_PATH, AUTORENDER_FOLDER_NAME);
const AUTORENDER_BASE_API = Deno.env.get("AUTORENDER_BASE_API")!;
const AUTORENDER_MAX_VIDEO_FILE_SIZE = 150_000_000;

export enum UploadWorkerDataType {
  Upload = "upload",
}

export type UploadWorkerMessage<T extends UploadWorkerDataType, P> = {
  type: T;
  data: P;
};

export type UploadWorkerMessageUpload = UploadWorkerMessage<
  UploadWorkerDataType.Upload,
  { videos: ClientState["videos"] }
>;
export type UploadWorkerMessages = UploadWorkerMessageUpload;

self.addEventListener(
  "message",
  async (message: MessageEvent<UploadWorkerMessages>) => {
    const { type, data } = message.data;

    switch (type) {
      case UploadWorkerDataType.Upload: {
        for (const { video_id } of data.videos) {
          try {
            const videoFile = join(AUTORENDER_DIR, `${video_id}.dem.mp4`);
            const stat = await Deno.stat(videoFile);
            if (stat.size > AUTORENDER_MAX_VIDEO_FILE_SIZE) {
              throw new Error(`Video file ${videoFile} is too big.`);
            }

            // NOTE: We have to reorder the file before something else, thanks to this wonderful bug in oak.
            //       https://github.com/oakserver/oak/issues/581

            const body = new FormData();

            body.append(
              "files",
              new Blob([await Deno.readFile(videoFile)], { type: "video/mp4" }),
            );

            body.append("video_id", video_id);

            const response = await fetch(
              `${AUTORENDER_BASE_API}/api/v1/videos/upload`,
              {
                method: "POST",
                headers: {
                  "User-Agent": "autorender-client v1.0",
                  Authorization: `Bearer ${
                    encodeURIComponent(Deno.env.get("AUTORENDER_API_KEY")!)
                  }`,
                },
                body,
              },
            );

            if (!response.ok) {
              throw new Error(`Failed to render video: ${response.status}`);
            }

            const video = await response.json() as Pick<Video, "video_id">;
            logger.info("Uploaded video", video);
          } catch (err) {
            logger.error(err);

            self.postMessage({
              type: "error",
              data: {
                video_id,
                error: err.toString(),
              },
            });
          }
        }
        break;
      }
      default:
        logger.error(`Unhandled upload type: ${message.data.type}`);
        break;
    }
  },
);
