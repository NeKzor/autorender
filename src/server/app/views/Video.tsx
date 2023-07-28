/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { useLocation } from 'https://esm.sh/react-router-dom@6.11.2';
import Footer from '../components/Footer.tsx';
import { DataLoader, json, notFound, PageMeta, redirect, useLoaderData } from '../Routes.ts';
import { FixedDemoStatus, PendingStatus, Video } from '../../models.ts';
import { DemoMetadata, SarDataTimestamp } from '../../demo.ts';

type JoinedVideo = Video & {
  requested_by_username: string | null;
  rendered_by_username: string | null;
};

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
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
       left join users renderer
            on renderer.user_id = videos.rendered_by
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
  return tickrate !== 0 ? (ticks / tickrate).toPrecision(2) : '';
};

export const VideoView = () => {
  const data = useLoaderData<Data>();
  const metadata = getDemoMetadata(data);

  const location = useLocation();
  const isQueueRoute = location.pathname.startsWith('/queue');

  return (
    <>
      {!data?.video_id && <div>video not found :(</div>}
      {data && (
        <>
          {data.requested_by_username && (
            <div>
              <a href={`/profile/${data.requested_by_username}`}>
                Back to profile
              </a>
            </div>
          )}
          <h2>{data.title}</h2>
          <br />
          {isQueueRoute
            ? (
              <div>
                Video is currently queued for rendering. Please come back again in a few minutes.
              </div>
            )
            : (
              <>
                {!data.video_url &&
                  data.pending === PendingStatus.FinishedRender && <div>Failed to render video :(</div>}
                {!data.video_url &&
                  data.pending !== PendingStatus.FinishedRender && (
                  <div>
                    Video is currently queued for rendering. Please come back again in a few minutes.
                  </div>
                )}
                {data.video_url && (
                  <div>
                    <video controls>
                      <source src={data.video_url} itemType='video/mp4'></source>
                    </video>
                  </div>
                )}
              </>
            )}
          <br />
          {data.demo_required_fix === FixedDemoStatus.Required && (
            <>
              <div>
                Download fixed:{' '}
                <a
                  href={`/storage/demos/${data.share_id}/fixed`}
                  target='_blank'
                >
                  {data.file_name.toLowerCase().endsWith('.dem')
                    ? `${data.file_name.slice(0, -4)}_fixed.dem`
                    : `${data.file_name}_fixed.dem`}
                </a>
              </div>
              <div>
                Download original:{' '}
                <a href={`/storage/demos/${data.share_id}`} target='_blank'>
                  {data.file_name}
                </a>
              </div>
            </>
          )}
          {data.demo_required_fix === FixedDemoStatus.NotRequired && (
            <div>
              Download:{' '}
              <a href={`/storage/demos/${data.share_id}`} target='_blank'>
                {data.file_name}
              </a>
            </div>
          )}
          <div>Comment: {data.comment ?? '-'}</div>
          <div>Quality: {data.render_quality}</div>
          <div>Date: {new Date(data.created_at).toLocaleDateString()}</div>
          {data.requested_by_username !== null && (
            <div>
              Requested by: {data.requested_by_username
                ? (
                  <a href={`/profile/${data.requested_by_username}`}>
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
          <div>Render time: {formatRenderTime(data)}</div>
          <div>
            Render node: {data.rendered_by_username !== null
              ? (
                <a href={`/profile/${data.rendered_by_username}`}>
                  {data.render_node}@{data.rendered_by_username}
                </a>
              )
              : <>-</>}
          </div>
          {data.demo_time_score !== null && <div>Time Score: {formatCmTime(data.demo_time_score)}</div>}
          {data.demo_portal_score !== null && <div>Portal Score: {data.demo_portal_score}</div>}
          {data.board_rank !== null && <div>Rank at time of upload: {formatRank(data.board_rank)}</div>}
          {data.board_profile_number !== null && (
            <div>
              Profile:{' '}
              <a
                href={`https://board.portal2.sr/profile/${data.board_profile_number}`}
                target='_blank'
              >
                {data.demo_player_name}
              </a>
            </div>
          )}
          {data.demo_steam_id !== null && (
            <div>
              Player:{' '}
              <a
                href={`https://steamcommunity.com/profiles/${data.demo_steam_id}`}
                target='_blank'
              >
                {data.demo_player_name}
              </a>
            </div>
          )}
          {metadata.timestamp !== null && <div>Timestamp: {formatTimestamp(metadata.timestamp)}</div>}
          {(metadata.segments?.length ?? 0) > 0 && (
            <>
              <div>Segments:</div>
              <ul>
                {metadata.segments!.map((segment, index, segments) => {
                  const totalTicks = segments
                    .slice(0, index + 1)
                    .reduce((total, segment) => (total += segment.ticks), 0);
                  return (
                    <li>
                      {formatToSeconds(segment.ticks, data)} ({segment.ticks}) - {formatToSeconds(totalTicks, data)}
                      {' '}
                      ({totalTicks}) - {segment.name}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
      <Footer />
    </>
  );
};
