/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import Footer from '../components/Footer.tsx';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { PendingStatus, User, Video } from '../../models.ts';

type Data = {
  user: User | undefined;
  videos: Video[];
};

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data.user?.username ?? 'Profile not found :(',
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  const [user] = await context.db.query<User>(
    `select * from users where username = ?`,
    [params.username],
  );

  const videos = user
    ? await context.db.query<Video>(
      `select *
              , BIN_TO_UUID(video_id) as video_id
           from videos
          where requested_by_id = ?
            and deleted_at is null
          order by created_at desc`,
      [user.discord_id],
    )
    : [];

  return json<Data>({ user, videos });
};

export const Profile = () => {
  const { user, videos } = useLoaderData<Data>();

  const queuedVideos = videos.filter(
    (video) => video.pending !== PendingStatus.FinishedRender,
  );

  const renderedVideos = videos.filter(
    (video) => video.pending === PendingStatus.FinishedRender,
  );

  return (
    <>
      <div>{user?.username ?? 'profile not found :('}</div>
      {user && (
        <>
          {queuedVideos.length > 0 && (
            <>
              <div>
                Queued {queuedVideos.length} video
                {queuedVideos.length === 1 ? '' : 's'}
              </div>
              <ul>
                {queuedVideos.map((video) => {
                  return (
                    <li>
                      <a href={`/queue/${video.share_id}`}>{video.title}</a> |{' '}
                      {new Date(video.created_at).toLocaleDateString()}
                    </li>
                  );
                })}
              </ul>
              <br />
            </>
          )}
          <div>
            Rendered {renderedVideos.length} video
            {renderedVideos.length === 1 ? '' : 's'}
          </div>
          <ul>
            {renderedVideos.map((video) => {
              return (
                <li>
                  <a href={`/videos/${video.share_id}`}>{video.title}</a> |{' '}
                  {new Date(video.created_at).toLocaleDateString()}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Footer />
    </>
  );
};
