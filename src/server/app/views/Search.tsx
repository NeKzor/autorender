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
import ShareModal from '../components/ShareModal.tsx';

type JoinedVideo =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'comment'
    | 'rendered_at'
    | 'views'
    | 'requested_by_id'
    | 'requested_by_name'
    | 'video_preview_url'
    | 'thumbnail_url_small'
    | 'thumbnail_url_large'
    | 'video_length'
  >
  & {
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
          , comment
          , rendered_at
          , views
          , requested_by_id
          , requested_by_name
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
      <ShareModal />
    </>
  );
};
