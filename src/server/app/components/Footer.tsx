/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { tw } from 'https://esm.sh/twind@0.16.16';

const Footer = () => {
  return (
    <footer className={tw`bg-white shadow dark:bg-gray-900`}>
      <div className={tw`w-full max-w-screen-xl mx-auto p-4 md:py-8`}>
        <div className={tw`sm:flex sm:items-center sm:justify-between`}>
          <a href='/' className={tw`flex items-center mb-4 sm:mb-0`}>
            <span className={tw`self-center text-2xl font-semibold whitespace-nowrap dark:text-white`}>
              Autorender
            </span>
          </a>
          <ul
            className={tw`flex flex-wrap items-center mb-6 text-sm font-medium text-gray-500 sm:mb-0 dark:text-gray-400`}
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
        <hr className={tw`my-6 border-gray-200 sm:mx-auto dark:border-gray-700`} />
        <span className={tw`block text-sm text-gray-500 sm:text-center dark:text-gray-400`}>
          © 2023{' '}
          <a href='https://github.com/NeKzor' className={tw`hover:underline`}>
            NeKz
          </a>
        </span>
      </div>
    </footer>
  );
};

export default Footer;
