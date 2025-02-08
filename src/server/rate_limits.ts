/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { RouterMiddleware, Status, STATUS_TEXT } from '@oak/oak';
import { RateLimiterAbstract, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { AppState } from './app/AppState.ts';

// deno-lint-ignore no-explicit-any
type OakRouterMiddleware = RouterMiddleware<any, any, Record<string, any> & AppState>;

const rateLimitMiddleware: (bucket: RateLimiterAbstract) => OakRouterMiddleware = (bucket) => async (ctx, next) => {
  let consumed = false;

  try {
    await bucket.consume(`${ctx.request.ip}/${ctx.request.url.pathname}`, 1);
    consumed = true;
  } catch (err) {
    if (err instanceof RateLimiterRes) {
      ctx.response.status = Status.TooManyRequests;
      ctx.response.body = JSON.stringify({
        status: Status.TooManyRequests,
        message: STATUS_TEXT[Status.TooManyRequests],
      });
    } else {
      throw new Error('Unknown rate limiter error', { cause: err });
    }
  }

  if (consumed) {
    await next();
  }
};

export const rateLimits = {
  authorize: rateLimitMiddleware(
    new RateLimiterMemory({
      points: 3,
      duration: 60,
    }),
  ),
  views: rateLimitMiddleware(
    new RateLimiterMemory({
      points: 1,
      duration: 30,
    }),
  ),
} as const;
