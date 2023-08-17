/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { AppStateContext } from '../AppState.ts';
import { UserPermissions } from '~/shared/models.ts';

const Navbar = () => {
  const state = React.useContext(AppStateContext);
  const searchValue = state?.url?.searchParams?.get('q') ?? undefined;

  return (
    <nav
      className={tw`bg-white dark:bg-gray-900 fixed w-full z-20 top-0 left-0`}
    >
      <div className={tw`max-w-screen-xl flex flex-wrap items-center justify-between mx-auto p-4`}>
        <div id='nav-items-left' className={tw`flex items-center`}>
          <a href='/' className={tw`self-center text-2xl font-semibold whitespace-nowrap dark:text-white`}>
            Autorender
          </a>
        </div>
        <div id='nav-search-items' className={tw`flex md:order-2`}>
          <button
            id='nav-back-button'
            type='button'
            aria-expanded='false'
            className={tw`hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-4`}
          >
            <svg
              className={tw`w-6 h-6 text-gray-800 dark:text-white`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 14 10'
            >
              <path
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='1'
                d='M13 5H1m0 0 4 4M1 5l4-4'
              />
            </svg>
          </button>
          <div id='nav-search' className={tw`flex relative hidden md:block w-full`}>
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
            </div>
            <input
              type='text'
              id='nav-search-input'
              className={tw`block w-full p-2 pl-10 md:min-w-[300px] lg:min-w-[400px] text-sm text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-gray-500 focus:border-gray-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-gray-500 dark:focus:border-gray-500`}
              placeholder='Search'
              value={searchValue}
              autoComplete='off'
            />
            <button
              id='nav-search-input-clear-button'
              type='button'
              className={tw`${searchValue ? ' ' : 'hidden'}absolute inset-y-0 right-0 flex items-center px-3`}
            >
              <svg
                className='w-4 h-4 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                aria-hidden='true'
                xmlns='http://www.w3.org/2000/svg'
                fill='none'
                viewBox='0 0 14 14'
              >
                <path
                  stroke='currentColor'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='1'
                  d='m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6'
                />
              </svg>
            </button>
          </div>
        </div>
        <div id='nav-items-right' className={tw`flex items-center md:order-3`}>
          <button
            id='nav-search-button'
            type='button'
            aria-expanded='false'
            className={tw`md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-2`}
          >
            <svg
              className={tw`w-6 h-6 text-gray-800 dark:text-white`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 20 20'
            >
              <path
                stroke='currentColor'
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='1'
                d='m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z'
              />
            </svg>
          </button>
          <button
            id='theme-toggle-button'
            type='button'
            className={tw`text-gray-500 inline-flex items-center justify-center dark:text-gray-400 hover:bg-gray-100 w-10 h-10 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 mr-4`}
          >
            <svg
              id='theme-toggle-dark-icon'
              className={tw`hidden w-6 h-6 text-gray-800 dark:text-white`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='currentColor'
              viewBox='0 0 18 20'
            >
              <path d='M17.8 13.75a1 1 0 0 0-.859-.5A7.488 7.488 0 0 1 10.52 2a1 1 0 0 0 0-.969A1.035 1.035 0 0 0 9.687.5h-.113a9.5 9.5 0 1 0 8.222 14.247 1 1 0 0 0 .004-.997Z' />
            </svg>
            <svg
              id='theme-toggle-light-icon'
              className={tw`hidden w-6 h-6 text-gray-800 dark:text-white`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path d='M10 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-11a1 1 0 0 0 1-1V1a1 1 0 0 0-2 0v2a1 1 0 0 0 1 1Zm0 12a1 1 0 0 0-1 1v2a1 1 0 1 0 2 0v-2a1 1 0 0 0-1-1ZM4.343 5.757a1 1 0 0 0 1.414-1.414L4.343 2.929a1 1 0 0 0-1.414 1.414l1.414 1.414Zm11.314 8.486a1 1 0 0 0-1.414 1.414l1.414 1.414a1 1 0 0 0 1.414-1.414l-1.414-1.414ZM4 10a1 1 0 0 0-1-1H1a1 1 0 0 0 0 2h2a1 1 0 0 0 1-1Zm15-1h-2a1 1 0 1 0 0 2h2a1 1 0 0 0 0-2ZM4.343 14.243l-1.414 1.414a1 1 0 1 0 1.414 1.414l1.414-1.414a1 1 0 0 0-1.414-1.414ZM14.95 6.05a1 1 0 0 0 .707-.293l1.414-1.414a1 1 0 1 0-1.414-1.414l-1.414 1.414a1 1 0 0 0 .707 1.707Z' />
            </svg>
          </button>
          {state?.user
            ? (
              <>
                <button
                  id='user-menu-button'
                  type='button'
                  className={tw`flex mr-3 text-sm bg-gray-800 rounded-full md:mr-0 focus:ring-4 focus:ring-gray-300 dark:focus:ring-gray-600`}
                  aria-expanded='false'
                  data-dropdown-toggle='user-menu-dropdown'
                  data-dropdown-placement='bottom'
                >
                  <img
                    className={tw`w-8 h-8 rounded-full`}
                    src={state.user.discord_avatar_url}
                    alt='user_avatar'
                  />
                </button>
                <div
                  id='user-menu-dropdown'
                  className={tw`z-50 hidden my-4 text-base list-none bg-white divide-y divide-gray-100 rounded-lg shadow dark:bg-gray-700 dark:divide-gray-600 min-w-[140px]`}
                >
                  <div className={tw`px-4 py-3`}>
                    <span className={tw`block text-sm text-gray-900 dark:text-white`}>{state.user.username}</span>
                    <span className={tw`block text-sm text-gray-500 truncate dark:text-gray-400`}>
                      {state.user.username}
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
              </>
            )
            : (
              <a id='login-button' href={state?.discordAuthorizeLink} tabIndex={-1}>
                <button
                  className={tw`group relative flex select-none items-center gap-3 overflow-hidden rounded-lg bg-gradient-to-tr from-discord to-discord px-3 py-2 text-center align-middle font-sans text-sm font-bold uppercase text-white shadow-md shadow-discord-500/20 transition-all hover:shadow-lg hover:shadow-discord/40 active:opacity-[0.85] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none`}
                  type='button'
                  data-ripple-light='true'
                >
                  Sign in with Discord
                  <img src='/assets/images/icon_clyde_white_RGB.png' alt='clyde' className={tw`h-5 w-6`} />
                </button>
              </a>
            )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
