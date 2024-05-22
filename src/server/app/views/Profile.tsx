/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { tw } from 'twind';
import { DataLoader, PageMeta, useLoaderData } from '../Routes.ts';
import { PendingStatus, User, Video } from '~/shared/models.ts';
import { VideoCard } from '../components/VideoCard.tsx';
import { AppStateContext } from '../AppState.ts';
import type { Database } from '../../db.ts';
import { getSortableIdByCreated, SortableId } from '../utils.ts';

const MAX_VIDEOS_PER_REQUEST = 16;

type JoinedVideo =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'created_at'
    | 'rendered_at'
    | 'views'
    | 'requested_by_id'
    | 'video_preview_url'
    | 'thumbnail_url_small'
    | 'thumbnail_url_large'
    | 'video_length'
    | 'board_changelog_id'
    | 'pending'
  >
  & {
    requested_by_username: string | null;
    requested_by_discord_avatar_url: string | null;
  };

type Data = {
  user: User | undefined;
  videos: JoinedVideo[];
  stats: {
    rendered_videos: number;
    total_views: number;
    provided_videos: number;
    renderer_rank: number;
    views_rank: number;
    provider_rank: number;
  };
};

export const meta: PageMeta<Data> = ({ data }) => {
  return {
    title: data.user?.username ?? 'Profile not found :(',
  };
};

const getVideos = async (
  db: Database,
  options: { discordUserId: string } | { discordUserName: string },
  sortableId?: SortableId,
) => {
  return await db.query<JoinedVideo>(
    `select share_id
          , title
          , videos.created_at
          , rendered_at
          , views
          , requested_by_id
          , video_preview_url
          , thumbnail_url_small
          , thumbnail_url_large
          , video_length
          , board_changelog_id
          , pending
          , requester.username as requested_by_username
          , requester.discord_avatar_url as requested_by_discord_avatar_url
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where ${'discordUserId' in options ? 'requested_by_id' : 'requester.username'} = ?
        and video_url is not null
        and deleted_at is null
        ${sortableId ? 'and (videos.created_at < ? or (videos.created_at = ? and videos.share_id > ?))' : ''}
   order by videos.created_at desc
          , videos.share_id asc
      limit ${MAX_VIDEOS_PER_REQUEST}`,
    [
      'discordUserId' in options ? options.discordUserId : options.discordUserName,
      ...(sortableId ? [sortableId.date, sortableId.date, sortableId.shareId] : []),
    ],
  );
};

export const loader: DataLoader = async ({ params, context }) => {
  const [user] = await context.db.query<User>(
    `select *
       from users
      where username = ?`,
    [params.username],
  );

  if (!user) {
    return {
      user,
      videos: [],
      stats: {
        rendered_videos: 0,
        total_views: 0,
        provided_videos: 0,
        renderer_rank: 0,
        views_rank: 0,
        provider_rank: 0,
      },
    } satisfies Data;
  }

  // TODO: Uploaded and non-deleted videos are common enough to create a view for this.

  const videos = await getVideos(context.db, { discordUserId: user.discord_id });

  const [totalViewsStat] = await context.db.query<{ rendered_videos: number; total_views: number }>(
    `select count(1) as rendered_videos
          , sum(views) total_views
       from videos
      where requested_by_id = ?
        and deleted_at is null`,
    [user.discord_id],
  );

  const [providedVideosStat] = await context.db.query<{ provided_videos: number }>(
    `select count(1) as provided_videos
       from videos
      where rendered_by = ?
        and video_url is not null
        and deleted_at is null`,
    [user.user_id],
  );

  // TODO: Also create ranking views for these statistics.

  const [rendererRankStat] = await context.db.query<{ renderer_rank: number }>(
    `select renderer_rank from (
      select requested_by_id
           , rank() over (order by count(1) desc) renderer_rank
        from (
          select requested_by_id
            from videos
           where video_url is not null
             and deleted_at is null
             and requested_by_id is not null
        ) t1
      group by requested_by_id
    ) t2
    where requested_by_id = ?`,
    [user.discord_id],
  );

  const [viewsRankStat] = await context.db.query<{ views_rank: number }>(
    `select views_rank from (
      select requested_by_id
           , rank() over (order by sum(views) desc) views_rank
        from (
          select requested_by_id
               , views
            from videos
           where video_url is not null
             and deleted_at is null
             and requested_by_id is not null
        ) t1
      group by requested_by_id
    ) t2
    where requested_by_id = ?`,
    [user.discord_id],
  );

  const [providerRankStat] = await context.db.query<{ provider_rank: number }>(
    `select provider_rank from (
      select rendered_by
           , rank() over (order by count(1) desc) provider_rank
        from (
          select rendered_by
            from videos
           where video_url is not null
             and deleted_at is null
             and rendered_by is not null
        ) t1
      group by rendered_by
    ) t2
    where rendered_by = ?`,
    [user.user_id],
  );

  return {
    user,
    videos,
    stats: {
      rendered_videos: totalViewsStat?.rendered_videos ?? 0,
      total_views: totalViewsStat?.total_views ?? 0,
      provided_videos: providedVideosStat?.provided_videos ?? 0,
      renderer_rank: rendererRankStat?.renderer_rank ?? 0,
      views_rank: viewsRankStat?.views_rank ?? 0,
      provider_rank: providerRankStat?.provider_rank ?? 0,
    },
  } satisfies Data;
};

const formatRank = (rank: number | undefined) => {
  return rank ? `${rank}${['st', 'nd', 'rd'][((rank + 90) % 100 - 10) % 10 - 1] || 'th'}` : 'n/a';
};

const getProfileColor = (user: Exclude<Data['user'], undefined>) => {
  return user.discord_accent_color !== null
    ? `bg-[#${user.discord_accent_color.toString(16).padStart(6, '0')}]`
    : 'bg-white dark:bg-gray-800';
};

export const Profile = () => {
  const state = React.useContext(AppStateContext);
  const { user, videos, stats } = useLoaderData<Data>();

  const renderedVideos = videos.filter(
    (video) => video.pending === PendingStatus.FinishedRender,
  );

  return (
    <div className={tw`flex justify-center`}>
      <div>
        {!user && 'Profile not found'}
        {user && (
          <div
            className={tw`grid grid-cols grid-cols-1 md:grid-cols-1 lg:grid-cols-1 xl:grid-cols-1 2xl:grid-cols-4 gap-y-4`}
          >
            {user.discord_banner && (
              <style
                nonce={state?.nonce}
                dangerouslySetInnerHTML={{
                  __html: `.profile-bg {
                  background: url('${user.discord_banner_url}?size=4096');
                  background-repeat: no-repeat;
                  background-size: cover;
                }`,
                }}
              >
              </style>
            )}
            {/* TODO: This shouldn't be rounded on all sides for 2xl but max-* does not work in twind */}
            <div
              className={tw`p-4 flex rounded profile-bg ${
                !user.discord_banner ? getProfileColor(user) : ''
              } dark:text-white col-span-1 justify-center items-center gap-2`}
            >
              <img
                className={tw`w-24 h-24 mt-3 rounded-full shadow-lg`}
                src={user.discord_avatar_url}
                alt='avatar'
              />
              <div className={tw`pl-3 pr-3 py-1 bg-white dark:bg-gray-900 rounded-full shadow-lg`}>
                <span className={tw`p-6 text-4xl font-medium`}>
                  {user.username}
                </span>
              </div>
            </div>
            <div
              className={tw`p-4 rounded bg-white dark:bg-gray-900 dark:text-white col-span-3`}
            >
              <div className={tw`flex flex-col`}>
                <div className={tw`border-gray-200 dark:border-gray-600`}>
                  <div>
                    <dl
                      className={tw`grid max-w-screen-xl grid-cols-2 gap-8 mx-auto text-gray-900 sm:grid-cols-3 xl:grid-cols-6 dark:text-white p-8`}
                    >
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {stats.rendered_videos}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Rendered Videos
                        </dd>
                      </div>
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {stats.total_views}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Total Views
                        </dd>
                      </div>
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {stats.provided_videos}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Provided Videos
                        </dd>
                      </div>
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {formatRank(stats.renderer_rank)}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Renderer Rank
                        </dd>
                      </div>
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {formatRank(stats.views_rank)}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Views Rank
                        </dd>
                      </div>
                      <div className={tw`flex flex-col items-center justify-center`}>
                        <dt className={tw`mb-2 text-3xl font-extrabold`}>
                          {formatRank(stats.provider_rank)}
                        </dt>
                        <dd className={tw`text-gray-500 dark:text-gray-400`}>
                          Provider Rank
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          className={tw`grid mt-4 grid-cols sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4`}
          x-last-video={getSortableIdByCreated(videos.at(-1))}
        >
          {renderedVideos.map((video) => <VideoCard video={video} />)}
        </div>
        <div id='loading' className={tw`text-center mt-10 mb-10`}>
          <div role='status'>
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
      </div>
    </div>
  );
};

export const loadMoreProfile = async (
  db: Database,
  sortableId: SortableId,
  discordUserName: string,
): Promise<[html: string, lastVideo: string | undefined]> => {
  const videos = await getVideos(db, { discordUserName }, sortableId);

  return [
    renderToString(
      <>
        {videos.map((video) => <VideoCard video={video} />)}
      </>,
    ),
    getSortableIdByCreated(videos.at(-1)),
  ];
};
