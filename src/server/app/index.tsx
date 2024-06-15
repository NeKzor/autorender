/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticRouter, StaticHandlerContext, StaticRouterProvider } from 'react-router-dom/server';
import { setup } from 'twind';
import { getStyleTag, virtualSheet } from 'twind/sheets';
import { Body, Head } from './App.tsx';
import { AppState } from './AppState.ts';

// NOTE: Always bump this version before deployment when module.js changed.
const jsModuleVersion = '1.0.5';

const isHotReloadEnabled = Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true';

const sheet = virtualSheet();

setup({
  theme: {
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
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

  const extraStyleTag =
    `<style nonce="${nonce}">.video-card:hover{box-shadow:0 0 0 10px #E5E7EB;}:is(.dark .video-card:hover){box-shadow:0 0 0 10px #1F2937;}</style>`;

  const themeScriptTag =
    `<script nonce="${nonce}">const theme=localStorage.getItem('color-theme')??'dark';theme==='light'&&document.documentElement.classList.remove('dark');document.documentElement.style.setProperty('color-scheme',theme)</script>`;

  const moduleScriptTag =
    `<script nonce="${nonce}" src="/assets/js/module.js?v=${jsModuleVersion}" type="module"></script>`;

  const hotReloadScriptTag = isHotReloadEnabled
    ? `<script nonce="${nonce}" src="/assets/js/hot_reload.js" type="module"></script>`
    : '';

  const headTag =
    `<head>${head}${styleTag}${extraStyleTag}${themeScriptTag}${moduleScriptTag}${hotReloadScriptTag}</head>`;
  const bodyTag = `<body class="dark:bg-gray-900 dark:text-white">${body}</body>`;

  return `<!DOCTYPE html><html lang='en' dir='ltr' class="dark">${headTag}${bodyTag}</html>`;
};
