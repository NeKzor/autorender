/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { BoardSource, Video } from '~/shared/models.ts';
import { validateShareId } from '../utils.ts';

export const toAgo = (date: Date | null) => {
  if (!date) {
    return '';
  }

  const now = Temporal.Now.instant();
  const then = date.toTemporalInstant();
  const ago = then.until(now);

  const days = Math.floor(ago.seconds / 60 / 60 / 24);
  if (days) {
    if (days >= 365) {
      const years = Math.floor(days / 365);
      return `${years} year${years === 1 ? '' : 's'} ago`;
    }

    if (days >= 31) {
      const months = Math.floor(days / 31);
      return `${months} month${months === 1 ? '' : 's'} ago`;
    }

    if (days >= 14) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }

    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(ago.seconds / 60 / 60);
  if (hours) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const minutes = Math.floor(ago.seconds / 60);
  if (minutes) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  return `${ago.seconds} second${ago.seconds === 1 ? '' : 's'} ago`;
};

export const getSortableIdByCreated = (
  video?: {
    created_at: Video['created_at'];
    share_id: Video['share_id'];
    views: Video['views'];
  },
) => {
  return video ? btoa(`${video.share_id},${video.created_at.toISOString()},${video.views}`) : undefined;
};

export const getSortableIdByRendered = (
  video?: {
    rendered_at: Video['rendered_at'];
    share_id: Video['share_id'];
    views: Video['views'];
  },
) => {
  return video ? btoa(`${video.share_id},${video.rendered_at.toISOString()},${video.views}`) : undefined;
};

export type SortableId = {
  shareId: string;
  date: string;
  views: string;
};

export const parseSortableId = (id: string): SortableId | false => {
  try {
    const [shareId, date, views] = atob(id).split(',');

    if (
      shareId === undefined || !validateShareId(shareId) ||
      date === undefined || isNaN(Number(new Date(date))) ||
      views === undefined || isNaN(Number(views))
    ) {
      return false;
    }

    return { shareId, date, views };
  } catch {
    return false;
  }
};

export const getAutorenderAvatar = (source: BoardSource) => {
  switch (source) {
    case BoardSource.Mel:
      return 'mel_avatar.webp';
    default:
      return 'autorender_avatar.webp';
  }
};

export const getDemoDownloadLink = (video: Pick<Video, 'board_source_domain' | 'board_changelog_id' | 'share_id'>) => {
  return video.board_source_domain
    ? `https://${video.board_source_domain}/getDemo?id=${video.board_changelog_id}`
    : `/storage/demos/${video.share_id}`;
};
