/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { PendingStatus, User, Video } from '~/shared/models.ts';
import { VideoCard } from '../components/VideoCard.tsx';

type JoinedVideo = Video & {
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

export const loader: DataLoader = async ({ params, context }) => {
  const [user] = await context.db.query<User>(
    `select *
       from users
      where username = ?`,
    [params.username],
  );

  if (!user) {
    return json<Data>({
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
    });
  }

  // TODO: Uploaded and non-deleted videos are common enough to create a view for this.

  const videos = await context.db.query<JoinedVideo>(
    `select *
          , BIN_TO_UUID(video_id) as video_id
          , requester.username as requested_by_username
          , requester.discord_avatar_url as requested_by_discord_avatar_url
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where requested_by_id = ?
        and video_url is not null
        and deleted_at is null
   order by videos.created_at desc
      limit 16`,
    [user.discord_id],
  );

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

  // TODO: Also create ranking views these statistics.

  const [rendererRankStat] = await context.db.query<{ renderer_rank: number }>(
    `select renderer_rank from (
      select requested_by_id
           , rank() over (order by count(1) desc) renderer_rank
        from (
          select *
            from videos
          where videos.video_url is not null
            and videos.deleted_at is null
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
          select *
            from videos
          where videos.video_url is not null
            and videos.deleted_at is null
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
          select *
            from videos
          where videos.video_url is not null
            and videos.deleted_at is null
        ) t1
      group by rendered_by
    ) t2
    where rendered_by = ?`,
    [user.user_id],
  );

  return json<Data>({
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
  });
};

const formatRank = (rank: number | undefined) => {
  return rank ? `${rank}${['st', 'nd', 'rd'][((rank + 90) % 100 - 10) % 10 - 1] || 'th'}` : 'n/a';
};

const getProfileColor = (user: Exclude<Data['user'], undefined>) => {
  return user.discord_accent_color !== null
    ? `bg-[#${user.discord_accent_color.toString(16).padStart(6, '0')}]`
    : 'dark:bg-gray-800';
};

export const Profile = () => {
  const { user, videos, stats } = useLoaderData<Data>();

  const renderedVideos = videos.filter(
    (video) => video.pending === PendingStatus.FinishedRender,
  );

  return (
    <div className={tw`flex justify-center`}>
      <div>
        {!user && 'Profile not found'}
        {user && (
          <div>
            <div
              className={tw`w-full bg-white border border-gray-200 rounded-lg shadow dark:bg-gray-900 dark:border-gray-700`}
            >
              <div
                className={tw`max-w ${getProfileColor(user)} rounded-t-lg rounded-t-lg shadow dark:border-gray-700`}
              >
                <div className={tw`flex flex-col items-center`}>
                  <img
                    className={tw`w-24 h-24 mt-3 mb-3 rounded-full shadow-lg`}
                    src={user.discord_avatar_url}
                    alt='avatar'
                  />
                  <div
                    className={tw`pl-2 pr-2 bg-white dark:bg-gray-900 mb-3 border border-gray-200 rounded-full shadow dark:border-gray-700`}
                  >
                    <div className={tw`flex flex-col items-center p-2`}>
                      <h5 className={tw`text-xl font-medium text-gray-900 dark:text-white`}>
                        {user.username}
                      </h5>
                    </div>
                  </div>
                </div>
              </div>
              <div className={tw`border-gray-200 dark:border-gray-600`}>
                <div className={tw`bg-white rounded-lg dark:bg-gray-900`}>
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
        )}
        <div
          className={tw`grid mt-4 grid-cols sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4`}
        >
          {renderedVideos.map((video) => <VideoCard video={video} />)}
        </div>
      </div>
    </div>
  );
};
