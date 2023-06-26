/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { DataLoader, PageMeta, json, useLoaderData } from "../Routes.ts";
import { PendingStatus, Video } from "../../models.ts";

type JoinedVideo = Video & {
  requested_by_username: string;
  rendered_by_username: string;
};

type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data?.title ?? "untitled video",
    description: data?.comment,
    "og:title": data?.title ?? "untitled video",
    "og:description": data?.comment,
    "og:type": "video",
    "og:video": data?.video_url,
  };
};

export const loader: DataLoader = async ({ params, context }) => {
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
      where video_id = UUID_TO_BIN(?)`,
    [params.video_id]
  );
  return json<Data>(video);
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
          <h2>{data.title ?? "untitled"}</h2>
          <br />
          {!data.video_url && data.pending === PendingStatus.FinishedRender && (
            <div>Failed to render video :(</div>
          )}
          {!data.video_url && data.pending !== PendingStatus.FinishedRender && (
            <div>
              Video is currently queued for rendering. Please come back again in
              a few minutes.
            </div>
          )}
          {data.video_url && (
            <div>
              <video controls>
                <source src={data.video_url} itemType="video/mp4"></source>
              </video>
            </div>
          )}
          <br />
          <div>Comment: {data.comment ?? "-"}</div>
          <div>Render options: {data.render_options ?? "-"}</div>
          <div>Date: {new Date(data.created_at).toLocaleDateString()}</div>
          <div>
            Requested by:{" "}
            {data.requested_by_username ? (
              <a href={`/profile/${data.requested_by_username}`}>
                {data.requested_by_username}
              </a>
            ) : (
              <>{data.requested_by_name}</>
            )}
          </div>
          {data.requested_in_channel_name && (
            <div>
              Requested in: {data.requested_in_guild_name}#
              {data.requested_in_channel_name}
            </div>
          )}
          <div>
            Rendered by:{" "}
            <a href={`/profile/${data.rendered_by_username ?? "@"}`}>
              {data.rendered_by_username ?? "@"}
            </a>
          </div>
          <div>
            Render options: <code>{data.render_options ?? "none"}</code>
          </div>
        </>
      )}
      <Footer />
    </>
  );
};
