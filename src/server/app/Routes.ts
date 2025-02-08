/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  json as routerJson,
  redirect as routerRedirect,
  RouteObject,
  useLoaderData as routerUseLoaderData,
} from 'react-router-dom';
import {
  ActionFunction as RemixActionFunction,
  LoaderFunction as RemixLoaderFunction,
  Params,
} from '@remix-run/router';
import { Request as OakRequest, Status, STATUS_TEXT } from '@oak/oak';
import { createStaticHandler } from 'react-router-dom/server';

import * as Home from './views/Home.tsx';
import * as Search from './views/Search.tsx';
import * as NotFound from './views/NotFound.tsx';
import * as Token from './views/tokens/Token.tsx';
import * as Tokens from './views/tokens/Index.tsx';
import * as Privacy from './views/Privacy.tsx';
import * as ProfileView from './views/Profile.tsx';
import * as Render from './views/Render.tsx';
import * as VideoView from './views/Video.tsx';
import * as StatusView from './views/Status.tsx';
import { Database } from '../db.ts';
import { User } from '~/shared/models.ts';

const throwStatus = (status: Status) => {
  throw new Response(null, { status: status, statusText: STATUS_TEXT[status] });
};

// Thanks TypeScript :>
export type NeverFn = () => never;

export const notFound: NeverFn = () => throwStatus(Status.NotFound);
export const unauthorized: NeverFn = () => throwStatus(Status.Unauthorized);
export const badRequest: NeverFn = () => throwStatus(Status.BadRequest);
export const internalServerError: NeverFn = () => throwStatus(Status.InternalServerError);

export const json = routerJson;
export const redirect = routerRedirect;
export const useLoaderData = <T>() => routerUseLoaderData() as T;

// This gives us access to the authenticated user
// and the db instance in every loader function :^)
export interface RequestContext {
  user: User | null;
  db: Database;
  url: URL;
}

// This adds type-safety for using context.
interface DataFunctionArgs<Context> {
  request: Request;
  params: Params;
  context: Context;
}
interface LoaderFunctionArgs<Context> extends DataFunctionArgs<Context> {}
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
  | 'type'
  | 'url'
  | 'title'
  | 'description'
  | 'image'
  | 'video';
export type OpenGraphTwitter = OpenGraphFacebook;
export type OpenGraphTwitterCard =
  | 'summary'
  | 'summary_large_image'
  | 'app'
  | 'player';

// This allows every route to change the page's meta values.
export type RouteMeta =
  & {
    title?: string;
    description?: string;
    ['twitter:card']?: OpenGraphTwitterCard;
  }
  & { [key in `og:${OpenGraphFacebook}`]?: string }
  & {
    [key in `twitter:${OpenGraphTwitter}`]?: string;
  };

export type PageMeta<Data> = (args: { data: Data; context: RequestContext }) => RouteMeta;

// deno-lint-ignore no-explicit-any
export type Route<Context, Data = any> =
  & Omit<
    RouteObject,
    'loader' | 'action'
  >
  & {
    loader?: LoaderFunction<Context>;
    action?: LoaderFunction<Context>;
    meta?: PageMeta<Data>;
  };

export const routes: Route<RequestContext>[] = [
  {
    path: '/',
    Component: Home.Home,
    meta: Home.meta,
    loader: Home.loader,
  },
  {
    path: '/search',
    caseSensitive: true,
    Component: Search.Search,
    meta: Search.meta,
    loader: Search.loader,
  },
  {
    path: '/profile/:username',
    caseSensitive: true,
    Component: ProfileView.Profile,
    meta: ProfileView.meta,
    loader: ProfileView.loader,
  },
  {
    path: '/render/:game/:id',
    caseSensitive: true,
    Component: Render.Render,
    meta: Render.meta,
    loader: Render.loader,
    action: Render.action,
  },
  {
    path: '/tokens',
    caseSensitive: true,
    Component: Tokens.Tokens,
    meta: Tokens.meta,
    loader: Tokens.loader,
  },
  {
    path: '/tokens/:access_token_id',
    caseSensitive: true,
    Component: Token.Token,
    meta: Token.meta,
    loader: Token.loader,
    action: Token.action,
  },
  {
    path: '/tokens/:access_token_id/delete',
    caseSensitive: true,
    meta: Token.meta,
    action: Token.actionDelete,
  },
  {
    path: '/tokens/create',
    caseSensitive: true,
    meta: Token.meta,
    Component: Token.Token,
    loader: Token.loaderCreate,
  },
  {
    path: '/tokens/new',
    caseSensitive: true,
    meta: Token.meta,
    action: Token.actionNew,
  },
  {
    path: '/queue/:share_id',
    caseSensitive: true,
    Component: VideoView.VideoView,
    meta: VideoView.meta,
    loader: VideoView.loader,
  },
  {
    path: '/videos/:share_id',
    caseSensitive: true,
    Component: VideoView.VideoView,
    meta: VideoView.meta,
    loader: VideoView.loader,
  },
  {
    path: '/privacy',
    caseSensitive: true,
    Component: Privacy.Privacy,
    meta: () => ({
      title: 'Privacy',
    }),
  },
  {
    path: '/status',
    caseSensitive: true,
    Component: StatusView.Status,
    meta: StatusView.meta,
    loader: StatusView.loader,
  },
  {
    path: '*',
    Component: NotFound.NotFound,
    meta: () => ({
      title: 'Not Found',
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
    body: req.hasBody ? await req.body.init() : null,
    //signal: controller.signal,
  });
};
