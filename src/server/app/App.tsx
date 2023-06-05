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

const domain = "autorender.portal2.local";

type AppProps = {
  initialState: AppState;
  nonce: string;
  children?: React.ReactNode;
};

const App = ({ initialState, nonce, children }: AppProps) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

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
                img-src 'self';
              `}
        />
        <meta name="referrer" content="no-referrer" />
        <meta name="theme-color" content="#f44336" />
        <meta property="og:site_name" content={domain} />
        <meta property="og:type" content="object" />
        <meta property="og:title" content="Automatic demo render service" />
        <meta property="og:url" content={`https://${domain}`} />
        <meta
          property="og:description"
          content="Render, share and view demo renders."
        />
        <title>{state.meta.title + ' | ' + domain}</title>
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
