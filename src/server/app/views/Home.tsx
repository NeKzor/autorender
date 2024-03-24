/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Video } from '~/shared/models.ts';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { tw } from 'twind';
import { VideoCard } from '../components/VideoCard.tsx';

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
  >
  & {
    requested_by_username: string | null;
    requested_by_discord_avatar_url: string | null;
  };

type Data = {
  latestVideos: LatestVideo[];
};

export const meta: PageMeta<undefined> = () => {
  return {
    title: 'Home',
  };
};

export const loader: DataLoader = async ({ context }) => {
  const latestVideos = await context.db.query<LatestVideo>(
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
          , requester.username as requested_by_username
          , requester.discord_avatar_url as requested_by_discord_avatar_url
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where video_url is not null
   order by rendered_at desc
      limit 16`,
  );

  return json<Data>({
    latestVideos,
  });
};

export const Home = () => {
  const data = useLoaderData<Data>();

  return (
    <>
      {data !== null && (
        <>
          <div className={tw`flex justify-center`}>
            <div
              className={tw`grid grid-cols sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-4`}
            >
              {data.latestVideos.map((video) => <VideoCard video={video} />)}
            </div>
          </div>
        </>
      )}
    </>
  );
};
