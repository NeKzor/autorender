/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, PageMeta, unauthorized, useLoaderData } from '../../Routes.ts';
import { AccessToken } from '~/shared/models.ts';

type Data = AccessToken[];

export const meta: PageMeta<Data> = () => {
  return {
    title: 'Tokens',
  };
};

export const loader: DataLoader = async ({ context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  const tokens = await context.db.query<AccessToken>(
    `select * from access_tokens where user_id = ? order by created_at`,
    [context.user.user_id],
  );

  return json<Data>(tokens ?? []);
};

export const Tokens = () => {
  const tokens = useLoaderData<Data>();

  return (
    <div>
      <table className={tw`w-full text-sm text-left text-gray-500 dark:text-gray-400`}>
        <thead
          className={tw`text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-900 dark:text-gray-400`}
        >
          <tr>
            <th scope='col' className={tw`px-6 py-3`}>
              Name
            </th>
            <th scope='col' className={tw`px-6 py-3`}>
              Created at
            </th>
            <th scope='col' className={tw`px-6 py-3`}>
            </th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            return (
              <tr className={tw`bg-white dark:bg-gray-800 dark:border-gray-700`}>
                <th
                  scope='row'
                  className={tw`px-6 py-4 font-medium text-gray-900 whitespace-nowrap dark:text-white`}
                >
                  {token.token_name}
                </th>
                <td className={tw`px-6 py-4`}>
                  {new Date(token.created_at).toLocaleDateString()}
                </td>
                <td className={tw`px-6 py-4`}>
                  <a
                    href={`/tokens/${token.access_token_id}`}
                    className={tw`font-medium text-blue-600 dark:text-blue-500 hover:underline`}
                  >
                    Edit
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <br />
      <a href='/tokens/create'>
        <button
          className={tw`text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm w-full sm:w-auto px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800`}
        >
          Create New
        </button>
      </a>
    </div>
  );
};
