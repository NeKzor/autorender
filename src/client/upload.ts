/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread handles video uploads.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { join } from 'https://deno.land/std@0.190.0/path/mod.ts';
import { logger } from './logger.ts';
import { ClientState } from './state.ts';
import { Video } from '../server/models.ts';
import { Config } from './config.ts';
import { VideoPayload } from './protocol.ts';

const AUTORENDER_MAX_VIDEO_FILE_SIZE = 150_000_000;

export enum UploadWorkerDataType {
  Config = 'config',
  Upload = 'upload',
  Error = 'error',
}

export type UploadWorkerMessage<T extends UploadWorkerDataType, P> = {
  type: T;
  data: P;
};

export type UploadWorkerMessageConfig = UploadWorkerMessage<
  UploadWorkerDataType.Config,
  { config: Config }
>;

export type UploadWorkerMessageUpload = UploadWorkerMessage<
  UploadWorkerDataType.Upload,
  { videos: ClientState['videos'] }
>;

export type UploadWorkerMessageError = UploadWorkerMessage<
  UploadWorkerDataType.Error,
  { video_id: VideoPayload['video_id']; error: string }
>;

export type UploadWorkerMessages =
  | UploadWorkerMessageConfig
  | UploadWorkerMessageUpload
  | UploadWorkerMessageError;

const config = {} as Config;

self.addEventListener(
  'message',
  async (message: MessageEvent<UploadWorkerMessages>) => {
    const { type, data } = message.data;

    switch (type) {
      case UploadWorkerDataType.Config: {
        Object.assign(config, data.config);
        break;
      }
      case UploadWorkerDataType.Upload: {
        for (const { video_id } of data.videos) {
          try {
            const videoFile = join(
              config.games.at(0)!.dir,
              config.games.at(0)!.mod,
              config.autorender['folder-name'],
              `${video_id}.dem.mp4`,
            );

            const stat = await Deno.stat(videoFile);
            if (stat.size > AUTORENDER_MAX_VIDEO_FILE_SIZE) {
              throw new Error(`Video file ${videoFile} is too big.`);
            }

            // NOTE: We have to reorder the file before something else, thanks to this wonderful bug in oak.
            //       https://github.com/oakserver/oak/issues/581

            const body = new FormData();

            body.append(
              'files',
              new Blob([await Deno.readFile(videoFile)], { type: 'video/mp4' }),
            );

            body.append('video_id', video_id);

            const response = await fetch(
              `${config.autorender['base-api']}/api/v1/videos/upload`,
              {
                method: 'POST',
                headers: {
                  'User-Agent': 'autorender-client v1.0',
                  Authorization: `Bearer ${encodeURIComponent(config.autorender['access-token'])}`,
                },
                body,
              },
            );

            if (!response.ok) {
              throw new Error(`Failed to render video: ${response.status}`);
            }

            const video = await response.json() as Pick<Video, 'video_id'>;
            logger.info('Uploaded video', video);
          } catch (err) {
            logger.error(err);

            self.postMessage({
              type: UploadWorkerDataType.Error,
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
        logger.error(`Unhandled upload type: ${type}`);
        break;
    }
  },
);
