/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/v131/react@18.2.0';
import { tw } from 'https://esm.sh/v131/twind@0.16.16';

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
          className={tw`flex flex-wrap items-center mb-6 text-sm font-medium text-gray-500 mb-0 dark:text-gray-400`}
        >
          <li>
            <a href='https://discord.gg/p2sr' target='_blank' className={tw`mr-4 hover:underline md:mr-6 `}>
              Discord
            </a>
          </li>
          <li>
            <a href='/privacy' target='_blank' className={tw`mr-4 hover:underline md:mr-6`}>
              Privacy Policy
            </a>
          </li>
          <li>
            <a
              href='https://github.com/NeKzor/autorender/issues/new'
              target='_blank'
              className={tw`mr-4 hover:underline md:mr-6 `}
            >
              Report Issue
            </a>
          </li>
          <li>
            <a href='https://github.com/NeKzor/autorender' target='_blank' className={tw`hover:underline`}>
              Source Code
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
};

export default Footer;
