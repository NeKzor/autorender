/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

const Footer = () => {
  return (
    <footer className={tw`floating bottom-0 left-0 z-50 bg-white dark:bg-gray-900`}>
      <div className={tw`w-full mx-auto max-w-screen-xl p-4 flex items-center justify-between`}>
        <ul
          className={tw`flex flex-wrap items-center gap-2 text-sm font-medium text-gray-500 mb-0 dark:text-gray-400`}
        >
          <li>
            <a href='https://discord.gg/p2sr' target='_blank' className={tw`hover:underline`}>
              Discord
            </a>
          </li>
          <li>
            <a href='https://github.com/NeKzor/autorender' target='_blank' className={tw`hover:underline`}>
              GitHub
            </a>
          </li>
          <li>
            <a href='/privacy' target='_blank' className={tw`hover:underline`}>
              Privacy
            </a>
          </li>
          <li>
            <a
              href='https://github.com/NeKzor/autorender/issues/new/choose'
              target='_blank'
              className={tw`hover:underline`}
            >
              Report
            </a>
          </li>
        </ul>
      </div>
      <div className={tw`w-full mx-auto max-w-screen-xl p-4 pt-0 flex items-center justify-between`}>
        <span className={tw`text-sm text-gray-500 text-center dark:text-gray-400`}>
          © 2024{' '}
          <a href='https://nekz.io' className={tw`hover:underline`}>
            NeKz
          </a>
        </span>
      </div>
    </footer>
  );
};

export default Footer;
