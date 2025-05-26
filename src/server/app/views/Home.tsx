/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { MapType, Video } from '~/shared/models.ts';
import { DataLoader, PageMeta, RequestContext, useLoaderData } from '../Routes.ts';
import { tw } from 'twind';
import { VideoCard } from '../components/VideoCard.tsx';
import type { Database } from '../../db.ts';
import { getSortableIdByRendered, SortableId } from '../utils.ts';

const MAX_VIDEOS_PER_REQUEST = 16;

type LatestVideo =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'rendered_at'
    | 'views'
    | 'requested_by_id'
    | 'video_preview_url'
    | 'thumbnail_url_small'
    | 'thumbnail_url_large'
    | 'video_length'
    | 'board_changelog_id'
    | 'board_source'
  >
  & {
    requested_by_username: string | null;
    requested_by_discord_avatar_url: string | null;
  };

type Filters = (typeof allowedFilters)[number][];

type Data = {
  latestVideos: LatestVideo[];
  filters: Filters;
};

export const meta: PageMeta<undefined> = () => {
  return {
    title: 'Home',
  };
};

const getVideos = async (db: Database, filters: Filters, sortableId?: SortableId) => {
  const sp = filters.includes('sp');
  const coop = filters.includes('coop');
  const workshop = filters.includes('workshop');
  const mapType = [] as MapType[];

  if (sp) mapType.push(workshop ? MapType.WorkshopSinglePlayer : MapType.SinglePlayer);
  if (coop) mapType.push(workshop ? MapType.WorkshopCooperative : MapType.Cooperative);
  if (workshop && !sp && !coop) mapType.push(MapType.WorkshopSinglePlayer, MapType.WorkshopCooperative);

  return await db.query<LatestVideo>(
    `select videos.share_id
          , videos.title
          , videos.rendered_at
          , videos.views
          , videos.requested_by_id
          , videos.video_preview_url
          , videos.thumbnail_url_small
          , videos.thumbnail_url_large
          , videos.video_length
          , videos.board_changelog_id
          , videos.board_source
          , requester.username as requested_by_username
          , requester.discord_avatar_url as requested_by_discord_avatar_url
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      ${mapType.length ? 'left join maps on maps.map_id = videos.map_id' : ''}
      where video_url is not null
        and deleted_at is null
            ${filters.includes('wr') ? 'and board_rank = 1' : ''}
            ${filters.includes('top10') ? 'and board_rank <= 10' : ''}
            ${mapType.length ? 'and maps.type in (' + mapType.join(',') + ')' : ''}
            ${sortableId ? 'and (videos.rendered_at < ? or (videos.rendered_at = ? and videos.share_id > ?))' : ''}
   order by rendered_at desc
          , share_id asc
      limit ${MAX_VIDEOS_PER_REQUEST}`,
    [
      ...(sortableId ? [sortableId.date, sortableId.date, sortableId.shareId] : []),
    ],
  );
};

const allowedFilters = [
  'all',
  'wr',
  'top10',
  'sp',
  'coop',
  'workshop',
] as const;

export const loader: DataLoader = async ({ context }) => {
  const filters = await getFilters(context.cookies);

  return {
    latestVideos: await getVideos(context.db, filters),
    filters,
  } satisfies Data;
};

export const Home = () => {
  const data = useLoaderData<Data>();

  return (
    <>
      {data !== null && (
        <>
          <div className={tw`ml-2 mb-2 flex gap-2 overflow-x-auto whitespace-nowrap`}>
            <button
              id='filter-all'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('all')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              ALL
            </button>
            <button
              id='filter-wr'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('wr')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              WR
            </button>
            <button
              id='filter-top10'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('top10')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              TOP 10
            </button>
            <button
              id='filter-sp'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('sp')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              SP
            </button>
            <button
              id='filter-coop'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('coop')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              COOP
            </button>
            <button
              id='filter-workshop'
              type='button'
              className={tw`text-gray-900 rounded-lg dark:text-white ${
                data.filters.includes('workshop')
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } focus:outline-none focus-visible:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2`}
            >
              WORKSHOP
            </button>
          </div>
          <div className={tw`flex justify-center`}>
            <div
              id='videos'
              className={tw`grid grid-cols gap-x-4 gap-y-8
                            sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5
                            sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`}
              x-last-video={getSortableIdByRendered(data.latestVideos.at(-1))}
            >
              {data.latestVideos.map((video) => <VideoCard video={video} />)}
            </div>
          </div>
          <div id='loading' className={tw`text-center mt-10 mb-10`}>
            <div role='status' className={tw`hidden`}>
              <svg
                aria-hidden='true'
                className={`inline w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600`}
                viewBox='0 0 100 101'
                fill='none'
                xmlns='http://www.w3.org/2000/svg'
              >
                <path
                  d='M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z'
                  fill='currentColor'
                />
                <path
                  d='M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z'
                  fill='currentFill'
                />
              </svg>
              <span className={`sr-only`}>Loading...</span>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export const loadMoreHome = async (
  db: RequestContext['db'],
  cookies: RequestContext['cookies'],
  sortableId: SortableId,
): Promise<[html: string, lastVideo: string | undefined]> => {
  const filters = await getFilters(cookies);
  const videos = await getVideos(db, filters, sortableId);

  return [
    renderToString(
      <>
        {videos.map((video) => <VideoCard video={video} />)}
      </>,
    ),
    getSortableIdByRendered(videos.at(-1)),
  ];
};

export const getFilters = async (cookies: RequestContext['cookies']): Promise<Filters> => {
  const filters = (await cookies.get('home-filter') ?? 'home').split('-').filter((filter) => {
    return allowedFilters.includes(filter as Filters['0']);
  });

  if (filters.includes('all')) {
    filters.length = 0;
  }

  if (filters.length === 0) {
    filters.push('all');
  }

  return filters as Filters;
};
