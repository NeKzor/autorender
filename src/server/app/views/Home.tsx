/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { AppStateContext } from "../AppState.ts";
import Footer from "../components/Footer.tsx";
import { PendingStatus, User, UserPermissions, Video } from "../../models.ts";
import { DataLoader, PageMeta, json, useLoaderData } from "../Routes.ts";

type LatestVideo = Pick<
  Video,
  "video_id" | "title" | "created_at" | "views"
> & {
  requested_by_username: string | null;
};

type MostViewedVideo = Pick<
  Video,
  "video_id" | "title" | "created_at" | "views"
> & {
  requested_by_username: string | null;
};

type RequestedByStat = Pick<Video, "requested_by_id"> & {
  username: User["username"];
  number_of_requests: number;
};

type RenderedByStat = Pick<Video, "rendered_by"> & {
  username: User["username"];
  number_of_renders: number;
};

type Data = {
  latestVideos: LatestVideo[];
  mostViewedVideos: MostViewedVideo[];
  requesterStats: RequestedByStat[];
  rendererStats: RenderedByStat[];
};

export const meta: PageMeta<undefined> = () => {
  return {
    title: "Home",
  };
};

export const loader: DataLoader = async ({ context }) => {
  const latestVideos = await context.db.query<LatestVideo>(
    `select videos.title
          , videos.created_at
          , videos.views
          , BIN_TO_UUID(videos.video_id) as video_id
          , requester.username as requested_by_username
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where pending = ?
        and video_url is not null
   order by created_at desc
      limit 5`,
    [PendingStatus.FinishedRender]
  );

  const mostViewedVideos = await context.db.query<LatestVideo>(
    `select videos.title
          , videos.created_at
          , videos.views
          , BIN_TO_UUID(videos.video_id) as video_id
          , requester.username as requested_by_username
       from videos
       left join users requester
            on requester.discord_id = videos.requested_by_id
      where pending = ?
        and video_url is not null
   order by views desc
      limit 5`,
    [PendingStatus.FinishedRender]
  );

  const requesterStats = await context.db.query<RequestedByStat>(
    `select stats.*
          , users.username
       from (
          select requested_by_id
               , count(*) as number_of_requests
            from videos
           where pending = 0
             and video_url is not null
        group by requested_by_id
        ) stats
           left join users
             on users.discord_id = stats.requested_by_id
          order by stats.number_of_requests desc
          limit 5`,
    [PendingStatus.FinishedRender]
  );

  const rendererStats = await context.db.query<RenderedByStat>(
    `select stats.*
          , users.username
       from (
          select rendered_by
               , count(*) as number_of_renders
            from videos
           where pending = ?
             and video_url is not null
        group by rendered_by
        ) stats
          inner join users
             on users.user_id = stats.rendered_by
          order by stats.number_of_renders desc
          limit 5`,
    [PendingStatus.FinishedRender]
  );

  return json<Data>({
    latestVideos,
    mostViewedVideos,
    requesterStats,
    rendererStats,
  });
};

export const Home = () => {
  const state = React.useContext(AppStateContext);

  const data = useLoaderData<Data>();

  return (
    <>
      {state?.user ? (
        <>
          <div>Hey {state.user.username}!</div>
          <div>
            <a href={`/profile/${state.user.username}`}>Profile</a>
          </div>
        </>
      ) : (
        <div>
          <a href={state?.discordAuthorizeLink}>Login with Discord</a>
        </div>
      )}
      {data !== null && (
        <>
          <br />
          <div>
            Latest videos:
            <ul>
              {data.latestVideos.map((video) => {
                return (
                  <li>
                    <a href={`/videos/${video.video_id}`}>{video.title}</a> |{" "}
                    {new Date(video.created_at).toLocaleDateString()} |{" "}
                    {video.views} views
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            Most viewed videos:
            <ul>
              {data.mostViewedVideos.map((video) => {
                return (
                  <li>
                    <a href={`/videos/${video.video_id}`}>{video.title}</a> |{" "}
                    {new Date(video.created_at).toLocaleDateString()} |{" "}
                    {video.views} views
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            Top video renderers:
            <ul>
              {data.requesterStats.map((stat) => {
                return (
                  <li>
                    {stat.username ? (
                      <a href={`/profile/${stat.username}`}>{stat.username}</a>
                    ) : (
                      <span>{stat.requested_by_id}</span>
                    )}{" "}
                    | {stat.number_of_requests} videos
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            Top video providers:
            <ul>
              {data.rendererStats.map((stat) => {
                return (
                  <li>
                    <a href={`/profile/${stat.username}`}>{stat.username}</a> |{" "}
                    {stat.number_of_renders} videos
                  </li>
                );
              })}
            </ul>
          </div>
          <br />
        </>
      )}
      {state?.user &&
        !!(state.user.permissions & UserPermissions.CreateTokens) && (
          <div>
            <a href="/tokens">Tokens</a>
          </div>
        )}
      {state?.user && (
        <div>
          <a href="/logout">Logout</a>
        </div>
      )}
      <Footer />
    </>
  );
};
