/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import * as bcrypt from 'bcrypt/mod.ts';
import * as _bcrypt_worker from 'bcrypt/src/worker.ts';
import {
  ActionLoader,
  badRequest,
  DataLoader,
  internalServerError,
  json,
  PageMeta,
  redirect,
  unauthorized,
  useLoaderData,
} from '../../Routes.ts';
import { AccessPermission, AccessToken, UserPermissions } from '~/shared/models.ts';

type Data = Partial<AccessToken> | null;

export const meta: PageMeta<Data> = () => {
  return {
    title: 'Token',
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  const tokens = await context.db.query<AccessToken>(
    `select * from access_tokens where access_token_id = ? and user_id = ?`,
    [params.access_token_id, context.user.user_id],
  );

  return json(tokens?.at(0) ?? null);
};

export const loaderCreate: DataLoader = ({ context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  return json<Partial<AccessToken>>({
    token_name: '',
    token_key: '',
  });
};

export const action: ActionLoader = async ({ params, request, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  type PostFormData = Partial<Pick<AccessToken, 'token_name'>>;
  const { token_name } = Object.fromEntries(
    await request.formData(),
  ) as PostFormData;

  if (!token_name || token_name.length < 3 || token_name.length > 32 || token_name === 'portal2-cm-autorender') {
    badRequest();
  }

  const { affectedRows } = await context.db.execute(
    `update access_tokens set token_name = ? where access_token_id = ? and user_id = ?`,
    [token_name, params.access_token_id, context.user.user_id],
  );

  if (affectedRows !== 1) {
    unauthorized();
  }

  return redirect('/tokens/' + params.access_token_id);
};

export const actionNew: ActionLoader = async ({ request, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  type PostFormData = Partial<Pick<AccessToken, 'token_name'>>;
  const { token_name } = Object.fromEntries(
    await request.formData(),
  ) as PostFormData;

  if (!token_name || token_name.length < 3 || token_name.length > 32) {
    return badRequest();
  }

  const { affectedRows, lastInsertId } = await context.db.execute(
    `insert into access_tokens (
          user_id
        , token_name
        , token_key
        , permissions
      ) values (
          ?
        , ?
        , ?
        , ?
      )`,
    [
      context.user.user_id,
      token_name,
      await bcrypt.hash(crypto.randomUUID()),
      AccessPermission.CreateVideos | AccessPermission.WriteVideos,
    ],
  );

  if (affectedRows !== 1) {
    return internalServerError();
  }

  return redirect('/tokens/' + lastInsertId);
};

export const actionDelete: ActionLoader = async ({ params, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.CreateTokens)) {
    unauthorized();
  }

  const { affectedRows } = await context.db.execute(
    `delete from access_tokens where access_token_id = ? and user_id = ?`,
    [params.access_token_id, context.user.user_id],
  );

  if (affectedRows !== 1) {
    unauthorized();
  }

  return redirect('/tokens');
};

export const Token = () => {
  const token = useLoaderData<Data>();

  if (!token) {
    return <div>Token not found :(</div>;
  }

  return (
    <div className={tw`lg:flex lg:justify-center`}>
      <div className={tw`lg:w-[50%]`}>
        <form action={`/tokens/${token.access_token_id ?? 'new'}`} method='post'>
          <div className={tw`text-[20px] mb-4`}>
            {token.access_token_id ? 'Update ' : 'Create '} Access Token
          </div>
          <div className={tw`mb-6`}>
            <label htmlFor='token_name' className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}>
              Name
            </label>
            <input
              id='token_name'
              name='token_name'
              type='text'
              value={token.token_name}
              className={tw`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
              minLength={3}
              maxLength={32}
              required
            />
          </div>
          {token.access_token_id && (
            <div className={tw`mb-6`}>
              <label htmlFor='token_key' className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}>
                Access Key
              </label>
              <input
                id='token_key'
                name='token_key'
                type='text'
                value={token.token_key}
                className={tw`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
                readOnly
              />
            </div>
          )}
          <button
            type='button'
            className={tw`text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
          >
            {token.access_token_id ? 'Update' : 'Create'}
          </button>
        </form>
        {token.access_token_id && (
          <form action={`/tokens/${token.access_token_id}/delete`} method='post'>
            <button
              type='button'
              className={`focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900`}
            >
              Delete
            </button>
          </form>
        )}
        <a href='/tokens'>
          <button
            type='button'
            className={tw`text-white bg-gray-500 hover:bg-gray-800 focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-gray-600 dark:hover:bg-gray-700 focus:outline-none dark:focus:ring-gray-800`}
          >
            {token.access_token_id ? 'Back' : 'Cancel'}
          </button>
        </a>
      </div>
    </div>
  );
};
