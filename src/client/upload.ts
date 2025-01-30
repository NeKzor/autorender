/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread handles video uploads.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { logger } from './logger.ts';
import { ClientState } from './state.ts';
import { Video } from '~/shared/models.ts';
import { Config } from './config.ts';
import { VideoPayload } from './protocol.ts';
import { UserAgent } from './constants.ts';
import { realGameModFolder } from './utils.ts';

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
  { video_id: VideoPayload['video_id']; message: string }
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
        for (const { video_id, demo_game_dir } of data.videos) {
          try {
            const game = config.games.find((game) => game.mod === demo_game_dir)!;

            const videoFile = realGameModFolder(game, config.autorender['folder-name'], `${video_id}.mp4`);

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
                  'User-Agent': UserAgent,
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
                message: `${err}`,
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
