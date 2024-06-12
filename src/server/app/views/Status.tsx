/*
 * Copyright (c) 2023-2024, NeKz
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

type QueuedVideo =
  & Pick<Video, 'share_id' | 'title' | 'created_at' | 'pending' | 'requested_by_name' | 'render_node'>
  & {
    requested_by_username: string | null;
    rendered_by_username: string | null;
  };

type AutorenderVideo =
  & Pick<
    Video,
    'share_id' | 'title' | 'created_at' | 'pending' | 'render_node' | 'board_source_domain' | 'board_changelog_id'
  >
  & {
    rendered_by_username: string | null;
  };

type Data = {
  tokens: AccessTokenJoin[];
  queuedVideos: QueuedVideo[];
  failedAutorenderVideos: AutorenderVideo[];
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
               and videos.pending = ?
               and videos.video_url is not null
               and videos.deleted_at is null
          ) as render_count
          , users.username
       from access_tokens
       join users
         on users.user_id = access_tokens.user_id
      where access_tokens.access_token_id in (
            select distinct rendered_by_token
                       from videos
                      where TIMESTAMPDIFF(DAY, created_at, NOW()) <= 7
        )
   order by access_tokens.created_at`,
    [
      PendingStatus.FinishedRender,
    ],
  );

  const queuedVideos = await context.db.query<QueuedVideo>(
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

  const failedAutorenderVideos = await context.db.query<AutorenderVideo>(
    `select videos.share_id
          , videos.title
          , videos.created_at
          , videos.pending
          , videos.render_node
          , videos.board_source_domain
          , videos.board_changelog_id
          , renderer.username as rendered_by_username
       from videos
       left join users requester
         on requester.discord_id = videos.requested_by_id
  left join users renderer
         on renderer.user_id = videos.rendered_by
      where pending = ?
        and video_url is null
        and deleted_at is null
        and board_changelog_id is not null
        and rendered_by_token is not null
   order by videos.created_at`,
    [
      PendingStatus.FinishedRender,
    ],
  );

  return json<Data>({
    tokens,
    queuedVideos,
    failedAutorenderVideos,
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
  const { tokens, queuedVideos, failedAutorenderVideos } = useLoaderData<Data>();

  return (
    <div className={tw`lg:flex lg:justify-center`}>
      <div className={tw`lg:w-[75%]`}>
        <h2 className={tw`text-2xl mb-6`}>
          Status
        </h2>
        {tokens.length === 0 && (
          <div>
            No videos have been rendered in the last 7 days.
          </div>
        )}
        {tokens.length !== 0 && (
          <div className={tw`relative overflow-x-auto`}>
            <table className={tw`w-full text-sm text-left text-black dark:text-white`}>
              <thead
                className={tw`text-xs uppercase text-white bg-blue-700 dark:text-white`}
              >
                <tr>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
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
                  const clientState = state?.clientStates.get(token.access_token_id);

                  return (
                    <tr className={tw`bg-blue-50 border-gray-100 dark:bg-gray-800 dark:border-gray-800`}>
                      <th
                        scope='row'
                        className={tw`px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white`}
                      >
                        {(clientState?.games?.length ?? 0) === 0 && <span>{token.token_name}</span>}
                        {(clientState?.games?.length ?? 0) !== 0 && (
                          <>
                            <span
                              data-popover-target='token-name-popover'
                              data-popover-placement='left'
                              className={tw`cursor-help`}
                            >
                              {token.token_name}
                            </span>
                            <div
                              data-popover
                              id='token-name-popover'
                              role='tooltip'
                              className={tw`absolute z-10 invisible inline-block w-64 text-sm text-black transition-opacity duration-300 bg-gray-50 rounded-lg shadow-sm opacity-0 dark:text-white dark:bg-gray-700`}
                            >
                              <div className={tw`px-3 py-2`}>
                                Supported Games
                                <ul className={tw`max-w-md space-y-1 list-disc list-inside`}>
                                  {clientState!.games.map((game) => {
                                    return <li>{game}</li>;
                                  })}
                                </ul>
                                Render Qualities
                                <ul className={tw`max-w-md space-y-1 list-disc list-inside`}>
                                  {clientState!.renderQualities.map((game) => {
                                    return <li>{game}</li>;
                                  })}
                                </ul>
                              </div>
                              <div data-popper-arrow></div>
                            </div>
                          </>
                        )}
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
          </div>
        )}
        <h2 className={tw`text-2xl mt-12 mb-6`}>
          In Queue{queuedVideos.length ? ` (${queuedVideos.length})` : ''}
        </h2>
        {queuedVideos.length === 0 && (
          <div>
            There are currently no videos in queue.
          </div>
        )}
        {queuedVideos.length !== 0 && (
          <div className={tw`relative overflow-x-auto`}>
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
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Requested by
                  </th>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Requested at
                  </th>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Render node
                  </th>
                </tr>
              </thead>
              <tbody>
                {queuedVideos.map((video) => {
                  const createdAt = new Date(video.created_at);
                  return (
                    <tr className={tw`bg-blue-50 border-gray-100 dark:bg-gray-800 dark:border-gray-800`}>
                      <th
                        scope='row'
                        className={tw`px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white`}
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
                        <span title={createdAt.toLocaleTimeString()}>
                          {createdAt.toLocaleDateString()}
                        </span>
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
          </div>
        )}
        <h2 className={tw`text-2xl mt-12 mb-6`}>
          Failed Autorenders{failedAutorenderVideos.length ? ` (${failedAutorenderVideos.length})` : ''}
        </h2>
        {failedAutorenderVideos.length === 0 && (
          <div>
            All autorender videos have been uploaded.
          </div>
        )}
        {failedAutorenderVideos.length !== 0 && (
          <div className={tw`relative overflow-x-auto`}>
            <table className={tw`w-full text-sm text-left text-black dark:text-white`}>
              <thead
                className={tw`text-xs uppercase text-white bg-blue-700 dark:text-white`}
              >
                <tr>
                  <th scope='col' className={tw`px-6 py-3`}>
                    Title
                  </th>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Changelog ID
                  </th>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Submitted at
                  </th>
                  <th scope='col' className={tw`px-6 py-3 whitespace-nowrap`}>
                    Render node
                  </th>
                </tr>
              </thead>
              <tbody>
                {failedAutorenderVideos.map((video) => {
                  const createdAt = new Date(video.created_at);
                  return (
                    <tr className={tw`bg-blue-50 border-gray-100 dark:bg-gray-800 dark:border-gray-800`}>
                      <th
                        scope='row'
                        className={tw`px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-white`}
                      >
                        <a
                          href={`/videos/${video.share_id}`}
                          className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                        >
                          {video.title}
                        </a>
                      </th>
                      <td className={tw`px-6 py-4`}>
                        <a
                          className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                          href={`https://${video.board_source_domain}/changelog?id=${video.board_changelog_id}`}
                          target='_blank'
                        >
                          {video.board_changelog_id}
                        </a>
                      </td>
                      <td className={tw`px-6 py-4`}>
                        <span title={createdAt.toLocaleTimeString()}>
                          {createdAt.toLocaleDateString()}
                        </span>
                      </td>
                      <td className={tw`px-6 py-4`}>
                        {video.rendered_by_username !== null
                          ? (
                            <a
                              className={tw`whitespace-nowrap font-medium text-blue-600 dark:text-blue-400 hover:underline`}
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
          </div>
        )}
      </div>
    </div>
  );
};
