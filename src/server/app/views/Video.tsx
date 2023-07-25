/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import Footer from '../components/Footer.tsx';
import { DataLoader, json, notFound, PageMeta, useLoaderData } from '../Routes.ts';
import { FixedDemoStatus, PendingStatus, Video } from '../../models.ts';

type JoinedVideo = Video & {
  requested_by_username: string | null;
  rendered_by_username: string | null;
};

type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data?.title,
    description: data?.comment,
    'og:title': data?.title,
    'og:description': data?.comment,
    'og:type': 'video',
    'og:video': data?.video_url,
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

  if (video?.pending !== PendingStatus.FinishedRender) {
    notFound();
  }

  return json<Data>(video);
};

const formatRenderTime = (video: Video) => {
  if (!video.render_time) return `-`;

  return video.render_time < 60 ? `${video.render_time} seconds` : `${(video.render_time / 60).toFixed(2)} minutes`;
};

export const VideoView = () => {
  const data = useLoaderData<Data>();

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
          {!data.video_url && data.pending === PendingStatus.FinishedRender && <div>Failed to render video :(</div>}
          {!data.video_url && data.pending !== PendingStatus.FinishedRender && (
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
          <div>
            Requested by: {data.requested_by_username
              ? (
                <a href={`/profile/${data.requested_by_username}`}>
                  {data.requested_by_username}
                </a>
              )
              : <>{data.requested_by_name}</>}
          </div>
          {data.requested_in_channel_name && (
            <div>
              Requested in: {data.requested_in_guild_name}#
              {data.requested_in_channel_name}
            </div>
          )}
          <div>Render time: {formatRenderTime(data)}</div>
          <div>
            Render node:{' '}
            <a href={`/profile/${data.rendered_by_username}`}>
              {data.render_node}@{data.rendered_by_username}
            </a>
          </div>
        </>
      )}
      <Footer />
    </>
  );
};
