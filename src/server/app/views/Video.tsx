/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { DataLoader, PageMeta, json, useLoaderData } from "../Routes.ts";
import { Video } from "../../models.ts";

type JoinedVideo = Video & { requested_by_username: string };
type Data = JoinedVideo | undefined;

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data?.title ?? "untitled video",
    description: data?.comment,
    "og:title": data?.title ?? "untitled video",
    "og:description": data?.comment,
    "og:video": data?.video_url,
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  const [video] = await context.db.query<JoinedVideo>(
    `select *
          , users.username as requested_by_username
       from videos
       left join users
            on users.discord_id = videos.requested_by_id
      where video_id = ?`,
    [params.video_id]
  );
  return json<Data>(video);
};

export const VideoView = () => {
  const data = useLoaderData<Data>();

  return (
    <>
      <div>
        <a href={`/profile/${data?.requested_by_username}`}>Back to profile</a>
      </div>
      <div>{!data?.video_id && "video not found :("}</div>
      {data && (
        <>
          <h2>{data.title ?? "untitled"}</h2>
          <br />
          <div>
            <video controls>
              <source src={data.video_url} itemType="video/mp4"></source>
            </video>
          </div>
          <br />
          <div>Comment: {data.comment}</div>
          <div>Date: {data.created_at}</div>
          <div>Requested by: {data.requested_by_name}</div>
          <div>Rendered by: {data.rendered_by}</div>
        </>
      )}
      <Footer />
    </>
  );
};
