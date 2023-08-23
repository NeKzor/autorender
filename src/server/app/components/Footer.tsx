/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

const Footer = () => {
  return (
    <footer className={tw`bg-white shadow dark:bg-gray-900`}>
      <div className={tw`w-full mx-auto max-w-screen-xl p-4 flex items-center justify-between`}>
        <span className={tw`text-sm text-gray-500 text-center dark:text-gray-400`}>
          © 2023{' '}
          <a href='https://github.com/NeKzor' className={tw`hover:underline`}>
            NeKz
          </a>
        </span>
        <ul
          className={tw`flex flex-wrap items-center mb-6 gap-6 text-sm font-medium text-gray-500 mb-0 dark:text-gray-400`}
        >
          <li>
            <a href='https://discord.gg/p2sr' target='_blank' className={tw`hover:underline`}>
              Discord
            </a>
          </li>
          <li>
            <a href='/privacy' target='_blank' className={tw`hover:underline`}>
              Privacy Policy
            </a>
          </li>
          <li>
            <a
              href='https://github.com/NeKzor/autorender/issues/new/choose'
              target='_blank'
              className={tw`hover:underline`}
            >
              Report Issue
            </a>
          </li>
          <li>
            <a href='https://github.com/NeKzor/autorender' target='_blank' className={tw`hover:underline`}>
              Source Code
            </a>
          </li>
          <li>
            <a href='/status' className={tw`hover:underline`}>
              Status
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
};

export default Footer;
