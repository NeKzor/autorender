/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { AppDispatchContext, AppState, AppStateContext, reducer } from './AppState.ts';
import { RouteMeta } from './Routes.ts';
import Navbar from './components/Navbar.tsx';
import Sidebar from './components/Sidebar.tsx';

const metaNames: (keyof RouteMeta)[] = [
  'title',
  'description',
  'og:type',
  'og:url',
  'og:title',
  'og:description',
  'og:image',
  'og:video',
  'twitter:type',
  'twitter:url',
  'twitter:title',
  'twitter:description',
  'twitter:image',
  'twitter:card',
];

const getCSP = (nonce: string) => {
  return [
    `default-src 'self';`,
    `script-src 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:;`,
    `style-src-elem 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline' https:;`,
    `style-src 'nonce-${nonce}';`,
    `font-src 'self' https://fonts.gstatic.com;`,
    `media-src 'self' blob: *.backblazeb2.com *.b-cdn.net;`,
    `img-src 'self' data: cdn.discordapp.com *.backblazeb2.com *.b-cdn.net;`,
    `object-src 'none';`,
    `base-uri 'none';`,
  ].join(' ');
};

type HeadProps = {
  initialState: AppState;
  children?: React.ReactNode;
};

type BodyProps = {
  initialState: AppState;
  children?: React.ReactNode;
};

export const Head = ({ initialState }: HeadProps) => {
  const [state] = React.useReducer(reducer, initialState);
  const { meta, domain } = state;
  const title = meta.title !== undefined ? `${meta.title} | ${domain}` : domain;

  return (
    <>
      <meta charSet='utf-8' />
      <meta
        name='viewport'
        content='minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no'
      />
      <meta http-equiv='Content-Security-Policy' content={getCSP(state.nonce)} />
      <meta name='referrer' content='no-referrer' />
      <meta name='theme-color' content='#f44336' />
      {metaNames
        .filter((name) => meta[name] !== undefined && meta[name] !== null)
        .map((name) => {
          return <meta name={name} content={meta[name]} />;
        })}
      <title>{title}</title>
      <meta name='description' content='Render Portal 2 demos on-demand!' />
      <link rel='preconnect' href='https://fonts.googleapis.com' />
      <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
      <link
        href='https://fonts.googleapis.com/css2?family=Inter:wght@300..600&display=swap'
        rel='stylesheet'
        nonce={state.nonce}
      />
      <link
        rel='stylesheet'
        href='https://cdnjs.cloudflare.com/ajax/libs/flowbite/1.8.0/flowbite.min.css'
        integrity='sha384-SU26Q8fNMYupAr9UoLFL3sKttAwvXrmP7SdUWaw146+7I1kWXTlg5gA6X1Z70FKS'
        crossOrigin='anonymous'
        nonce={state.nonce}
      />
      <script
        src='https://cdnjs.cloudflare.com/ajax/libs/flowbite/1.8.0/flowbite.min.js'
        integrity='sha384-SXh3DHBSUxvOFk7+R9qN3hv+DtgPJz4vQwOArU6zxWGnvtR1sy+XmzKUkNh2qWST'
        crossOrigin='anonymous'
        nonce={state.nonce}
        defer
      />
    </>
  );
};

export const Body = ({ initialState, children }: BodyProps) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  const pathname = state.url.pathname;

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className={tw`flex flex-col h-screen`}>
          <Navbar />
          <Sidebar
            pathname={pathname}
            username={state.user?.username}
          />
          <main className={tw`m-4 mt-[70px] lg:ml-60 grow`}>
            {children}
          </main>
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
};
