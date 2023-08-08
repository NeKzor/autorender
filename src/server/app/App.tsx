/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { AppDispatchContext, AppState, AppStateContext, reducer } from './AppState.ts';
import { RouteMeta } from './Routes.ts';

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
    `script-src 'nonce-${nonce}';`,
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com;`,
    `font-src 'self' https://fonts.gstatic.com;`,
    `media-src 'self' *.backblazeb2.com;`,
    `img-src 'self';`,
  ].join(' ');
};

type HeadProps = {
  initialState: AppState;
  nonce: string;
  children?: React.ReactNode;
};

type BodyProps = {
  initialState: AppState;
  children?: React.ReactNode;
};

export const Head = ({ initialState, nonce }: HeadProps) => {
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
      <meta http-equiv='Content-Security-Policy' content={getCSP(nonce)} />
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
    </>
  );
};

export const Body = ({ initialState, children }: BodyProps) => {
  const [state, dispatch] = React.useReducer(reducer, initialState);

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        {children}
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
};
