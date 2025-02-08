/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, notFound, PageMeta, redirect, useLoaderData } from '../Routes.ts';
import {
  FixedDemoStatus,
  MapModel,
  MapType,
  PendingStatus,
  RenderQuality,
  UserPermissions,
  Video,
} from '~/shared/models.ts';
import { DemoMetadata, SarDataTimestamp } from '../../demo.ts';
import DeleteModal from '../components/DeleteModal.tsx';
import RerenderModal from '../components/RerenderModal.tsx';
import ShareModal from '../components/ShareModal.tsx';
import { AppStateContext } from '../AppState.ts';
import { NotFound } from './NotFound.tsx';
import { getDemoDownloadLink } from '../utils.ts';

type JoinedVideo = Video & {
  requested_by_username: string | null;
  rendered_by_username: string | null;
} & Pick<MapModel, 'alias' | 'best_time_id' | 'workshop_file_id' | 'type'>;

type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = ({ data, context }) => {
  const isQueueRoute = context.url.pathname.startsWith('/queue');

  return {
    title: data?.title,
    description: data?.comment,
    'og:title': data?.title,
    'og:description': data?.comment,
    'og:type': isQueueRoute ? undefined : 'video',
    'og:video': isQueueRoute
      ? undefined
      : data?.video_url
      ? data.video_url.endsWith('.mp4') ? data.video_url : data.video_url + '.mp4'
      : undefined,
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  // TODO: Check if the ID is valid

  const [video] = await context.db.query<JoinedVideo>(
    `select videos.*
          , BIN_TO_UUID(videos.video_id) as video_id
          , requester.username as requested_by_username
          , renderer.username as rendered_by_username
          , maps.alias
          , maps.best_time_id
          , maps.workshop_file_id
          , maps.type
       from videos
       left join users requester
         on requester.discord_id = videos.requested_by_id
       left join users renderer
         on renderer.user_id = videos.rendered_by
       left join maps
         on maps.map_id = videos.map_id
      where share_id = ?`,
    [
      params.share_id,
    ],
  );

  if (!video) {
    notFound();
  }

  const isQueueRoute = context.url.pathname.startsWith('/queue');

  if (isQueueRoute && video.pending === PendingStatus.FinishedRender) {
    return redirect('/videos/' + video.share_id);
  }

  return json<Data>(video);
};

const _formatRenderTime = (data: Data) => {
  if (!data?.render_time) return `-`;
  return data.render_time < 60 ? `${data.render_time} seconds` : `${(data.render_time / 60).toFixed(2)} minutes`;
};

const getDemoMetadata = (data: Data): DemoMetadata => {
  if (data?.demo_metadata) {
    try {
      return JSON.parse(data.demo_metadata);
      // deno-lint-ignore no-empty
    } catch {}
  }

  return {
    segments: null,
    timestamp: null,
  };
};

const formatCmTime = (time: number) => {
  const cs = time % 100;
  const secs = Math.floor(time / 100);
  const sec = secs % 60;
  const min = Math.floor(secs / 60);
  return min > 0
    ? `${min}:${sec < 10 ? `0${sec}` : `${sec}`}.${cs < 10 ? `0${cs}` : `${cs}`}`
    : `${sec}.${cs < 10 ? `0${cs}` : `${cs}`}`;
};

const formatRank = (rank: number) => {
  return `${rank}${['st', 'nd', 'rd'][((rank + 90) % 100 - 10) % 10 - 1] || 'th'}`;
};

const formatTimestamp = (timestamp: SarDataTimestamp) => {
  const year = timestamp.year.toString().padStart(2, '4');
  const mon = timestamp.mon.toString().padStart(2, '0');
  const day = timestamp.day.toString().padStart(2, '0');
  const hour = timestamp.hour.toString().padStart(2, '0');
  const min = timestamp.min.toString().padStart(2, '0');
  const sec = timestamp.sec.toString().padStart(2, '0');
  return `${year}/${mon}/${day} ${hour}:${min}:${sec} UTC`;
};

const formatToSeconds = (ticks: number, data: Data) => {
  const tickrate = data?.demo_tickrate ?? 0;
  return tickrate !== 0 ? (ticks / tickrate).toFixed(3) : '';
};

export const VideoView = () => {
  const data = useLoaderData<Data>()!;
  if (data.deleted_at) {
    return <NotFound resource='Video' />;
  }

  const state = React.useContext(AppStateContext);
  const metadata = getDemoMetadata(data);
  const hasVideo = data.video_url !== null;
  const _videoHeight = data.render_quality === RenderQuality.SD_480p ? '480' : '720';

  const userPermissions = state?.user?.permissions ?? 0;
  const isAllowedToRerender = (userPermissions & UserPermissions.RerenderVideos) !== 0;
  const isAllowedToDelete = (userPermissions & UserPermissions.DeleteVideos) !== 0 ||
    (state?.user?.user_id && state.user.discord_id === data.requested_by_id);

  return (
    <>
      <div className={tw`xl:ml-4 xl:flex xl:justify-center`}>
        <div className={tw`xl:w-[1280px]`}>
          {!hasVideo &&
            data.pending === PendingStatus.FinishedRender && (
            <>
              <div>
                Failed to render video
              </div>
              <div className={tw`flex-wrap mt-3 flex gap-2`}>
                {isAllowedToRerender && (
                  <div>
                    <button
                      data-modal-target='rerender-modal'
                      data-modal-toggle='rerender-modal'
                      id='video-try-rerender-button'
                      type='button'
                      className={tw`flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                    >
                      <svg
                        className={tw`w-[18px] h-[18px] text-gray-800 dark:text-white`}
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 18 20'
                      >
                        <path
                          stroke='currentColor'
                          stroke-linecap='round'
                          stroke-linejoin='round'
                          stroke-width='2'
                          d='M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97'
                        />
                      </svg>
                      Try Rerender
                    </button>
                  </div>
                )}
                {isAllowedToDelete && (
                  <div>
                    <button
                      data-modal-target='delete-modal'
                      data-modal-toggle='delete-modal'
                      id='video-delete-button'
                      type='button'
                      className={tw`flex items-center gap-2 text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-3 py-2 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800`}
                    >
                      <svg
                        className={tw`w-[18px] h-[18px] text-white dark:text-white`}
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 24 24'
                      >
                        <path
                          stroke='currentColor'
                          stroke-linecap='round'
                          stroke-linejoin='round'
                          stroke-width='2'
                          d='M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z'
                        />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {data.pending !== PendingStatus.FinishedRender && (
            <>
              <div>
                Video is currently queued for a {hasVideo ? 're' : ''}render.
              </div>
              <div className={hasVideo ? tw`mb-4` : undefined}>
                Please come back again in a few minutes.
              </div>
            </>
          )}
          {hasVideo && (
            <div className={tw`relative`}>
              <video
                className={tw`rounded-[12px]`}
                controls
                autoPlay
              >
                <source src={data.video_url} itemType='video/mp4'></source>
              </video>
              <div className={tw`absolute bottom-20 left-2 pointer-events-none`}>
                <canvas id='inputs'></canvas>
              </div>
            </div>
          )}
          {hasVideo && (
            <div className={tw`mt-2`}>
              <input
                id='ihud-checkbox'
                type='checkbox'
                className={tw`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600`}
              />
              <label
                htmlFor='ihud-checkbox'
                className={tw`ml-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
              >
                Show inputs
              </label>
              <div className={tw`flex-wrap mt-3 flex gap-2 float-right`}>
                {data.demo_required_fix === FixedDemoStatus.Required && (
                  <>
                    <div>
                      <a
                        href={`/storage/demos/${data.share_id}/fixed`}
                        target='_blank'
                      >
                        <button
                          type='button'
                          className={tw`text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                        >
                          Download Fixed Demo
                        </button>
                      </a>
                    </div>
                    <div>
                      <a
                        href={getDemoDownloadLink(data)}
                        target='_blank'
                      >
                        <button
                          type='button'
                          className={tw`flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                        >
                          <svg
                            className={tw`w-4 h-4 text-white dark:text-white`}
                            aria-hidden='true'
                            xmlns='http://www.w3.org/2000/svg'
                            fill='none'
                            viewBox='0 0 20 19'
                          >
                            <path
                              stroke='currentColor'
                              stroke-linecap='round'
                              stroke-linejoin='round'
                              stroke-width='2'
                              d='M15 15h.01M4 12H2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-3M9.5 1v10.93m4-3.93-4 4-4-4'
                            />
                          </svg>
                          Download Original Demo
                        </button>
                      </a>
                    </div>
                  </>
                )}
                {data.demo_required_fix === FixedDemoStatus.NotRequired && (
                  <div>
                    <a
                      href={getDemoDownloadLink(data)}
                      target='_blank'
                    >
                      <button
                        type='button'
                        className={tw`flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                      >
                        <svg
                          className={tw`w-4 h-4 text-white dark:text-white`}
                          aria-hidden='true'
                          xmlns='http://www.w3.org/2000/svg'
                          fill='none'
                          viewBox='0 0 20 19'
                        >
                          <path
                            stroke='currentColor'
                            stroke-linecap='round'
                            stroke-linejoin='round'
                            stroke-width='2'
                            d='M15 15h.01M4 12H2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-3M9.5 1v10.93m4-3.93-4 4-4-4'
                          />
                        </svg>
                        Download Demo
                      </button>
                    </a>
                  </div>
                )}
                <div>
                  <button
                    data-modal-target='share-modal'
                    data-modal-toggle='share-modal'
                    id={`video-share-button-${data.share_id}`}
                    type='button'
                    className={tw`video-share-button flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                  >
                    <svg
                      className={tw`w-4 h-4 text-white dark:text-white`}
                      aria-hidden='true'
                      xmlns='http://www.w3.org/2000/svg'
                      fill='none'
                      viewBox='0 0 18 16'
                    >
                      <path
                        stroke='currentColor'
                        stroke-linecap='round'
                        stroke-linejoin='round'
                        stroke-width='2'
                        d='M1.248 15C.22 11.77 2.275 4.232 9.466 4.232V2.079a1.025 1.025 0 0 1 1.644-.862l5.479 4.307a1.108 1.108 0 0 1 0 1.723l-5.48 4.307a1.026 1.026 0 0 1-1.643-.861V8.539C2.275 9.616 1.248 15 1.248 15Z'
                      />
                    </svg>
                    Share Video
                  </button>
                </div>
                {data.pending === PendingStatus.FinishedRender && isAllowedToRerender && (
                  <div>
                    <button
                      data-modal-target='rerender-modal'
                      data-modal-toggle='rerender-modal'
                      id='video-rerender-button'
                      type='button'
                      className={tw`flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-3 py-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
                    >
                      <svg
                        className={tw`w-4 h-4 text-white dark:text-white`}
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 18 20'
                      >
                        <path
                          stroke='currentColor'
                          stroke-linecap='round'
                          stroke-linejoin='round'
                          stroke-width='2'
                          d='M16 1v5h-5M2 19v-5h5m10-4a8 8 0 0 1-14.947 3.97M1 10a8 8 0 0 1 14.947-3.97'
                        />
                      </svg>
                      Rerender
                    </button>
                  </div>
                )}
                {data.pending === PendingStatus.FinishedRender && isAllowedToDelete && (
                  <div>
                    <button
                      data-modal-target='delete-modal'
                      data-modal-toggle='delete-modal'
                      id='video-delete-button'
                      type='button'
                      className={tw`flex items-center gap-2 text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-3 py-2 dark:bg-red-600 dark:hover:bg-red-700 focus:outline-none dark:focus:ring-red-800`}
                    >
                      <svg
                        className={tw`w-[18px] h-[18px] text-white dark:text-white`}
                        aria-hidden='true'
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 24 24'
                      >
                        <path
                          stroke='currentColor'
                          stroke-linecap='round'
                          stroke-linejoin='round'
                          stroke-width='2'
                          d='M5 7h14m-9 3v8m4-8v8M10 3h4a1 1 0 0 1 1 1v3H9V4a1 1 0 0 1 1-1ZM6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7Z'
                        />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className={tw`mt-12 relative text-[20px]`}>
            <div>
              {hasVideo && <span className={tw`float-right ml-8`}>{data.views} view{data.views === 1 ? '' : 's'}</span>}
              <span className={tw`break-words`}>{data.title}</span>
            </div>
          </div>
          <br />
          {(data.board_changelog_id !== null || data.workshop_file_id !== null) && (
            <div>
              Map:{' '}
              <a
                className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                href={data.board_changelog_id !== null
                  ? `https://${data.board_source_domain}/chamber/${data.best_time_id}`
                  : `https://steamcommunity.com/workshop/filedetails/?id=${data.workshop_file_id}`}
                target='_blank'
              >
                {data.alias}
              </a>
            </div>
          )}
          {data.demo_steam_id !== null && (
            <div>
              Player:{' '}
              <a
                className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                href={data.board_changelog_id !== null
                  ? `https://${data.board_source_domain}/profile/${data.demo_steam_id}`
                  : `https://steamcommunity.com/profiles/${data.demo_steam_id}`}
                target='_blank'
              >
                {data.demo_player_name}
              </a>
            </div>
          )}
          {data.demo_partner_steam_id !== null && (
            <div>
              Partner:{' '}
              <a
                className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                href={data.board_changelog_id !== null
                  ? `https://${data.board_source_domain}/profile/${data.demo_partner_steam_id}`
                  : `https://steamcommunity.com/profiles/${data.demo_partner_steam_id}`}
                target='_blank'
              >
                {data.demo_partner_player_name}
              </a>
            </div>
          )}
          {data.demo_time_score !== null && (
            <div>
              Time: {data.board_changelog_id
                ? (
                  <a
                    className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                    href={`https://${data.board_source_domain}/changelog?id=${data.board_changelog_id}`}
                    target='_blank'
                  >
                    {formatCmTime(data.demo_time_score)}
                  </a>
                )
                : <>{formatCmTime(data.demo_time_score)}</>}
            </div>
          )}
          {data.demo_time_score === null && data.board_changelog_id && (
            <div>
              <a
                className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                href={`https://${data.board_source_domain}/changelog?id=${data.board_changelog_id}`}
                target='_blank'
              >
                View Changelog
              </a>
            </div>
          )}
          {data.board_rank !== null && <div>Rank at time of upload: {formatRank(data.board_rank)}</div>}
          <br />
          {metadata.timestamp === null && <div>Date: {new Date(data.created_at).toLocaleDateString()}</div>}
          {data.requested_by_username !== null && (
            <div>
              Requested by: {data.requested_by_username
                ? (
                  <a
                    className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                    href={`/profile/${data.requested_by_username}`}
                  >
                    {data.requested_by_username}
                  </a>
                )
                : <>{data.requested_by_name}</>}
            </div>
          )}
          {data.requested_in_channel_name && (
            <div>
              Requested in: {data.requested_in_guild_name}#
              {data.requested_in_channel_name}
            </div>
          )}
          {
            /* {(data.rendered_by_username || data.render_node) && (
            <div>
              Render node: {data.rendered_by_username !== null
                ? (
                  <a
                    className={tw`font-medium text-blue-600 dark:text-blue-400 hover:underline`}
                    href={`/profile/${data.rendered_by_username}`}
                  >
                    {data.render_node}@{data.rendered_by_username}
                  </a>
                )
                : <>{data.render_node}</>}
            </div>
          )} */
          }
          {metadata.timestamp !== null && (
            <div className={tw`my-4`}>Timestamp: {formatTimestamp(metadata.timestamp)}</div>
          )}
          {(metadata.segments?.length ?? 0) > 0 && (
            <>
              <div className={tw`mb-4 relative overflow-x-auto`}>
                <table className={tw`w-full text-sm text-left text-black dark:text-white`}>
                  <thead
                    className={tw`text-xs uppercase text-white bg-blue-700 dark:text-white`}
                  >
                    <tr>
                      <th scope='col' className={tw`px-6 py-3`}>
                        Segment
                      </th>
                      <th scope='col' className={tw`px-6 py-3 text-right`}>
                        Seconds
                      </th>
                      <th scope='col' className={tw`px-6 py-3 text-right`}>
                        Ticks
                      </th>
                      <th scope='col' className={tw`px-6 py-3 text-right whitespace-nowrap`}>
                        Total Seconds
                      </th>
                      <th scope='col' className={tw`px-6 py-3 text-right whitespace-nowrap`}>
                        Total Ticks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metadata.segments!.map((segment, index, segments) => {
                      const totalTicks = segments
                        .slice(0, index + 1)
                        .reduce((total, segment) => (total += segment.ticks), 0);
                      return (
                        <tr className={tw`bg-blue-50 border-gray-100 dark:bg-gray-800 dark:border-gray-800`}>
                          <th
                            scope='row'
                            className={tw`px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white`}
                          >
                            {segment.name}
                          </th>
                          <td className={tw`px-6 py-4 text-right`}>
                            {formatToSeconds(segment.ticks, data)}
                          </td>
                          <td className={tw`px-6 py-4 text-right`}>
                            {segment.ticks}
                          </td>
                          <td className={tw`px-6 py-4 text-right`}>
                            {formatToSeconds(totalTicks, data)}
                          </td>
                          <td className={tw`px-6 py-4 text-right`}>
                            {totalTicks}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {hasVideo && <ShareModal />}
      {data.pending === PendingStatus.FinishedRender && isAllowedToRerender && (
        <RerenderModal isCoop={data.type === MapType.Cooperative || data.type === MapType.WorkshopCooperative} />
      )}
      <DeleteModal />
    </>
  );
};
