/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { join } from '@std/path';
import { User, Video } from '~/shared/models.ts';

export const Storage = {
  Demos: Deno.realPathSync(Deno.env.get('AUTORENDER_DEMOS_FOLDER')!),
  Inputs: Deno.realPathSync(Deno.env.get('AUTORENDER_DEMOS_INPUTS')!),
  Files: Deno.realPathSync(Deno.env.get('AUTORENDER_FILES_FOLDER')!),
  Videos: Deno.realPathSync(Deno.env.get('AUTORENDER_VIDEOS_FOLDER')!),
  Previews: Deno.realPathSync(Deno.env.get('AUTORENDER_PREVIEWS_FOLDER')!),
  Thumbnails: Deno.realPathSync(Deno.env.get('AUTORENDER_THUMBNAILS_FOLDER')!),
  Users: Deno.realPathSync(Deno.env.get('AUTORENDER_USERS_FOLDER')!),
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

export const getDemoFilePath = (video: Pick<Video, 'share_id'>) => join(Storage.Demos, `${video.share_id}.dem`);
export const getDemoInputsFilePath = (video: Pick<Video, 'share_id'>) => join(Storage.Inputs, `${video.share_id}.bin`);
export const getFixedDemoFilePath = (video: Pick<Video, 'share_id'>) =>
  join(Storage.Demos, `${video.share_id}_fixed.dem`);
export const getStorageFilePath = (filename: string) => join(Storage.Files, filename);
export const getVideoFilePath = (video: Pick<Video, 'share_id'>) => join(Storage.Videos, `${video.share_id}.mp4`);
export const getVideoDownloadFilename = (video: Pick<Video, 'title' | 'file_name'>) =>
  video.title === video.file_name ? `${video.file_name} Video.mp4` : `${video.title}.mp4`;
export const getVideoThumbnailPath = (video: Pick<Video, 'share_id'>) =>
  join(Storage.Thumbnails, `${video.share_id}.webp`);
export const getVideoThumbnailSmallPath = (video: Pick<Video, 'share_id'>) =>
  join(Storage.Thumbnails, `${video.share_id}_sm.webp`);
export const getVideoPreviewPath = (video: Pick<Video, 'share_id'>) => join(Storage.Previews, `${video.share_id}.webp`);
export const getUserPath = (user: Pick<User, 'discord_id'>) => join(Storage.Users, user.discord_id);
export const getUserAvatarPath = (user: Pick<User, 'discord_id'>) => join(Storage.Users, user.discord_id, 'avatar');
export const getUserBannerPath = (user: Pick<User, 'discord_id'>) => join(Storage.Users, user.discord_id, 'banner');

export const tryMakeDir = async (path: string) => {
  try {
    await Deno.mkdir(path, { recursive: true });
    // deno-lint-ignore no-empty
  } catch {
  }
};
