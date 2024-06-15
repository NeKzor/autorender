/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

export interface Video {
  videoLibraryId: number;
  guid: string;
  title: string;
  dateUploaded: string;
  views: number;
  isPublic: boolean;
  length: number;
  status: number;
  framerate: number;
  rotation: null;
  width: number;
  height: number;
  availableResolutions: null;
  thumbnailCount: number;
  encodeProgress: number;
  storageSize: number;
  captions: unknown[];
  hasMP4Fallback: boolean;
  collectionId: string;
  thumbnailFileName: string;
  averageWatchTime: number;
  totalWatchTime: number;
  category: string;
  chapters: unknown[];
  moments: unknown[];
  metaTags: unknown[];
  transcodingMessages: unknown[];
}

export interface VideoUpload {
  success: boolean;
  message: string;
  statusCode: number;
}

export class BunnyClient {
  constructor(public userAgent: string) {}

  async createVideo(options: { accessKey: string; libraryId: number; title: string }): Promise<Video> {
    const url = `https://video.bunnycdn.com/library/${options.libraryId}/videos`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        AccessKey: options.accessKey,
      },
      body: JSON.stringify({ title: options.title }),
    });

    if (!res.ok) {
      throw new Error(`[POST] ${url} : ${res.statusText}`);
    }

    return await res.json();
  }

  async uploadVideo(
    options: { accessKey: string; libraryId: number; videoId: string; filePath: string },
  ): Promise<VideoUpload> {
    const url = `https://video.bunnycdn.com/library/${options.libraryId}/videos/${options.videoId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        AccessKey: options.accessKey,
      },
      body: (await Deno.open(options.filePath)).readable,
    });

    if (!res.ok) {
      throw new Error(`[PUT] ${url} : ${res.statusText}`);
    }

    return await res.json();
  }

  async getVideo(
    options: { accessKey: string; libraryId: number; videoId: string },
  ): Promise<Video> {
    const url = `https://video.bunnycdn.com/library/${options.libraryId}/videos/${options.videoId}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        AccessKey: options.accessKey,
      },
    });

    if (!res.ok) {
      throw new Error(`[GET] ${url} : ${res.statusText}`);
    }

    return await res.json();
  }

  getIframeEmbedUrl(video: Video): string {
    return `https://iframe.mediadelivery.net/embed/${video.videoLibraryId}/${video.guid}`;
  }
  getOriginalFileUrl(pullZone: string, video: Video): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/original`;
  }
  getHlsPlaylistUrl(pullZone: string, video: Video): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/playlist.m3u8`;
  }
  getThumbnailUrl(pullZone: string, video: Video): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/${video.thumbnailFileName}`;
  }
  getPreviewAnimationUrl(pullZone: string, video: Video): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/preview.webp`;
  }
  getMp4VideoUrl(pullZone: string, video: Video, resolutionHeight: string): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/play_${resolutionHeight}p.mp4`;
  }
  getSubtitleFileUrl(pullZone: string, video: Video, languageCode: string): string {
    return `https://${pullZone}.b-cdn.net/${video.guid}/captions/${languageCode}.vtt`;
  }
}
