/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { DataLoader, PageMeta, json, useLoaderData } from "../Routes.ts";
import { User } from "../../models.ts";

type LoaderData = User | null;

export const meta: PageMeta = () => {
  return {
    title: "Profile",
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  const { rows } = await context.db.execute<User>(
    `select * from users where user_id = ?`,
    [params.user_id]
  );
  return json<LoaderData>(rows?.at(0) ?? null);
};

export const Profile = () => {
  const data = useLoaderData<LoaderData>();

  return (
    <>
      <div>{data?.username ?? 'profile not found :('}</div>
      <Footer />
    </>
  );
};
