/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

const RerenderModal = ({ isCoop }: { isCoop: boolean }) => {
  return (
    <div
      id='rerender-modal'
      tabIndex={-1}
      aria-hidden='true'
      className={tw`hidden flex fixed top-0 left-0 right-0 z-50 w-full p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full`}
    >
      <div className={tw`relative w-full max-w-sm max-h-full`}>
        <div className={tw`relative bg-white rounded-lg shadow dark:bg-gray-800`}>
          <button
            id='rerender-modal-close-button'
            type='button'
            className={tw`absolute top-3 right-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white`}
            data-modal-hide='rerender-modal'
          >
            <svg
              className={tw`w-3 h-3`}
              aria-hidden='true'
              xmlns='http://www.w3.org/2000/svg'
              fill='none'
              viewBox='0 0 14 14'
            >
              <path
                stroke='currentColor'
                stroke-linecap='round'
                stroke-linejoin='round'
                stroke-width='2'
                d='m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6'
              />
            </svg>
          </button>
          <div className={tw`px-6 py-6 lg:px-8`}>
            <div>
              <label className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}>
                Rerender
              </label>
              <div className={tw`mt-2`}>
                <div className={tw`flex items-center mr-4 mb-2 mt-2`}>
                  <input
                    id='rerender-modal-repair-checkbox'
                    type='checkbox'
                    className={tw`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600`}
                  />
                  <label
                    htmlFor='rerender-modal-repair-checkbox'
                    className={tw`ml-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                  >
                    Run Demo Repair (experimental)
                  </label>
                </div>
                <div className={tw`flex items-center mr-4 mb-2`}>
                  <input
                    id='rerender-modal-snd-restart-checkbox'
                    type='checkbox'
                    className={tw`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600`}
                  />
                  <label
                    htmlFor='rerender-modal-snd-restart-checkbox'
                    className={tw`ml-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                  >
                    Disable snd_restart
                  </label>
                </div>
                {isCoop && (
                  <div className={tw`flex items-center mr-4 mb-2`}>
                    <input
                      id='rerender-modal-skip-coop-checkbox'
                      type='checkbox'
                      className={tw`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600`}
                    />
                    <label
                      htmlFor='rerender-modal-skip-coop-checkbox'
                      className={tw`ml-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                    >
                      Disable sar_render_skip_coop_videos
                    </label>
                  </div>
                )}
              </div>
            </div>
            <button
              id='rerender-modal-queue-button'
              data-tooltip-trigger='none'
              className={tw`w-full mt-2 text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800`}
            >
              Add to queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RerenderModal;
