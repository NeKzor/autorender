/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { Temporal } from '@js-temporal/polyfill';
import { Video } from '~/shared/models.ts';

type VideoRowData =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'comment'
    | 'rendered_at'
    | 'views'
    | 'requested_by_name'
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

export const VideoRow = ({ video }: { video: VideoRowData }) => {
  return (
    <div
      className={tw`w-full p-4 rounded shadow bg-white dark:bg-gray-900 dark:text-white`}
    >
      <div className={tw`rounded-xl shadow-sm overflow-hidden`}>
        <div className={tw`sm:flex`}>
          <div className={tw`sm:shrink-0`}>
            <a href={`/videos/${video.share_id}`}>
              <div
                className={tw`relative flex items-center justify-center h-48 min-w-[390px]${
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
                        className={tw`w-80 h-6 text-gray-800 dark:text-white`}
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='currentColor'
                        viewBox='0 0 14 16'
                      >
                        <path d='M0 .984v14.032a1 1 0 0 0 1.506.845l12.006-7.016a.974.974 0 0 0 0-1.69L1.506.139A1 1 0 0 0 0 .984Z' />
                      </svg>
                      {video.video_length !== null && <VideoLength videoLength={video.video_length} />}
                    </>
                  )}
              </div>
            </a>
          </div>
          <div className={tw`w-full lg:min-w-[400px]`}>
            <div className={tw`flex mt-4 sm:mt-0`}>
              <div className={tw`sm:ml-4 ml-0 flex-grow items-center`}>
                <a href={`/videos/${video.share_id}`}>
                  <div className={tw`font-bold`}>
                    <span className={tw`text-xl break-all`}>
                      {video.title}
                    </span>
                  </div>
                  <div className={tw`h-2 mb-4 mt-2 text-sm`}>
                    {video.views} views | {toAgo(video.rendered_at)}
                  </div>
                </a>
                <div className={tw`flex items-center`}>
                  {video.requested_by_discord_avatar_url
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
                  {video.requested_by_name && (
                    <div className={tw`pl-2`}>
                      {video.requested_by_name}
                    </div>
                  )}
                </div>
                {video.comment && (
                  <a href={`/videos/${video.share_id}`}>
                    <div className={tw`pt-2`}>
                      {video.comment}
                    </div>
                  </a>
                )}
              </div>
              <div className={tw`flex-shrink`}>
                <div className={tw`flex items-center justify-center`}>
                  <button
                    id={`video-menu-button-${video.share_id}`}
                    data-dropdown-toggle={`video-menu-dropdown-${video.share_id}`}
                    type='button'
                    className={tw`mx-2 hover:text-white focus:outline-none font-medium rounded-full text-sm p-2.5 text-center inline-flex items-center dark:border-gray-500 dark:text-gray-500 dark:hover:text-white dark:focus:ring-gray-800 dark:hover:bg-gray-500`}
                  >
                    <svg
                      className={tw`w-3 h-3 text-gray-800 dark:text-white`}
                      aria-hidden='true'
                      xmlns='http://www.w3.org/2000/svg'
                      fill='currentColor'
                      viewBox='0 0 4 15'
                    >
                      <path d='M3.5 1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 6.041a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 5.959a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z' />
                    </svg>
                  </button>
                  <div
                    id={`video-menu-dropdown-${video.share_id}`}
                    className={tw`z-10 hidden text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow w-44 dark:bg-gray-700`}
                  >
                    <ul className={tw`py-2`} aria-labelledby='video-menu-button'>
                      <li>
                        <div
                          data-modal-target='share-modal'
                          data-modal-toggle='share-modal'
                          id={`video-share-button-${video.share_id}`}
                          className={tw`video-share-button block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white cursor-pointer`}
                        >
                          Share
                        </div>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
