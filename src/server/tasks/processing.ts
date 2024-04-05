/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * Post processing of videos after they have been uploaded:
 *  - Extract video duration
 *  - Generate thumbnail
 *  - Generate preview
 *  - Delete local video file
 */

import 'dotenv/load.ts';
import { db } from '../db.ts';
import { PendingStatus, Video } from '~/shared/models.ts';
import { installLogger, logger } from '../logger.ts';
import { getVideoFilePath, getVideoPreviewPath, getVideoThumbnailPath, getVideoThumbnailSmallPath } from '../utils.ts';

const POST_PROCESS_UPDATE_INTERVAL = 60 * 1_000;
const FFMPEG_PROCESS_TIMEOUT = 5 * 60 * 1_000;
const MIN_SECONDS_FOR_VIDEO_PREVIEW = 8;
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
      `${getVideoFilePath(video.video_id)}`,
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

const getPreviewUrl = async (video: VideoSelect) => {
  try {
    const args = [
      '-ss',
      '00:00:02',
      '-to',
      '00:00:08',
      '-i',
      getVideoFilePath(video.video_id),
      '-vcodec',
      'libwebp',
      '-lossless',
      '0',
      '-loop',
      '0',
      '-vf',
      'setpts=0.72*PTS,fps=8',
      '-s',
      '320x180',
      '-y',
      getVideoPreviewPath(video),
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
      logger.error(`Video preview command error: ${output.code}\nResult:${result}\nError:${error}`);
      return null;
    }

    return `${AUTORENDER_PUBLIC_URI}/storage/previews/${video.share_id}`;
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
      getVideoFilePath(video.video_id),
      '-vcodec',
      'libwebp',
      '-lossless',
      '0',
      ...(options.small
        ? [
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
      where processed = 0
        and pending = ?
        and video_url is not null`,
    [
      PendingStatus.FinishedRender,
    ],
  );

  if (videos.length) {
    logger.info(`Processing ${videos.length} new videos`);
  }

  for (const video of videos) {
    logger.info('Video', { video });

    const videoLength = await getVideoLength(video);
    const previewUrl = videoLength && videoLength >= MIN_SECONDS_FOR_VIDEO_PREVIEW ? await getPreviewUrl(video) : null;
    const thumbnailUrl = videoLength ? await getThumbnailUrl(video, { videoLength }) : null;
    const thumbnailSmallUrl = videoLength ? await getThumbnailUrl(video, { videoLength, small: true }) : null;

    logger.info('Updating video', video.video_id, {
      videoLength,
      previewUrl,
      thumbnailUrl,
      thumbnailSmallUrl,
    });

    await db.execute(
      `update videos
          set processed = 1
            , video_length = ?
            , video_preview_url = ?
            , thumbnail_url_large = ?
            , thumbnail_url_small = ?
        where video_id = UUID_TO_BIN(?)`,
      [
        videoLength,
        previewUrl,
        thumbnailUrl,
        thumbnailSmallUrl,
        video.video_id,
      ],
    );

    if (video.video_external_id) {
      const filePath = getVideoFilePath(video.video_id);
      try {
        await Deno.remove(filePath);
      } catch (err) {
        logger.error('Failed to remove video file', filePath, ':', err);
      }
    }
  }
};

let isProcessing = false;

const update = async () => {
  if (isProcessing) {
    return;
  }

  try {
    isProcessing = true;
    await processVideos();
  } catch (err) {
    logger.error(err);
  } finally {
    isProcessing = false;
  }
};

setInterval(update, POST_PROCESS_UPDATE_INTERVAL);
