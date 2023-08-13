/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { Temporal } from 'https://esm.sh/@js-temporal/polyfill@0.4.4';
import { Video } from '../../../shared/models.ts';
import { tw } from 'https://esm.sh/twind@0.16.16';

type VideoCardData =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'rendered_at'
    | 'views'
    | 'requested_by_id'
    | 'video_preview_url'
    | 'thumbnail_url_small'
    | 'video_length'
  >
  & {
    requested_by_discord_avatar_url: string | null;
  };

const toAgo = (date: string | null) => {
  if (!date) {
    return '';
  }

  const now = Temporal.Now.instant();
  const then = Temporal.Instant.from(date);
  const ago = then.until(now);

  const days = Math.floor(ago.seconds / 60 / 60 / 24);
  if (days) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(ago.seconds / 60 / 60);
  if (hours) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const minutes = Math.floor(ago.seconds / 60);
  if (minutes) {
    return `${minutes} minutes${minutes === 1 ? '' : 's'} ago`;
  }

  return `${ago.seconds} second${ago.seconds === 1 ? '' : 's'} ago`;
};

const formatVideoLength = (videoLength: number) => {
  const hours = Math.floor(videoLength / 60 / 60);
  const minutes = Math.floor(videoLength / 60) % 60;
  const seconds = videoLength % 60;
  return `${hours ? `${hours}:` : ''}${hours ? minutes.toString().padStart(2, '0') : minutes}:${
    seconds.toString().padStart(2, '0')
  }`;
};

const VideoLength = ({ videoLength }: { videoLength: number }) => {
  return (
    <span
      className={tw`absolute p-1 bottom-1 right-1 text-xs font-medium rounded text-white bg-gray-900 dark:bg-gray-900`}
    >
      {formatVideoLength(videoLength)}
    </span>
  );
};

export const VideoCard = ({ video }: { video: VideoCardData }) => {
  return (
    <div
      className={tw`p-4 border border-gray-200 rounded shadow bg-white dark:bg-gray-900 dark:text-white dark:border-gray-700`}
    >
      <a href={`/videos/${video.share_id}`}>
        <div
          className={tw`relative flex items-center justify-center h-48 mb-4${
            video.thumbnail_url_small ? '' : ' bg-gray-300 dark:bg-gray-700 rounded-[12px]'
          }`}
        >
          {video.thumbnail_url_small
            ? (
              <>
                <img
                  className={tw`transition-transform duration-300 transform object-cover w-full h-full rounded-[12px]`}
                  src={video.thumbnail_url_small}
                />
                {video.video_length !== null && <VideoLength videoLength={video.video_length} />}
                {video.video_preview_url && (
                  <img
                    className={tw`absolute top-0 left-0 opacity-0 transition-opacity duration-300 transform hover:opacity-100 object-cover w-full h-full rounded-[12px]`}
                    src={video.video_preview_url}
                  />
                )}
              </>
            )
            : (
              <>
                <svg
                  className={tw`w-10 h-10 text-gray-200 dark:text-gray-600`}
                  aria-hidden='true'
                  xmlns='http://www.w3.org/2000/svg'
                  fill='currentColor'
                  viewBox='0 0 16 20'
                >
                  <path d='M14.066 0H7v5a2 2 0 0 1-2 2H0v11a1.97 1.97 0 0 0 1.934 2h12.132A1.97 1.97 0 0 0 16 18V2a1.97 1.97 0 0 0-1.934-2ZM10.5 6a1.5 1.5 0 1 1 0 2.999A1.5 1.5 0 0 1 10.5 6Zm2.221 10.515a1 1 0 0 1-.858.485h-8a1 1 0 0 1-.9-1.43L5.6 10.039a.978.978 0 0 1 .936-.57 1 1 0 0 1 .9.632l1.181 2.981.541-1a.945.945 0 0 1 .883-.522 1 1 0 0 1 .879.529l1.832 3.438a1 1 0 0 1-.031.988Z' />
                  <path d='M5 5V.13a2.96 2.96 0 0 0-1.293.749L.879 3.707A2.98 2.98 0 0 0 .13 5H5Z' />
                </svg>
                {video.video_length !== null && <VideoLength videoLength={video.video_length} />}
              </>
            )}
        </div>
        <div className={tw`flex items-center space-x-3`}>
          <div>
            {video.requested_by_id
              ? (
                <img
                  className={tw`w-10 h-10 text-gray-200 dark:text-gray-700 rounded-full`}
                  src={video.requested_by_discord_avatar_url!}
                />
              )
              : (
                <svg
                  className={tw`w-10 h-10 text-gray-200 dark:text-gray-700`}
                  aria-hidden='true'
                  xmlns='http://www.w3.org/2000/svg'
                  fill='currentColor'
                  viewBox='0 0 20 20'
                >
                  <path d='M10 0a10 10 0 1 0 10 10A10.011 10.011 0 0 0 10 0Zm0 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm0 13a8.949 8.949 0 0 1-4.951-1.488A3.987 3.987 0 0 1 9 13h2a3.987 3.987 0 0 1 3.951 3.512A8.949 8.949 0 0 1 10 18Z' />
                </svg>
              )}
          </div>
          <div className={tw`flex-shrink items-center truncate`}>
            <div className={tw`text-sm font-bold`}>
              {video.title}
            </div>
            <div className={tw`h-2 mb-3 text-sm`}>
              {video.views} views | {toAgo(video.rendered_at)}
            </div>
          </div>
        </div>
      </a>
    </div>
  );
};
