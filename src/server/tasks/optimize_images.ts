/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { db } from '../db.ts';
import { Video } from '~/shared/models.ts';
import { installLogger, logger } from '../logger.ts';
import { getVideoFilePath, getVideoThumbnailPath, getVideoThumbnailSmallPath } from '../utils.ts';

const FFMPEG_PROCESS_TIMEOUT = 5 * 60 * 1_000;
const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;

installLogger('processing');

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  logger.error('unhandledrejection', { reason: ev.reason });
});

type VideoSelect = Pick<Video, 'video_id' | 'share_id' | 'created_at' | 'video_external_id'>;

const decoder = new TextDecoder();

const getVideoLength = async (video: VideoSelect) => {
  try {
    const args = [
      '-i',
      `${getVideoFilePath(video)}`,
      '-show_entries',
      'format=duration',
      '-v',
      'quiet',
      '-of',
      'default=noprint_wrappers=1',
    ];

    logger.info('ffprobe', args.join(' '));

    const command = new Deno.Command('ffprobe', { args, stdout: 'piped', stderr: 'piped' });
    const proc = command.spawn();
    const procTimeout = setTimeout(() => {
      try {
        proc.kill();
      } catch (err) {
        logger.error(err);
      }
    }, FFMPEG_PROCESS_TIMEOUT);

    const output = await proc.output();
    clearTimeout(procTimeout);

    const result = decoder.decode(output.stdout) ?? '';

    if (!output.success) {
      const error = decoder.decode(output.stderr) ?? '';
      logger.error(`Video length command error: ${output.code}\nResult:${result}\nError:${error}`);
      return null;
    }

    const videoLength = parseFloat(result.split('=').at(1) ?? '');
    return isNaN(videoLength) ? null : videoLength;
  } catch (err) {
    logger.error(err);
    return null;
  }
};

const getThumbnailUrl = async (video: VideoSelect, options: { videoLength: number; small?: boolean }) => {
  try {
    const args = [
      '-ss',
      Math.floor(options.videoLength / 2).toString(),
      '-i',
      getVideoFilePath(video),
      '-vcodec',
      'libwebp',
      '-lossless',
      '0',
      ...(options.small
        ? [
          '-quality',
          '90',
          '-s',
          '360x202',
        ]
        : []),
      '-vframes',
      '1',
      '-y',
      (options.small ? getVideoThumbnailSmallPath : getVideoThumbnailPath)(video),
    ];

    logger.info('ffmpeg', args.join(' '));

    const command = new Deno.Command('ffmpeg', { args, stdout: 'piped', stderr: 'piped' });
    const proc = command.spawn();
    const procTimeout = setTimeout(() => {
      try {
        proc.kill();
      } catch (err) {
        logger.error(err);
      }
    }, FFMPEG_PROCESS_TIMEOUT);

    const output = await proc.output();
    clearTimeout(procTimeout);

    const result = decoder.decode(output.stdout) ?? '';

    if (!output.success) {
      const error = decoder.decode(output.stderr) ?? '';
      logger.error(`Video thumbnail command error: ${output.code}\nResult:${result}\nError:${error}`);
      return null;
    }

    return `${AUTORENDER_PUBLIC_URI}/storage/thumbnails/${video.share_id}${options.small ? '/small' : ''}`;
  } catch (err) {
    logger.error(err);
    return null;
  }
};

const processVideos = async () => {
  const videos = await db.query<VideoSelect>(
    `select BIN_TO_UUID(video_id) as video_id
          , share_id
          , created_at
          , video_external_id
       from videos
      where processed = 1
        and video_length > 0
        and video_url is not null`,
  );

  if (videos.length) {
    logger.info(`Processing ${videos.length} new videos`);
  }

  for (const video of videos) {
    logger.info('Video', { video });

    const videoLength = await getVideoLength(video);
    const thumbnailSmallUrl = videoLength ? await getThumbnailUrl(video, { videoLength, small: true }) : null;

    logger.info('Updating video', video.video_id, {
      videoLength,
      thumbnailSmallUrl,
    });

    await db.execute(
      `update videos
          set processed = 1
            , thumbnail_url_small = ?
        where video_id = UUID_TO_BIN(?)`,
      [
        thumbnailSmallUrl,
        video.video_id,
      ],
    );
  }
};

try {
  await processVideos();
} catch (err) {
  logger.error(err);
}
