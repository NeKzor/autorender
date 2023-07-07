/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import {
  DataLoader,
  PageMeta,
  json,
  redirect,
  useLoaderData,
} from "../Routes.ts";
import { FixedDemoStatus, PendingStatus, Video } from "../../models.ts";

type JoinedVideo = Video & {
  requested_by_username: string;
  rendered_by_username: string;
};

type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data?.title,
    description: data?.comment,
    "og:title": data?.title,
    "og:description": data?.comment,
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

  if (video.pending === PendingStatus.FinishedRender) {
    return redirect("/videos/" + video.video_id);
  }

  return json<Data>(video);
};

export const Queue = () => {
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
          <div>
            Video is currently queued for rendering. Please come back again in a
            few minutes.
          </div>
          <br />
          {data.demo_required_fix === FixedDemoStatus.Required && (
            <>
              <div>
                Download fixed:{" "}
                <a
                  href={`/storage/demos/${data.video_id}/fixed`}
                  target="_blank"
                >
                  {data.file_name.toLowerCase().endsWith(".dem")
                    ? `${data.file_name.slice(0, -4)}_fixed.dem`
                    : `${data.file_name}_fixed.dem`}
                </a>
              </div>
              <div>
                Download original:{" "}
                <a href={`/storage/demos/${data.video_id}`} target="_blank">
                  {data.file_name}
                </a>
              </div>
            </>
          )}
          {data.demo_required_fix === FixedDemoStatus.NotRequired && (
            <div>
              Download:{" "}
              <a href={`/storage/demos/${data.video_id}`} target="_blank">
                {data.file_name}
              </a>
            </div>
          )}
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
