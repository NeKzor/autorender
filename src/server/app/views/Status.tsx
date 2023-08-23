/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { AccessToken, PendingStatus, User, Video } from '~/shared/models.ts';
import { AppStateContext } from '../AppState.ts';

type AccessTokenJoin = Pick<AccessToken, 'access_token_id' | 'token_name'> & {
  render_count: number;
} & Pick<User, 'username'>;

type VideoJoin = Pick<Video, 'share_id' | 'title' | 'created_at' | 'pending' | 'requested_by_name' | 'render_node'> & {
  requested_by_username: string | null;
  rendered_by_username: string | null;
};

type Data = {
  tokens: AccessTokenJoin[];
  videos: VideoJoin[];
};

export const meta: PageMeta<Data> = () => {
  return {
    title: 'Status',
  };
};

export const loader: DataLoader = async ({ context }) => {
  const tokens = await context.db.query<AccessTokenJoin>(
    `select access_tokens.access_token_id
          , access_tokens.token_name
          , (
            select count(1)
              from videos
             where videos.rendered_by_token = access_tokens.access_token_id
          ) as render_count
          , users.username
       from access_tokens
       join users
         on users.user_id = access_tokens.user_id
   order by access_tokens.created_at`,
  );

  const videos = await context.db.query<VideoJoin>(
    `select videos.share_id
          , videos.title
          , videos.created_at
          , videos.pending
          , videos.requested_by_name
          , videos.render_node
          , requester.username as requested_by_username
          , renderer.username as rendered_by_username
       from videos
       left join users requester
         on requester.discord_id = videos.requested_by_id
  left join users renderer
         on renderer.user_id = videos.rendered_by
      where pending <> ?
   order by videos.created_at`,
    [
      PendingStatus.FinishedRender,
    ],
  );

  return json<Data>({
    tokens,
    videos,
  });
};

const formatPendingStatus = (status: PendingStatus) => {
  switch (status) {
    case PendingStatus.FinishedRender:
      return 'Rendered';
    case PendingStatus.RequiresRender:
      return 'Queued';
    case PendingStatus.ClaimedRender:
      return 'Claimed';
    case PendingStatus.StartedRender:
      return 'Started';
    case PendingStatus.UploadingRender:
      return 'Uploading';
    default:
      return '-';
  }
};

export const Status = () => {
  const state = React.useContext(AppStateContext);
  const { tokens, videos } = useLoaderData<Data>();

  return (
    <div className={tw`sm:flex justify-center`}>
      <div className={tw`md:w-[75%] lg:w-[50%]`}>
        <h2 className={tw`text-2xl mb-6`}>
          Status
        </h2>
        <table className={tw`w-full text-sm text-left text-black dark:text-white`}>
          <thead
            className={tw`text-xs uppercase text-white bg-blue-700 dark:text-white`}
          >
            <tr>
              <th scope='col' className={tw`px-6 py-3`}>
                Render node
              </th>
              <th scope='col' className={tw`px-6 py-3`}>
                Status
              </th>
              <th scope='col' className={tw`px-6 py-3`}>
                Renders
              </th>
              <th scope='col' className={tw`px-6 py-3`}>
                Provider
              </th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              return (
                <tr className={tw`bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800`}>
                  <th
                    scope='row'
                    className={tw`px-6 py-4 break-all font-medium text-gray-900 dark:text-white`}
                  >
                    {token.token_name}
                  </th>
                  <td className={tw`px-6 py-4`}>
                    {state?.clients.includes(token.access_token_id) ? 'Connected' : 'Offline'}
                  </td>
                  <td className={tw`px-6 py-4`}>
                    {token.render_count}
                  </td>
                  <td className={tw`px-6 py-4`}>
                    <a
                      href={`/profile/${token.username}`}
                      className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                    >
                      {token.username}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h2 className={tw`text-2xl mt-12 mb-6`}>
          In Queue
        </h2>
        {videos.length === 0 && (
          <div>
            There are currently no videos in queue.
          </div>
        )}
        {videos.length !== 0 && (
          <table className={tw`w-full text-sm text-left text-black dark:text-white`}>
            <thead
              className={tw`text-xs uppercase text-white bg-blue-700 dark:text-white`}
            >
              <tr>
                <th scope='col' className={tw`px-6 py-3`}>
                  Title
                </th>
                <th scope='col' className={tw`px-6 py-3`}>
                  Status
                </th>
                <th scope='col' className={tw`px-6 py-3`}>
                  Requested by
                </th>
                <th scope='col' className={tw`px-6 py-3`}>
                  Requested at
                </th>
                <th scope='col' className={tw`px-6 py-3`}>
                  Render node
                </th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => {
                return (
                  <tr className={tw`bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800`}>
                    <th
                      scope='row'
                      className={tw`px-6 py-4 break-all font-medium text-gray-900 dark:text-white`}
                    >
                      <a
                        href={`/videos/${video.share_id}`}
                        className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                      >
                        {video.title}
                      </a>
                    </th>
                    <td className={tw`px-6 py-4`}>
                      {formatPendingStatus(video.pending)}
                    </td>
                    <td className={tw`px-6 py-4`}>
                      {video.requested_by_username
                        ? (
                          <a
                            className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                            href={`/profile/${video.requested_by_username}`}
                          >
                            {video.requested_by_username}
                          </a>
                        )
                        : <>{video.requested_by_name}</>}
                    </td>
                    <td className={tw`px-6 py-4`}>
                      {new Date(video.created_at).toLocaleDateString()}
                    </td>
                    <td className={tw`px-6 py-4`}>
                      {video.rendered_by_username !== null
                        ? (
                          <a
                            className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                            href={`/profile/${video.rendered_by_username}`}
                          >
                            {video.render_node}@{video.rendered_by_username}
                          </a>
                        )
                        : <>-</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
