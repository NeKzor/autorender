/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { Video } from '~/shared/models.ts';
import { VideoRow } from '../components/VideoRow.tsx';

type JoinedVideo = Video & {
  requested_by_username: string | null;
  requested_by_discord_avatar_url: string | null;
};

type Data = {
  videos: JoinedVideo[];
};

export const meta: PageMeta<Data> = ({ data }) => {
  return {
    title: 'Search',
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  const query = context.url.searchParams.get('q');

  const videos = await context.db.query<JoinedVideo>(
    `select share_id
          , title
          , rendered_at
          , views
          , requested_by_id
          , video_preview_url
          , thumbnail_url_small
          , thumbnail_url_large
          , video_length
          , requester.username as requested_by_username
          , requester.discord_avatar_url as requested_by_discord_avatar_url
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where video_url is not null
        and deleted_at is null
        and title like ?
   order by videos.created_at desc
      limit 16`,
    [
      `%${query}%`,
    ],
  );

  return json<Data>({
    videos,
  });
};

export const Search = () => {
  const { videos } = useLoaderData<Data>();

  return (
    <>
      <div className={tw`lg:flex lg:justify-center md:w-full`}>
        <div>
          <div
            className={tw`grid grid-cols gap-4`}
          >
            {videos.length === 0 && (
              <span
                className={tw`text-center`}
              >
                No videos found.
              </span>
            )}
            {videos.map((video) => <VideoRow video={video} />)}
          </div>
        </div>
      </div>
      <div
        id='share-modal'
        tabIndex={-1}
        aria-hidden='true'
        className='hidden flex fixed top-0 left-0 right-0 z-50 w-full p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full'
      >
        <div className='relative w-full max-w-lg max-h-full'>
          <div className='relative bg-white rounded-lg shadow dark:bg-gray-700'>
            <button
              id='share-modal-close-button'
              type='button'
              className='absolute top-3 right-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white'
              data-modal-hide='share-modal'
            >
              <svg
                className='w-3 h-3'
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 14 14'
              >
                <path
                  stroke='currentColor'
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6'
                />
              </svg>
            </button>
            <div className='px-6 py-6 lg:px-8'>
              <div>
                <label className='block mb-2 text-sm font-medium text-gray-900 dark:text-white'>
                  Share
                </label>
                <input
                  type='text'
                  id='share-modal-input'
                  className='bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white'
                  readOnly
                />
                <div className={tw`flex items-center mt-2`}>
                  <div className={tw`flex items-center mr-4`}>
                    <input
                      id='share-modal-start-at-checkbox'
                      type='checkbox'
                      className={tw`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600`}
                    />
                    <label
                      htmlFor='share-modal-start-at-checkbox'
                      className={tw`ml-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                    >
                      Start at
                    </label>
                  </div>
                  <div>
                    <input
                      type='text'
                      id='share-modal-start-at-input'
                      className={tw`w-[70px] bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-600 dark:border-gray-500 dark:placeholder-gray-400 dark:text-white`}
                      value='0:00'
                      disabled
                    />
                  </div>
                </div>
              </div>
              <button
                id='share-modal-copy-button'
                data-tooltip-trigger='none'
                className='w-full mt-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800'
              >
                Copy
              </button>
              <div
                id='share-modal-copy-tooltip'
                role='tooltip'
                tabIndex={-1}
                className={tw`absolute z-10 inline-block px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm opacity-0 tooltip dark:bg-gray-800`}
              >
                Copied
                <div className={tw`tooltip-arrow`} data-popper-arrow></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
