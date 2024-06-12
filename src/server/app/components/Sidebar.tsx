/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import Footer from './Footer.tsx';

const Sidebar = (
  { queued, pathname, username }: { queued: number; pathname: string; username?: string },
) => {
  return (
    <aside
      id='default-sidebar'
      tabIndex={-1}
      className={tw`lg:translate-x-0 fixed top-0 left-0 flex w-full flex-col justify-between fixed top-0 left-0 z-40 w-60 h-screen transition-transform -translate-x-full bg-white dark:bg-gray-900 dark:border-gray-900`}
      aria-label='Sidebar'
    >
      <div className={tw`h-full mt-[70px] px-3 pb-4 pt-4 overflow-y-auto bg-white dark:bg-gray-900`}>
        <ul className={tw`font-medium`}>
          <li>
            <a
              href='/'
              className={tw`flex items-center p-2 text-gray-900 rounded-lg dark:text-white ${
                pathname === '/'
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } group`}
            >
              <svg
                className={tw`w-6 h-6 text-gray-800 dark:text-white`}
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                fill='none'
                viewBox='0 0 24 24'
              >
                <path
                  stroke='currentColor'
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='m4 12 8-8 8 8M6 10.5V19a1 1 0 0 0 1 1h3v-3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h3a1 1 0 0 0 1-1v-8.5'
                />
              </svg>
              <span className={tw`ml-3`}>Home</span>
            </a>
          </li>
          <li>
            <a
              href='/status'
              className={tw`flex items-center p-2 text-gray-900 rounded-lg dark:text-white ${
                pathname === '/status'
                  ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                  : 'hover:bg-gray-200 dark:hover:bg-gray-800'
              } group`}
            >
              <svg
                className={tw`w-6 h-6 text-gray-800 dark:text-white`}
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                fill='none'
                viewBox='0 0 24 24'
              >
                <path stroke='currentColor' stroke-linecap='round' stroke-width='2' d='M5 7h14M5 12h14M5 17h10' />
              </svg>
              <span className={tw`flex-1 ml-3 whitespace-nowrap`}>Queue</span>
              {queued > 0 && (
                <span
                  className={tw`inline-flex items-center justify-center w-3 h-3 p-3 ml-3 text-sm font-medium text-blue-800 bg-blue-100 rounded-full dark:bg-blue-900 dark:text-blue-300`}
                >
                  {queued}
                </span>
              )}
            </a>
          </li>
        </ul>
        {username !== undefined && (
          <ul className={tw`pt-4 mt-4 space-y-2 font-medium border-t border-gray-200 dark:border-gray-700`}>
            <li>
              <a
                href={`/profile/${username}`}
                className={tw`flex items-center p-2 text-gray-900 rounded-lg dark:text-white ${
                  pathname === `/profile/${username}`
                    ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                } group`}
              >
                <svg
                  className={tw`w-6 h-6 text-gray-800 dark:text-white`}
                  aria-hidden='true'
                  xmlns='http://www.w3.org/2000/svg'
                  width='24'
                  height='24'
                  fill='none'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke='currentColor'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0a8.949 8.949 0 0 0 4.951-1.488A3.987 3.987 0 0 0 13 16h-2a3.987 3.987 0 0 0-3.951 3.512A8.948 8.948 0 0 0 12 21Zm3-11a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'
                  />
                </svg>
                <span className={tw`flex-1 ml-3 whitespace-nowrap`}>Your renders</span>
              </a>
            </li>
            {
              /* <li>
              <a
                href='/history'
                className={tw`flex items-center p-2 text-gray-900 rounded-lg dark:text-white ${
                  pathname === '/history'
                    ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                } group`}
              >
                <svg
                  className={tw`w-6 h-6 text-gray-800 dark:text-white`}
                  aria-hidden='true'
                  xmlns='http://www.w3.org/2000/svg'
                  width='24'
                  height='24'
                  fill='none'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke='currentColor'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                  />
                </svg>
                <span className={tw`flex-1 ml-3 whitespace-nowrap`}>History</span>
              </a>
            </li>
            <li>
              <a
                href='/bookmarks'
                className={tw`flex items-center p-2 text-gray-900 rounded-lg dark:text-white ${
                  pathname === '/bookmarks'
                    ? 'bg-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-800'
                } group`}
              >
                <svg
                  className={tw`w-6 h-6 text-gray-800 dark:text-white`}
                  aria-hidden='true'
                  xmlns='http://www.w3.org/2000/svg'
                  width='24'
                  height='24'
                  fill='none'
                  viewBox='0 0 24 24'
                >
                  <path
                    stroke='currentColor'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='m17 21-5-4-5 4V3.889a.92.92 0 0 1 .244-.629.808.808 0 0 1 .59-.26h8.333a.81.81 0 0 1 .589.26.92.92 0 0 1 .244.63V21Z'
                  />
                </svg>

                <span className={tw`flex-1 ml-3 whitespace-nowrap`}>Bookmarks</span>
              </a>
            </li> */
            }
          </ul>
        )}
      </div>
      <Footer />
    </aside>
  );
};

export default Sidebar;
