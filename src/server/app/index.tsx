/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { renderToReadableStream } from "https://esm.sh/react-dom@18.2.0/server";
import { Route, Routes } from "https://esm.sh/react-router-dom@6.11.2";
import { StaticRouter } from "https://esm.sh/react-router-dom@6.11.2/server";
import Home from "./views/Home.tsx";
import Login from "./views/Login.tsx";
import NotFound from "./views/NotFound.tsx";
import Privacy from "./views/Privacy.tsx";

const domain = "autorender.portal2.local";

const isHotReloadEnabled = Deno.env.get("HOT_RELOAD")?.toLowerCase() === "yes";

const App = () => (
  <html lang="en" dir="ltr">
    <head>
      <meta charSet="utf-8" />
      <meta
        name="viewport"
        content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
      />
      <meta name="theme-color" content="#f44336" />
      <meta property="og:site_name" content={domain} />
      <meta property="og:type" content="object" />
      <meta property="og:title" content="Automatic demo render service" />
      <meta property="og:url" content={`https://${domain}`} />
      <meta
        property="og:description"
        content="Render, share and view demo renders."
      />
      <title>{domain}</title>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css?family=Roboto:300,400,500"
      />
    </head>
    <body>
      {isHotReloadEnabled && (
        <script src="https://deno.land/x/refresh@1.0.0/client.js"></script>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <footer>
        <div>
          <a href="/privacy">Privacy Notice</a>
        </div>
      </footer>
    </body>
  </html>
);

export const index = (location: string) => {
  console.log(location);
  return renderToReadableStream(
    <StaticRouter location={location}>
      <App />
    </StaticRouter>
  );
};
