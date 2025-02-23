/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

export const NotFound = ({ resource }: { resource?: string }) => {
  return (
    <>
      <div className={tw`container md:flex items-center px-6 py-12 mx-auto`}>
        <div className={tw`wf-ull lg:w-1/2`}>
          <p className={tw`text-sm font-medium text-blue-500 dark:text-blue-400`}>
            404
          </p>
          <h1 className={tw`mt-3 text-2xl font-semibold text-gray-800 dark:text-white md:text-3xl`}>
            {resource ?? 'Page'} not found
          </h1>
          <p className={tw`mt-4 text-gray-500 dark:text-gray-400`}>
            The {resource?.toLowerCase() ?? 'page'} you are looking for does not exist or has been (re)moved.
          </p>
          <div className={tw`flex items-center mt-6 gap-x-3`}>
            <button
              type='button'
              id='not-found-go-back'
              className={tw`flex items-center justify-center w-1/2 px-5 py-2 text-sm text-gray-700 transition-colors duration-200 bg-white border rounded-lg gap-x-2 w-auto dark:hover:bg-gray-800 dark:bg-gray-900 hover:bg-gray-100 dark:text-gray-200 dark:border-gray-700`}
            >
              <svg
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 24 24'
                stroke-width='1.5'
                stroke='currentColor'
                className={tw`w-5 h-5 rtl:rotate-180`}
              >
                <path stroke-linecap='round' stroke-linejoin='round' d='M6.75 15.75L3 12m0 0l3.75-3.75M3 12h18' />
              </svg>
              <span>Go back</span>
            </button>
            <a href='/' tabIndex={-1}>
              <button
                type='button'
                className={tw`flex items-center w-1/2 px-5 py-2 text-sm tracking-wide text-white transition-colors duration-200 bg-blue-500 rounded-lg shrink-0 w-auto hover:bg-blue-600 dark:hover:bg-blue-500 dark:bg-blue-600`}
              >
                Take me home
              </button>
            </a>
          </div>
        </div>
        <div className={tw`relative w-full mt-8 lg:w-1/2 lg:mt-0`}>
          <img
            className={tw` w-full lg:h-[32rem] h-80 md:h-96 rounded-lg object-cover`}
            src='/storage/files/404.webp'
            alt='404'
          />
        </div>
      </div>
    </>
  );
};
