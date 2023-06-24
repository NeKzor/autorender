/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import {
  AppState,
  AppStateContext,
  AppDispatchContext,
  reducer,
} from "./AppState.ts";
import { RouteMeta } from "./Routes.ts";

const metaNames: (keyof RouteMeta)[] = [
  "title",
  "description",
  "og:type",
  "og:url",
  "og:title",
  "og:description",
  "og:image",
  "og:video",
  "twitter:type",
  "twitter:url",
  "twitter:title",
  "twitter:description",
  "twitter:image",
  "twitter:card",
];

type AppProps = {
  initialState: AppState;
  nonce: string;
  children?: React.ReactNode;
};

const App = ({ initialState, nonce, children }: AppProps) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);
  const { meta, domain } = state;
  const title = meta.title !== undefined ? `${meta.title} | ${domain}` : domain;

  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no"
        />
        <meta
          http-equiv="Content-Security-Policy"
          content={`
                default-src 'self';
                script-src 'nonce-${nonce}';
                style-src 'self' https://fonts.googleapis.com;
                font-src 'self' https://fonts.gstatic.com;
                media-src 'self' *.backblazeb2.com;
                img-src 'self';
              `}
        />
        <meta name="theme-color" content="#f44336" />
        {metaNames
          .filter((name) => meta[name] !== undefined)
          .map((name) => {
            return <meta name={name} content={meta[name]} />;
          })}
        <title>{title}</title>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css?family=Roboto:300,400,500"
        />
      </head>
      <body>
        <AppStateContext.Provider value={state}>
          <AppDispatchContext.Provider value={dispatch}>
            {children}
          </AppDispatchContext.Provider>
        </AppStateContext.Provider>
      </body>
    </html>
  );
};

export default App;
