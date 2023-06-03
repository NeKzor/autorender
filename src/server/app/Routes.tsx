/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import {
  json,
  RouteObject,
} from "https://esm.sh/react-router-dom@6.11.2";
import Home from "./views/Home.tsx";
import NotFound from "./views/NotFound.tsx";
import Privacy from "./views/Privacy.tsx";
import About from "./views/About.tsx";
import Tokens from "./views/Tokens.tsx";
import Profile from "./views/Profile.tsx";
import Token from "./views/Token.tsx";
import { db } from "../db.ts";

const routes: RouteObject[] = [
  {
    path: "/",
    Component: Home,
  },
  {
    path: "/profile/:user_id",
    Component: Profile,
    loader: async ({ params }) => {
      // TODO: auth check
      const { rows } = await db.execute(
        `select * from users where user_id = ?`,
        [params.user_id]
      );
      return json(rows?.at(0) ?? null);
    },
  },
  {
    path: "/tokens",
    Component: Tokens,
  },
  {
    path: "/tokens/:access_token_id",
    Component: Token,
    loader: async ({ params }) => {
      // TODO: auth check
      const { rows } = await db.execute(
        `select * from access_tokens where access_token_id = ?`,
        [params.access_token_id]
      );
      return json(rows?.at(0) ?? null);
    },
  },
  {
    path: "/privacy",
    Component: Privacy,
  },
  {
    path: "/about",
    Component: About,
  },
  {
    path: "*",
    Component: NotFound,
  },
];

export default routes;
