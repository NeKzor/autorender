/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  json as routerJson,
  redirect as routerRedirect,
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
  STATUS_TEXT,
  Request as OakRequest,
} from "https://deno.land/x/oak@v12.2.0/mod.ts";
import { createStaticHandler } from "https://esm.sh/react-router-dom@6.11.2/server";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import * as _bcrypt_worker from "https://deno.land/x/bcrypt@v0.4.1/src/worker.ts";
import Home from "./views/Home.tsx";
import NotFound from "./views/NotFound.tsx";
import About from "./views/About.tsx";
import Token from "./views/Token.tsx";
import Tokens from "./views/Tokens.tsx";
import Privacy from "./views/Privacy.tsx";
import * as ProfileView from "./views/Profile.tsx";
import * as VideoView from "./views/Video.tsx";
import { Database } from "../db.ts";
import {
  AccessPermission,
  AccessToken,
  User,
  UserPermissions,
} from "../models.ts";

const createResponse = (status: Status) =>
  new Response(STATUS_TEXT[status], { status: status });

export const notFound = () => createResponse(Status.NotFound);
export const unauthorized = () => createResponse(Status.Unauthorized);
export const badRequest = () => createResponse(Status.BadRequest);
export const internalServerError = () =>
  createResponse(Status.InternalServerError);

export const json = routerJson;
export const redirect = routerRedirect;
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

export type OpenGraphFacebook =
  | "type"
  | "url"
  | "title"
  | "description"
  | "image";
export type OpenGraphTwitter = OpenGraphFacebook;
export type OpenGraphTwitterCard =
  | "summary"
  | "summary_large_image"
  | "app"
  | "player";

// This allows every route to change the page's meta values.
export type RouteMeta = {
  title?: string;
  description?: string;
  ["twitter:card"]?: OpenGraphTwitterCard;
} & { [key in `og:${OpenGraphFacebook}`]?: string } & {
  [key in `twitter:${OpenGraphTwitter}`]?: string;
};

export type PageMeta<Data> = (loaderData: Data) => RouteMeta;

// deno-lint-ignore no-explicit-any
export type Route<Context, Data = any> = Omit<
  RouteObject,
  "loader" | "action"
> & {
  loader?: LoaderFunction<Context>;
  action?: LoaderFunction<Context>;
  meta?: PageMeta<Data>;
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
    path: "/profile/:username",
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
    loader: async ({ context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      const { rows } = await context.db.execute(
        `select * from access_tokens where user_id = ? order by created_at`,
        [context.user.user_id]
      );

      return json(rows ?? []);
    },
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
    action: async ({ params, request, context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      type PostFormData = Partial<Pick<AccessToken, "token_name">>;
      const { token_name } = Object.fromEntries(
        await request.formData()
      ) as PostFormData;

      if (!token_name || token_name.length < 3 || token_name.length > 32) {
        return badRequest();
      }

      const { affectedRows } = await context.db.execute(
        `update access_tokens set token_name = ? where access_token_id = ? and user_id = ?`,
        [token_name, params.access_token_id, context.user.user_id]
      );

      if (affectedRows !== 1) {
        return unauthorized();
      }

      return redirect("/tokens/" + params.access_token_id);
    },
  },
  {
    path: "/tokens/:access_token_id/delete",
    meta: () => ({
      title: "Token",
    }),
    action: async ({ params, context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      const { affectedRows } = await context.db.execute(
        `delete from access_tokens where access_token_id = ? and user_id = ?`,
        [params.access_token_id, context.user.user_id]
      );

      if (affectedRows !== 1) {
        return unauthorized();
      }

      return redirect("/tokens");
    },
  },
  {
    path: "/tokens/create",
    meta: () => ({
      title: "Token",
    }),
    Component: Token,
    loader: ({ context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      // if (!(context.user.permissions & UserPermissions.CreateTokens)) {
      //   return unauthorized();
      // }

      return json<Partial<AccessToken>>({
        token_name: "",
        token_key: "",
      });
    },
  },
  {
    path: "/tokens/new",
    meta: () => ({
      title: "Token",
    }),
    action: async ({ request, context }) => {
      if (!context.user?.user_id) {
        return unauthorized();
      }

      // if (!(context.user.permissions & UserPermissions.CreateTokens)) {
      //   return unauthorized();
      // }

      type PostFormData = Partial<Pick<AccessToken, "token_name">>;
      const { token_name } = Object.fromEntries(
        await request.formData()
      ) as PostFormData;

      if (!token_name || token_name.length < 3 || token_name.length > 32) {
        return badRequest();
      }

      const { affectedRows, lastInsertId } = await context.db.execute(
        `insert into access_tokens (
              user_id
            , token_name
            , token_key
            , permissions
          ) values (
              ?
            , ?
            , ?
            , ?
          )`,
        [
          context.user.user_id,
          token_name,
          await bcrypt.hash(crypto.randomUUID()),
          AccessPermission.CreateVideos | AccessPermission.WriteVideos,
        ]
      );

      if (affectedRows !== 1) {
        return internalServerError();
      }

      return redirect("/tokens/" + lastInsertId);
    },
  },
  {
    // TODO: Support unlisted/private videos.
    //       This will require UUIDs... private videos will be tough :>
    path: "/videos/:video_id",
    Component: VideoView.VideoView,
    meta: VideoView.meta,
    loader: VideoView.loader,
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
