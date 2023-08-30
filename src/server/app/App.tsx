/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { AppDispatchContext, AppState, AppStateContext, reducer } from './AppState.ts';
import { RouteMeta } from './Routes.ts';
import Navbar from './components/Navbar.tsx';
import Footer from './components/Footer.tsx';

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
    `script-src 'nonce-${nonce}' cdnjs.cloudflare.com;`,
    `style-src 'nonce-${nonce}' cdnjs.cloudflare.com https://fonts.googleapis.com;`,
    `font-src 'self' https://fonts.gstatic.com;`,
    `media-src 'self' blob: *.backblazeb2.com;`,
    `img-src 'self' data: cdn.discordapp.com *.backblazeb2.com;`,
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
      <link
        rel='stylesheet'
        href='https://fonts.googleapis.com/css?family=Roboto:300,400,500'
      />
      <link
        rel='stylesheet'
        href='https://cdnjs.cloudflare.com/ajax/libs/flowbite/1.8.0/flowbite.min.css'
        integrity='sha384-SU26Q8fNMYupAr9UoLFL3sKttAwvXrmP7SdUWaw146+7I1kWXTlg5gA6X1Z70FKS'
        crossOrigin='anonymous'
      />
      <script
        src='https://cdnjs.cloudflare.com/ajax/libs/flowbite/1.8.0/flowbite.min.js'
        integrity='sha384-SXh3DHBSUxvOFk7+R9qN3hv+DtgPJz4vQwOArU6zxWGnvtR1sy+XmzKUkNh2qWST'
        crossOrigin='anonymous'
        defer
      />
    </>
  );
};

export const Body = ({ initialState, children }: BodyProps) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <div className={tw`flex flex-col h-screen`}>
          <Navbar />
          <div className={tw`mt-[88px] m-4 grow`}>
            {children}
          </div>
          <Footer />
        </div>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
};
