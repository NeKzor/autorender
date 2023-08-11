/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { tw } from 'https://esm.sh/twind@0.16.16';
import { AppStateContext } from '../AppState.ts';
import { UserPermissions } from '../../../shared/models.ts';

const Navbar = () => {
  const state = React.useContext(AppStateContext);

  return (
    <nav
      className={tw`bg-white dark:bg-gray-900 fixed w-full z-20 top-0 left-0 border-b border-gray-200 dark:border-gray-600`}
    >
      <div className={tw`max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4`}>
        <a href='/' className={tw`flex items-center`}>
          <span className={tw`self-center text-2xl font-semibold whitespace-nowrap dark:text-white`}>Autorender</span>
        </a>
        <div className={tw`flex md:order-2`}>
          <button
            type='button'
            aria-expanded='false'
            className={tw`md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-1`}
          >
            <svg
              className={tw`w-5 h-5`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 20 20'
            >
              <path
                stroke='currentColor'
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z'
              />
            </svg>
            <span className={tw`sr-only`}>Search</span>
          </button>
          <div className={tw`relative hidden md:block`}>
            <div className={tw`absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none`}>
              <svg
                className={tw`w-4 h-4 text-gray-500 dark:text-gray-400`}
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 20 20'
              >
                <path
                  stroke='currentColor'
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z'
                />
              </svg>
              <span className={tw`sr-only`}>Search icon</span>
            </div>
            <input
              type='text'
              id='search-navbar'
              className={tw`block w-full p-2 pl-10 min-w-[400px] text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
              placeholder='Search...'
            />
          </div>
        </div>
        <div className={tw`flex items-center md:order-2`}>
          <button
            id='theme-toggle'
            type='button'
            className={tw`mr-4 text-gray-500 inline-flex items-center justify-center dark:text-gray-400 hover:bg-gray-100 w-10 h-10 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5`}
          >
            <svg
              id='theme-toggle-dark-icon'
              className={tw`hidden w-4 h-4`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='currentColor'
              viewBox='0 0 18 20'
            >
              <path d='M17.8 13.75a1 1 0 0 0-.859-.5A7.488 7.488 0 0 1 10.52 2a1 1 0 0 0 0-.969A1.035 1.035 0 0 0 9.687.5h-.113a9.5 9.5 0 1 0 8.222 14.247 1 1 0 0 0 .004-.997Z'>
              </path>
            </svg>
            <svg
              id='theme-toggle-light-icon'
              className={tw`hidden w-4 h-4`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path d='M10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-11a1 1 0 0 0 1-1V1a1 1 0 0 0-2 0v2a1 1 0 0 0 1 1Zm0 12a1 1 0 0 0-1 1v2a1 1 0 1 0 2 0v-2a1 1 0 0 0-1-1ZM4.343 5.757a1 1 0 0 0 1.414-1.414L4.343 2.929a1 1 0 0 0-1.414 1.414l1.414 1.414Zm11.314 8.486a1 1 0 0 0-1.414 1.414l1.414 1.414a1 1 0 0 0 1.414-1.414l-1.414-1.414ZM4 10a1 1 0 0 0-1-1H1a1 1 0 0 0 0 2h2a1 1 0 0 0 1-1Zm15-1h-2a1 1 0 1 0 0 2h2a1 1 0 0 0 0-2ZM4.343 14.243l-1.414 1.414a1 1 0 1 0 1.414 1.414l1.414-1.414a1 1 0 0 0-1.414-1.414ZM14.95 6.05a1 1 0 0 0 .707-.293l1.414-1.414a1 1 0 1 0-1.414-1.414l-1.414 1.414a1 1 0 0 0 .707 1.707Z'>
              </path>
            </svg>
            <span className={tw`sr-only`}>Toggle dark mode</span>
          </button>
          {state?.user
            ? (
              <>
                <button
                  type='button'
                  className={tw`flex mr-3 text-sm bg-gray-800 rounded-full md:mr-0 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600`}
                  id='user-menu-button'
                  aria-expanded='false'
                  data-dropdown-toggle='user-dropdown'
                  data-dropdown-placement='bottom'
                >
                  <img
                    className={tw`w-8 h-8 rounded-full`}
                    src={state.user.discord_avatar_url}
                    alt='user_avatar'
                  />
                </button>
                <div
                  className={tw`z-50 hidden my-4 text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 dark:divide-gray-600 min-w-[140px]`}
                  id='user-dropdown'
                >
                  <div className={tw`px-4 py-3`}>
                    <span className={tw`block text-sm text-gray-900 dark:text-white`}>{state.user.username}</span>
                    <span className={tw`block text-sm  text-gray-500 truncate dark:text-gray-400`}>
                      @{state.user.username}
                    </span>
                  </div>
                  <ul className={tw`py-2`} aria-labelledby='user-menu-button'>
                    <li>
                      <a
                        href={`/profile/${state?.user.username}`}
                        className={tw`block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white`}
                      >
                        Profile
                      </a>
                    </li>
                    {state?.user &&
                      !!(state.user.permissions & UserPermissions.CreateTokens) && (
                      <li>
                        <a
                          href='/tokens'
                          className={tw`block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white`}
                        >
                          Tokens
                        </a>
                      </li>
                    )}
                    <li>
                      <a
                        href='/logout'
                        className={tw`block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200 dark:hover:text-white`}
                      >
                        Sign out
                      </a>
                    </li>
                  </ul>
                </div>
                <button
                  type='button'
                  className={tw`inline-flex items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600`}
                  aria-expanded='false'
                >
                  <span className={tw`sr-only`}>Open main menu</span>
                  <svg
                    className={tw`w-5 h-5`}
                    aria-hidden='true'
                    xmlns='http://www.w3.org/2000/svg'
                    fill='none'
                    viewBox='0 0 17 14'
                  >
                    <path
                      stroke='currentColor'
                      stroke-linecap='round'
                      stroke-linejoin='round'
                      stroke-width='2'
                      d='M1 1h15M1 7h15M1 13h15'
                    />
                  </svg>
                </button>
              </>
            )
            : (
              <a href={state?.discordAuthorizeLink}>
                <button
                  className={tw`group relative flex select-none items-center gap-3 overflow-hidden rounded-lg bg-gradient-to-tr from-discord to-discord py-3.5 px-7 pr-[72px] text-center align-middle font-sans text-sm font-bold uppercase text-white shadow-md shadow-discord-500/20 transition-all hover:shadow-lg hover:shadow-discord/40 active:opacity-[0.85] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none`}
                  type='button'
                  data-ripple-light='true'
                >
                  Sign in with Discord
                  <span
                    className={tw`absolute right-0 grid h-full w-12 place-items-center bg-discord transition-colors group-hover:bg-discord`}
                  >
                    <img src='/images/icon_clyde_white_RGB.png' alt='clyde' className={tw`h-5 w-6`} />
                  </span>
                </button>
              </a>
            )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
