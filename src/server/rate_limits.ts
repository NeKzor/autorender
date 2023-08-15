/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { RouterMiddleware, Status, STATUS_TEXT } from 'oak/mod.ts';
import { RateLimiterAbstract, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { AppState } from './app/AppState.ts';

const buckets = {
  authorize: new RateLimiterMemory({
    points: 3,
    duration: 60,
  }),
  views: new RateLimiterMemory({
    points: 1,
    duration: 30,
  }),
};

// deno-lint-ignore no-explicit-any
type OakRouterMiddleware = RouterMiddleware<any, any, Record<string, any> & AppState>;

const tryConsume: (bucket: RateLimiterAbstract) => OakRouterMiddleware = (bucket) => async (ctx, next) => {
  try {
    await bucket.consume(`${ctx.request.ip}/${ctx.request.url.pathname}`, 1);
    await next();
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      ctx.response.status = Status.TooManyRequests;
      ctx.response.body = JSON.stringify({
        status: Status.TooManyRequests,
        message: STATUS_TEXT[Status.TooManyRequests],
      });
    } else {
      ctx.throw(500);
    }
  }
};

export const rateLimits: Record<keyof typeof buckets, OakRouterMiddleware> = {
  authorize: tryConsume(buckets.authorize),
  views: tryConsume(buckets.views),
};
