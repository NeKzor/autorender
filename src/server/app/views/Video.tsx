/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, notFound, PageMeta, redirect, useLoaderData } from '../Routes.ts';
import { FixedDemoStatus, MapModel, PendingStatus, RenderQuality, Video } from '~/shared/models.ts';
import { DemoMetadata, SarDataTimestamp } from '../../demo.ts';
import ShareModal from '../components/ShareModal.tsx';

type JoinedVideo = Video & {
  requested_by_username: string | null;
  rendered_by_username: string | null;
} & Pick<MapModel, 'alias' | 'best_time_id' | 'workshop_file_id'>;

type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = ({ data, context }) => {
  const isQueueRoute = context.url.pathname.startsWith('/queue');

  return {
    title: data?.title,
    description: data?.comment,
    'og:title': data?.title,
    'og:description': data?.comment,
    'og:type': isQueueRoute ? undefined : 'video',
    'og:video': isQueueRoute ? undefined : data?.video_url,
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  // TODO: Remove this in the future
  const where = (params.share_id?.length ?? 0) > 11 ? 'video_id = UUID_TO_BIN(?)' : 'share_id = ?';

  // TODO: Check if the ID is valid

  const [video] = await context.db.query<JoinedVideo>(
    `select videos.*
          , BIN_TO_UUID(videos.video_id) as video_id
          , requester.username as requested_by_username
          , renderer.username as rendered_by_username
          , maps.alias
          , maps.best_time_id
          , maps.workshop_file_id
       from videos
       left join users requester
         on requester.discord_id = videos.requested_by_id
       left join users renderer
         on renderer.user_id = videos.rendered_by
       left join maps
         on maps.map_id = videos.map_id
      where ${where}`,
    [params.share_id],
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

const formatRenderTime = (data: Data) => {
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
  const metadata = getDemoMetadata(data);

  const hasVideo = data.video_url !== null;
  const videoHeight = data.render_quality === RenderQuality.SD_480p ? '480' : '720';

  return (
    <>
      <div className={tw`xl:flex items-center justify-center`}>
        <div className={tw`xl:w-[1280px]`}>
          {!hasVideo &&
            data.pending === PendingStatus.FinishedRender && <div>Failed to render video</div>}
          {!hasVideo &&
            data.pending !== PendingStatus.FinishedRender && (
            <>
              <div>
                Video is currently queued for rendering.
              </div>
              <div>
                Please come back again in a few minutes.
              </div>
            </>
          )}
          {hasVideo && (
            <>
              <video
                className={tw`h-[56.25vw] xl:h-[${videoHeight}px]`}
                controls
                autoPlay
                controlsList='nodownload'
              >
                <source src={data.video_url} itemType='video/mp4'></source>
              </video>
              {
                /* <div
                id='video-loading-status'
                className={tw`flex items-center justify-center h-[56.25vw] xl:max-h-[${videoHeight}px] border border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-700`}
              >
                <div role='status'>
                  <svg
                    aria-hidden='true'
                    className={tw`w-8 h-8 mr-2 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600`}
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
                </div>
              </div> */
              }
            </>
          )}
          <div className={tw`mt-6 relative text-[20px]`}>
            <div>
              {hasVideo && <span className={tw`float-right ml-8`}>{data.views} views</span>}
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
                  ? `https://board.portal2.sr/chamber/${data.best_time_id}`
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
                  ? `https://board.portal2.sr/profile/${data.demo_steam_id}`
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
                  ? `https://board.portal2.sr/profile/${data.demo_partner_steam_id}`
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
                    href={`https://board.portal2.sr/changelog?id=${data.board_changelog_id}`}
                    target='_blank'
                  >
                    {formatCmTime(data.demo_time_score)}
                  </a>
                )
                : <>{formatCmTime(data.demo_time_score)}</>}
            </div>
          )}
          {data.board_rank !== null && <div>Rank at time of upload: {formatRank(data.board_rank)}</div>}
          <br />
          {data.comment?.length ? <div className={tw`break-words`}>Comment: {data.comment}</div> : (
            <div>
              Comment: <i>No comment</i>
            </div>
          )}
          <br />
          <div>Quality: {data.render_quality}</div>
          <div>Date: {new Date(data.created_at).toLocaleDateString()}</div>
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
          {(data.render_options?.length ?? 0) !== 0 && <div>Render options: {data.render_options}</div>}
          {!!data.render_time && <div>Render time: {formatRenderTime(data)}</div>}
          {(data.rendered_by_username || data.render_node) && (
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
          )}
          {metadata.timestamp !== null && (
            <div className={tw`mt-4 mb-4`}>Timestamp: {formatTimestamp(metadata.timestamp)}</div>
          )}
          {(metadata.segments?.length ?? 0) > 0 && (
            <>
              <div className={tw`relative overflow-x-auto`}>
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
                      <th scope='col' className={tw`px-6 py-3 text-right`}>
                        Total Seconds
                      </th>
                      <th scope='col' className={tw`px-6 py-3 text-right`}>
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
                        <tr className={tw`bg-white border-gray-100 dark:bg-gray-900 dark:border-gray-800`}>
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
          <div className={tw`mt-6 flex gap-2`}>
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
                    href={`/storage/demos/${data.share_id}`}
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
                  href={`/storage/demos/${data.share_id}`}
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
                    Download Demo
                  </button>
                </a>
              </div>
            )}
            {hasVideo && (
              <div>
                <button
                  data-modal-target='share-modal'
                  data-modal-toggle='share-modal'
                  id={`video-share-button-${data.share_id}`}
                  type='button'
                  className={tw`video-share-button flex items-center gap-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
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
            )}
          </div>
        </div>
      </div>
      <ShareModal />
    </>
  );
};
