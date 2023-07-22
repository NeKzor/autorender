/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import Footer from '../../components/Footer.tsx';
import { DataLoader, json, PageMeta, unauthorized, useLoaderData } from '../../Routes.ts';
import { AccessToken } from '../../../models.ts';

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
    <>
      <ul>
        {tokens.map((token) => {
          return (
            <li>
              <a href={`/tokens/${token.access_token_id}`}>
                {token.token_name}
              </a>
            </li>
          );
        })}
      </ul>
      <a href='/tokens/create'>
        <button>Create New</button>
      </a>
      <Footer />
    </>
  );
};
