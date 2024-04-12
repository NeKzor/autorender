/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

const DeleteModal = () => {
  return (
    <div
      id='delete-modal'
      tabIndex={-1}
      aria-hidden='true'
      className={tw`hidden flex fixed top-0 left-0 right-0 z-50 w-full p-4 overflow-x-hidden overflow-y-auto md:inset-0 h-[calc(100%-1rem)] max-h-full`}
    >
      <div className={tw`relative w-full max-w-sm max-h-full`}>
        <div className={tw`relative bg-white rounded-lg shadow dark:bg-gray-700`}>
          <button
            id='delete-modal-close-button'
            type='button'
            className={tw`absolute top-3 right-2.5 text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm w-8 h-8 ml-auto inline-flex justify-center items-center dark:hover:bg-gray-600 dark:hover:text-white`}
            data-modal-hide='delete-modal'
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
              <label className={tw`block mb-2 text-lg font-medium text-gray-900 dark:text-white`}>
                Reason for deletion?
              </label>
              <div className={tw`mt-2 mr-4`}>
                <ul
                  className={tw`w-76 text-sm font-medium text-gray-900 bg-white border border-gray-200 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white`}
                >
                  <li className={tw`w-full border-b border-gray-200 rounded-t-lg dark:border-gray-600`}>
                    <div className={tw`flex items-center ps-3`}>
                      <input
                        id='delete-reason-banned'
                        type='radio'
                        value=''
                        name='list-radio'
                        className={tw`ml-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500`}
                      />
                      <label
                        htmlFor='delete-reason-banned'
                        className={tw`w-full ml-2 py-3 ms-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                      >
                        Banned Run
                      </label>
                    </div>
                  </li>
                  <li className={tw`w-full border-b border-gray-200 rounded-t-lg dark:border-gray-600`}>
                    <div className={tw`flex items-center ps-3`}>
                      <input
                        id='delete-reason-mistake'
                        type='radio'
                        value=''
                        name='list-radio'
                        className={tw`ml-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500`}
                      />
                      <label
                        htmlFor='delete-reason-mistake'
                        className={tw`w-full ml-2 py-3 ms-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                      >
                        Mistake
                      </label>
                    </div>
                  </li>
                  <li className={tw`w-full border-b border-gray-200 rounded-t-lg dark:border-gray-600`}>
                    <div className={tw`flex items-center ps-3`}>
                      <input
                        id='delete-reason-duplicate'
                        type='radio'
                        value=''
                        name='list-radio'
                        className={tw`ml-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500`}
                      />
                      <label
                        htmlFor='delete-reason-duplicate'
                        className={tw`w-full ml-2 py-3 ms-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                      >
                        Duplicate
                      </label>
                    </div>
                  </li>
                  <li className={tw`w-full border-b border-gray-200 rounded-t-lg dark:border-gray-600`}>
                    <div className={tw`flex items-center ps-3`}>
                      <input
                        id='delete-reason-other'
                        type='radio'
                        value=''
                        name='list-radio'
                        className={tw`ml-2 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-700 dark:focus:ring-offset-gray-700 focus:ring-2 dark:bg-gray-600 dark:border-gray-500`}
                      />
                      <label
                        htmlFor='delete-reason-other'
                        className={tw`w-full ml-2 py-3 ms-2 text-sm font-medium text-gray-900 dark:text-gray-300`}
                      >
                        Other
                      </label>
                    </div>
                  </li>
                </ul>
                <div className={tw`hidden mb-6 mt-4`}>
                  <label
                    htmlFor='delete-reason-input'
                    className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}
                  >
                    Other Reason
                  </label>
                  <input
                    type='text'
                    id='delete-reason-input'
                    className={tw`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
                    maxLength={256}
                  />
                </div>
              </div>
            </div>
            <button
              id='delete-modal-delete-button'
              data-tooltip-trigger='none'
              className={tw`disabled:opacity-75 disabled:pointer-events-none w-full mt-2 text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:outline-none focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-800`}
              disabled
            >
              Delete Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
