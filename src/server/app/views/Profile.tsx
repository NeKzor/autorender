/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { DataLoader, PageMeta, json, useLoaderData } from "../Routes.ts";
import { User, Video } from "../../models.ts";

type Data = {
  user: User | undefined;
  videos: Video[];
};

export const meta: PageMeta<Data> = (data) => {
  return {
    title: data.user?.username ?? "Profile not found :(",
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  const [user] = await context.db.query<User>(
    `select * from users where username = ?`,
    [params.username]
  );

  const videos = user
    ? await context.db.query<Video>(
        `select *
              , BIN_TO_UUID(video_id) as video_id
           from videos
          where requested_by_id = ?
            and deleted_at is null
          order by created_at desc`,
        [user.discord_id]
      )
    : [];

  return json<Data>({ user, videos });
};

export const Profile = () => {
  const { user, videos } = useLoaderData<Data>();

  return (
    <>
      <div>{user?.username ?? "profile not found :("}</div>
      {user && (
        <>
          <div>Requested {videos.length} videos</div>
          <ul>
            {videos.map((video) => {
              return (
                <li>
                  <a href={`/videos/${video.video_id}`}>
                    {video.title ?? "untitled"}
                  </a>{" "}
                  | {new Date(video.created_at).toLocaleDateString()}
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
