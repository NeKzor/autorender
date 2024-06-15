/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import * as _bcrypt_worker from 'bcrypt/src/worker.ts';
import { ActionLoader, badRequest, DataLoader, PageMeta, redirect, unauthorized, useLoaderData } from '../Routes.ts';
import { BoardSource, UserPermissions, Video } from '~/shared/models.ts';
import { insertVideo } from '../../tasks/board_insert.ts';
import { getChangelog } from '../../tasks/portal2_sr.ts';
import { getMelChangelog } from '../../tasks/mel.ts';
import { db } from '../../db.ts';

type Data = { game: string } & Pick<Video, 'board_changelog_id'>;

export const meta: PageMeta<Data> = () => {
  return {
    title: 'Render',
  };
};

export const loader: DataLoader = async ({ params, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.RerenderVideos)) {
    unauthorized();
  }

  if (
    !params.game || !['portal2', 'mel'].includes(params.game) || !params.id ||
    parseInt(params.id, 10).toString() !== params.id
  ) {
    badRequest();
  }

  const boardSource = params.game === 'mel' ? BoardSource.Mel : BoardSource.Portal2;
  const changelogId = parseInt(params.id, 10);

  const [video] = await db.query<Pick<Video, 'share_id' | 'video_url'>>(
    `select share_id
          , video_url
       from videos
      where board_source = ?
        and board_changelog_id = ?`,
    [
      boardSource,
      changelogId,
    ],
  );

  if (video) {
    return redirect(`/${video.video_url ? 'videos' : 'queue'}/${video.share_id}`);
  }

  return {
    game: params.game,
    board_changelog_id: changelogId,
  } satisfies Data;
};

export const action: ActionLoader = async ({ request, context }) => {
  if (!context.user?.user_id) {
    unauthorized();
  }

  if (!(context.user.permissions & UserPermissions.RerenderVideos)) {
    unauthorized();
  }

  const formData = await request.formData();
  const { game, board_changelog_id } = Object.fromEntries(formData) as Partial<Data>;

  if (
    !game || !['portal2', 'mel'].includes(game) || !board_changelog_id ||
    parseInt(board_changelog_id.toString(), 10).toString() !== board_changelog_id.toString()
  ) {
    badRequest();
  }

  const changelogFetcher = game === 'mel' ? getMelChangelog : getChangelog;
  const changelog = await changelogFetcher({ id: board_changelog_id });

  const [entry] = changelog ?? [];
  if (!entry) {
    badRequest();
  }

  const shareId = await insertVideo(game === 'mel' ? BoardSource.Mel : BoardSource.Portal2, entry);
  if (!shareId) {
    badRequest();
  }

  return redirect('/queue/' + shareId);
};

export const Render = () => {
  const data = useLoaderData<Data>();

  return (
    <div className={tw`lg:flex lg:justify-center`}>
      <div className={tw`lg:w-[50%]`}>
        <form method='post'>
          <div className={tw`text-[20px] mb-4`}>
            Render
          </div>
          <div className={tw`mb-6`}>
            <label htmlFor='game' className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}>
              Source
            </label>
            <input
              type='text'
              value={data.game === 'mel' ? 'mel.board.portal2.sr' : 'board.portal2.sr'}
              className={tw`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
              disabled
            />
            <input
              id='game'
              name='game'
              type='hidden'
              value={data.game}
            />
          </div>
          <div className={tw`mb-6`}>
            <label
              htmlFor='board_changelog_id'
              className={tw`block mb-2 text-sm font-medium text-gray-900 dark:text-white`}
            >
              Changelog ID
            </label>
            <input
              id='board_changelog_id'
              name='board_changelog_id'
              type='text'
              value={data.board_changelog_id}
              className={tw`bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500`}
              readOnly
            />
          </div>
          <div className={tw`flex`}>
            <button
              className={tw`text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800`}
            >
              Confirm
            </button>
            <a href='/'>
              <button
                className={tw`text-white bg-gray-500 hover:bg-gray-800 focus:ring-4 focus:ring-gray-300 font-medium rounded-lg text-sm px-5 py-2.5 mr-2 mb-2 dark:bg-gray-600 dark:hover:bg-gray-700 focus:outline-none dark:focus:ring-gray-800`}
              >
                Cancel
              </button>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
};
