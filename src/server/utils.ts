/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { join } from 'path/mod.ts';
import { Video } from '~/shared/models.ts';

export const Storage = {
  Demos: Deno.realPathSync(Deno.env.get('AUTORENDER_DEMOS_FOLDER')!),
  Files: Deno.realPathSync(Deno.env.get('AUTORENDER_FILES_FOLDER')!),
  Videos: Deno.realPathSync(Deno.env.get('AUTORENDER_VIDEOS_FOLDER')!),
  Previews: Deno.realPathSync(Deno.env.get('AUTORENDER_PREVIEWS_FOLDER')!),
  Thumbnails: Deno.realPathSync(Deno.env.get('AUTORENDER_THUMBNAILS_FOLDER')!),
};

export const generateShareId = () => {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(8))))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
};

export const validateShareId = (shareId: string) => {
  return /^[0-9A-Za-z_-]{10}[048AEIMQUYcgkosw]$/.test(shareId);
};

export const getDemoFilePath = (videoId: string) => join(Storage.Demos, `${videoId}.dem`);
export const getFixedDemoFilePath = (videoId: string) => join(Storage.Demos, `${videoId}_fixed.dem`);
export const getStorageFilePath = (filename: string) => join(Storage.Files, filename);
export const getVideoFilePath = (videoId: string) => join(Storage.Videos, `${videoId}.mp4`);
export const getVideoDownloadFilename = (video: Pick<Video, 'title' | 'file_name'>) =>
  video.title === video.file_name ? `${video.file_name} Video.mp4` : `${video.title}.mp4`;
export const getVideoThumbnailPath = (video: Pick<Video, 'share_id'>) =>
  join(Storage.Thumbnails, `${video.share_id}.webp`);
export const getVideoThumbnailSmallPath = (video: Pick<Video, 'share_id'>) =>
  join(Storage.Thumbnails, `${video.share_id}_sm.webp`);
export const getVideoPreviewPath = (video: Pick<Video, 'share_id'>) => join(Storage.Previews, `${video.share_id}.webp`);
