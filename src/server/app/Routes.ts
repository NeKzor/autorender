/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  json as routerJson,
  useLoaderData as routerUseLoaderData,
  RouteObject,
} from "https://esm.sh/react-router-dom@6.11.2";
import {
  Params,
  LoaderFunction as RemixLoaderFunction,
  ActionFunction as RemixActionFunction,
} from "https://esm.sh/v124/@remix-run/router@1.6.2";
import {
  Status,
  Request as OakRequest,
} from "https://deno.land/x/oak@v12.2.0/mod.ts";
import { createStaticHandler } from "https://esm.sh/react-router-dom@6.11.2/server";
import Home from "./views/Home.tsx";
import NotFound from "./views/NotFound.tsx";
import About from "./views/About.tsx";
import Token from "./views/Token.tsx";
import Tokens from "./views/Tokens.tsx";
import Privacy from "./views/Privacy.tsx";
import * as ProfileView from "./views/Profile.tsx";
import { Database } from "../db.ts";
import { User } from "../models.ts";

export const unauthorized = () =>
  new Response("Unauthorized", { status: Status.Unauthorized });
export const notFound = () =>
  new Response("Not Found", { status: Status.NotFound });

export const json = routerJson;
export const useLoaderData = <T>() => routerUseLoaderData() as T;

// This gives us access to the authenticated user
// and the db instance in every loader function :^)
export interface RequestContext {
  user: User | null;
  db: Database;
}

// This adds type-safety for using context.
interface DataFunctionArgs<Context> {
  request: Request;
  params: Params;
  context: Context;
}
// deno-lint-ignore no-empty-interface
interface LoaderFunctionArgs<Context> extends DataFunctionArgs<Context> {}
// deno-lint-ignore no-empty-interface
interface ActionFunctionArgs<Context> extends DataFunctionArgs<Context> {}
interface LoaderFunction<Context> {
  (args: LoaderFunctionArgs<Context>): ReturnType<RemixLoaderFunction>;
}
export interface ActionFunction<Context> {
  (args: ActionFunctionArgs<Context>): ReturnType<RemixActionFunction>;
}

export type DataLoader = LoaderFunction<RequestContext>;
export type ActionLoader = LoaderFunction<RequestContext>;

// This allows every route to change meta values.
export type RouteMeta = {
  title?: string;
};

// TODO: Figure out a way to access data from the data loader.
//       Probably not possible because it's handled inside a React component :>
export type PageMeta = () => RouteMeta;

export type Route<Context> = Omit<RouteObject, "loader" | "action"> & {
  loader?: LoaderFunction<Context>;
  action?: LoaderFunction<Context>;
  meta?: PageMeta;
};

export const routes: Route<RequestContext>[] = [
  {
    path: "/",
    Component: Home,
    meta: () => ({
      title: "Home",
    }),
  },
  {
    path: "/profile/:user_id",
    Component: ProfileView.Profile,
    meta: ProfileView.meta,
    loader: ProfileView.loader,
  },
  {
    path: "/tokens",
    Component: Tokens,
    meta: () => ({
      title: "Tokens",
    }),
  },
  {
    path: "/tokens/:access_token_id",
    Component: Token,
    meta: () => ({
      title: "Token",
    }),
    loader: async ({ params, context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      const { rows } = await context.db.execute(
        `select * from access_tokens where access_token_id = ? and user_id = ?`,
        [params.access_token_id, context.user.user_id]
      );

      return json(rows?.at(0) ?? null);
    },
    action: async ({ params, context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      const { affectedRows } = await context.db.execute(
        `update access_tokens set name = ? where access_token_id = ? and user_id = ?`,
        [params.access_token_id, context.user.user_id]
      );

      return json({ updated: affectedRows });
    },
  },
  {
    path: "/tokens/new",
    Component: Token,
    meta: () => ({
      title: "Token",
    }),
  },
  {
    path: "/privacy",
    Component: Privacy,
    meta: () => ({
      title: "Privacy",
    }),
  },
  {
    path: "/about",
    Component: About,
    meta: () => ({
      title: "About",
    }),
  },
  {
    path: "*",
    Component: NotFound,
    meta: () => ({
      title: "Not Found",
    }),
  },
];

export const routeHandler = createStaticHandler(routes as RouteObject[]);

// This converts an oak request object to a fetch request object.
export const createFetchRequest = async (req: OakRequest) => {
  // TODO: How does oak handle connections?
  //       The react-router docs handles this but is this really needed? 

  //const controller = new AbortController();
  //req.on("close", () => controller.abort());

  // TODO: Reading the body seems kinda unnecessary.
  return new Request(req.url.href, {
    method: req.method,
    headers: new Headers(req.headers),
    body: req.hasBody ? await req.body().value : null,
    //signal: controller.signal,
  });
};
