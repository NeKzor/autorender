/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { renderToString } from 'https://esm.sh/react-dom@18.2.0/server';
import {
  createStaticRouter,
  StaticHandlerContext,
  StaticRouterProvider,
} from 'https://esm.sh/react-router-dom@6.11.2/server';
import { setup } from 'https://esm.sh/twind@0.16.16';
import { getStyleTag, virtualSheet } from 'https://esm.sh/twind@0.16.16/sheets';
import { Body, Head } from './App.tsx';
import { AppState } from './AppState.ts';

const sheet = virtualSheet();

setup({
  theme: {
    fontFamily: {
      sans: ['Roboto', 'sans-serif'],
    },
  },
  sheet,
});

export const index = (
  router: ReturnType<typeof createStaticRouter>,
  context: StaticHandlerContext,
  initialState: AppState,
) => {
  const nonce = crypto.randomUUID();

  sheet.reset();

  const head = renderToString(
    <Head initialState={initialState} nonce={nonce}>
    </Head>,
  );

  const body = renderToString(
    <Body initialState={initialState}>
      <StaticRouterProvider
        router={router}
        context={context}
        nonce={nonce}
        hydrate={false}
      />
    </Body>,
  );

  const styleTag = getStyleTag(sheet, { nonce });

  const scriptTag = Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true'
    ? `<script nonce="${nonce}">
(() => {
  let ws, to, iv = null;
  const hotReload = () => {
  ws?.close();
  ws = new WebSocket(location.origin.replace('http', 'ws') + '/connect/__hot_reload');
  ws.onopen = () => iv = setInterval(() => ws.send('reload?'), 500);
  ws.onmessage = (event) => event.data === 'yes' && location.reload();
  ws.onclose = () => clearInterval(iv) || clearTimeout(to) || (to = setTimeout(() => hotReload(), 500));
};
hotReload();
})();
</script>`
    : '';

  return `<html lang='en' dir='ltr'><head>${head}${styleTag}</head><body>${body}</body>${scriptTag}</html>`;
};
