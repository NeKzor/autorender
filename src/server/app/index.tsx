/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { renderToReadableStream } from 'https://esm.sh/react-dom@18.2.0/server';
import {
  createStaticRouter,
  StaticHandlerContext,
  StaticRouterProvider,
} from 'https://esm.sh/react-router-dom@6.11.2/server';
import App from './App.tsx';
import { AppState } from './AppState.ts';

export const index = (
  router: ReturnType<typeof createStaticRouter>,
  context: StaticHandlerContext,
  initialState: AppState,
) => {
  const nonce = crypto.randomUUID();

  return renderToReadableStream(
    <App initialState={initialState} nonce={nonce}>
      <StaticRouterProvider
        router={router}
        context={context}
        nonce={nonce}
        hydrate={false}
      />
    </App>,
    {
      nonce,
      bootstrapScriptContent: Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true'
        ? `(() => {
  let ws, to, iv = null;
  const hotReload = () => {
      ws?.close();
      ws = new WebSocket(location.origin.replace('http', 'ws') + '/__hot_reload');
      ws.onopen = () => iv = setInterval(() => ws.send('reload?'), 500);
      ws.onmessage = (event) => event.data === 'yes' && location.reload();
      ws.onclose = () => clearInterval(iv) || clearTimeout(to) || (to = setTimeout(() => hotReload(), 500));
  };
  hotReload();
})();`
        : undefined,
    },
  );
};
