/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { renderToReadableStream } from "https://esm.sh/react-dom@18.2.0/server";
import { StaticRouter } from "https://esm.sh/react-router-dom@6.11.2/server";
import App from "./App.tsx";
import { AppState } from "./AppState.ts";

export const index = (location: string, initialState: AppState) => {
  return renderToReadableStream(
    <StaticRouter location={location}>
      <App initialState={initialState} />
    </StaticRouter>,
    {
      bootstrapScriptContent:
        Deno.env.get("HOT_RELOAD")?.toLowerCase() === "yes"
          ? `(() => {
  let ws = null;
  let timer = null;
  let message = null;
  const hotReload = () => {
      ws?.close();
      ws = new WebSocket(location.origin.replace('http', 'ws') + '/__hot_reload');
      ws.onopen = () => message = setInterval(() => ws.send('reload?'), 1_000);
      ws.onmessage = (event) => event.data === 'yes' && location.reload();
      ws.onclose = () => clearTimeout(message) || clearTimeout(timer) || (timer = setTimeout(() => hotReload(), 1_000));
  };
  hotReload();
})();`
          : undefined,
    }
  );
};
