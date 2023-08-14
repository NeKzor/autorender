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
    colors: {
      discord: {
        DEFAULT: '#5865F2',
      },
    },
  },
  sheet,
  darkMode: 'media',
  mode: 'silent',
});

export const index = (
  router: ReturnType<typeof createStaticRouter>,
  context: StaticHandlerContext,
  initialState: AppState,
) => {
  const nonce = initialState.nonce;

  sheet.reset();

  const head = renderToString(
    <Head initialState={initialState} />,
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

  const themeScriptTag =
    `<script nonce="${nonce}">localStorage.getItem('color-theme')==='dark'&&document.documentElement.classList.add('dark')</script>`;

  const moduleScriptTag = `<script nonce="${nonce}" src="/assets/js/module.js" type="module"></script>`;

  const hotReloadScriptTag = Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true'
    ? `<script nonce="${nonce}" src="/assets/js/hot_reload.js" type="module"></script>`
    : '';

  const headTag = `<head>${head}${styleTag}${themeScriptTag}${moduleScriptTag}${hotReloadScriptTag}</head>`;
  const bodyTag = `<body class="dark:bg-gray-700 dark:text-white">${body}</body>`;

  return `<html lang='en' dir='ltr'>${headTag}${bodyTag}</html>`;
};
