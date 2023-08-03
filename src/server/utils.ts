/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { join } from 'https://deno.land/std@0.190.0/path/mod.ts';
import { Video } from '../shared/models.ts';

export const Storage = {
  Demos: Deno.env.get('AUTORENDER_DEMOS_FOLDER')!,
  Files: Deno.env.get('AUTORENDER_FILES_FOLDER')!,
  Videos: Deno.env.get('AUTORENDER_VIDEOS_FOLDER')!,
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
