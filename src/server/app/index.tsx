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

  const scriptTag = `<script type="module" nonce="${nonce}">
${
    Deno.env.get('HOT_RELOAD')!.toLowerCase() === 'true'
      ? `(() => {
    let ws, to, iv = null;
    const hotReload = () => {
    ws?.close();
    ws = new WebSocket(location.origin.replace('http', 'ws') + '/connect/__hot_reload');
    ws.onopen = () => iv = setInterval(() => ws.send('reload?'), 500);
    ws.onmessage = (event) => event.data === 'yes' && location.reload();
    ws.onclose = () => clearInterval(iv) || clearTimeout(to) || (to = setTimeout(() => hotReload(), 500));
  };
  hotReload();
  })();`
      : ''
  }
if (location.pathname.startsWith('/videos/') && location.pathname.length === 19) {
  await fetch(\`/api/v1\${location.pathname}/views\`, { method: 'POST' });
}

const notFoundGoBack = document.querySelector('#not-found-go-back');
if (notFoundGoBack) {
  notFoundGoBack.addEventListener('click', () => {
    history.back();
  });
}

const isDarkMode = localStorage.getItem('color-theme') === 'dark';
const dark = document.getElementById('theme-toggle-dark-icon');
const light = document.getElementById('theme-toggle-light-icon');

if (isDarkMode ||
  (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  light.classList.remove('hidden');
  document.documentElement.classList.add('dark');
} else {
  dark.classList.remove('hidden');
  document.documentElement.classList.remove('dark')
}

const toggle = document.getElementById('theme-toggle');
if (toggle) {
  toggle.addEventListener('click', () => {
      dark.classList.toggle('hidden');
      light.classList.toggle('hidden');
  
      if (localStorage.getItem('color-theme')) {
          if (localStorage.getItem('color-theme') === 'light') {
              document.documentElement.classList.add('dark');
              localStorage.setItem('color-theme', 'dark');
          } else {
              document.documentElement.classList.remove('dark');
              localStorage.setItem('color-theme', 'light');
          }
      } else {
          if (document.documentElement.classList.contains('dark')) {
              document.documentElement.classList.remove('dark');
              localStorage.setItem('color-theme', 'light');
          } else {
              document.documentElement.classList.add('dark');
              localStorage.setItem('color-theme', 'dark');
          }
      }
  });
}
</script>`;

  return `<html lang='en' dir='ltr'><head>${head}${styleTag}</head><body class="dark:bg-gray-700 dark:text-white">${body}</body>${scriptTag}</html>`;
};
