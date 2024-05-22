/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { tw } from 'twind';
import { DataLoader, PageMeta, useLoaderData } from '../Routes.ts';
import { MapModel, MapType, Video } from '~/shared/models.ts';
import { VideoRow } from '../components/VideoRow.tsx';
import ShareModal from '../components/ShareModal.tsx';
import type { Database } from '../../db.ts';
import { getSortableIdByCreated, SortableId } from '../utils.ts';

const MAX_VIDEOS_PER_REQUEST = 8;

type JoinedVideo =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'comment'
    | 'created_at'
    | 'rendered_at'
    | 'views'
    | 'requested_by_id'
    | 'requested_by_name'
    | 'video_preview_url'
    | 'thumbnail_url_small'
    | 'thumbnail_url_large'
    | 'video_length'
    | 'board_changelog_id'
  >
  & {
    requested_by_username: string | null;
    requested_by_discord_avatar_url: string | null;
  };

type Data = {
  videos: JoinedVideo[];
};

export const meta: PageMeta<Data> = () => {
  return {
    title: 'Search',
  };
};

const searchVideos = async (db: Database, query: string, sortableId?: SortableId) => {
  const searchFallback = async () => {
    // FIXME: Not possible at the moment.
    if (sortableId) {
      return [];
    }

    return await db.query<JoinedVideo>(
      `select share_id
            , title
            , comment
            , videos.created_at
            , rendered_at
            , views
            , requested_by_id
            , requested_by_name
            , video_preview_url
            , thumbnail_url_small
            , thumbnail_url_large
            , video_length
            , board_changelog_id
            , requester.username as requested_by_username
            , requester.discord_avatar_url as requested_by_discord_avatar_url
         from videos
    left join users requester
           on requester.discord_id = videos.requested_by_id
    left join maps
           on maps.map_id = videos.map_id
        where video_url is not null
          and deleted_at is null
          and (
               match (title) against (?)
            or maps.name sounds like ?
            or maps.alias sounds like ?
            or videos.demo_player_name sounds like ?)
        limit ${MAX_VIDEOS_PER_REQUEST - 1}`,
      [
        `${query}`,
        `%${query}%`,
        `%${query}%`,
        `%${query}%`,
      ],
    );
  };

  const isWr = query.endsWith(' wr') || query.endsWith(' world record');
  const matchedRank = / ([1-9]+)(st|nd|rd|th)$/g.exec(query)?.at(1) ?? / rank ([1-9]+)$/g.exec(query)?.at(1);

  const rank = isWr ? 1 : Number(matchedRank);

  const [_g1, _g2, min, sec, cs] = [.../ (([0-9]):)?([0-9]?[0-9])\.([0-9][0-9])$/g.exec(query) ?? []];
  const time = (Number(min ?? 0) * 60 * 100) + (Number(sec ?? 0) * 100) + Number(cs ?? 0);

  const words = query.split(' ');
  let lastIndex = (isWr && words.at(-2) === 'world') || (!isNaN(rank) && words.at(-2) === 'rank')
    ? -2
    : isWr || matchedRank || time
    ? -1
    : 0;

  let mapTypes: MapType[] = [];
  let hostOnly: boolean | undefined = undefined;

  if (words.length >= 2) {
    const hint = words.at(lastIndex - 1)?.toLocaleLowerCase();
    switch (hint) {
      case 'sp': {
        lastIndex -= 1;

        mapTypes = [
          MapType.SinglePlayer,
          MapType.WorkshopSinglePlayer,
        ];
        break;
      }
      case 'coop':
      case 'mp':
      case 'blue':
      case 'orange': {
        lastIndex -= 1;
        hostOnly = hint === 'blue' ? true : hint === 'orange' ? false : undefined;

        mapTypes = [
          MapType.Cooperative,
          MapType.WorkshopCooperative,
        ];
        break;
      }
      default:
        break;
    }

    words
      .slice(0, 2)
      .forEach((word, index) => {
        const abbreviation = word.toLocaleLowerCase();
        switch (abbreviation) {
          case 'coop': {
            words[index] = 'Cooperative';
            break;
          }
          case 'prop': {
            words[index] = 'Propulsion';
            break;
          }
          default:
            break;
        }
      });
  }

  lastIndex && words.splice(lastIndex, -lastIndex);

  const mapNames = [
    ...new Set([
      words.join(' '),
      words.slice(1).join(' '),
      words.slice(0, -1).join(' '),
    ]),
  ].filter((name) => name.length > 0);

  const maps = mapNames.length
    ? await db.query<Pick<MapModel, 'map_id' | 'alias'>>(
      `select map_id
            , alias
         from maps
        where best_time_id is not null
          and (${mapNames.map(() => `maps.alias like ?`).join(' or ')})
              ${mapTypes.length ? `and maps.type in (${mapTypes.map(() => '?').join(',')})` : ''}`,
      [
        ...mapNames,
        ...mapTypes,
      ],
    )
    : [];

  const map = (() => {
    const [map] = maps;
    if (!map || maps.length === 1) {
      return map;
    }

    for (const mapName of mapNames) {
      for (const map of maps) {
        if (mapName.toLocaleLowerCase() === map.alias.toLocaleLowerCase()) {
          return map;
        }
      }
    }
  })();

  if (!map) {
    return await searchFallback();
  }

  const joinedWords = words.join(' ').toLowerCase();
  const mapName = map.alias.toLocaleLowerCase();
  const playerName = joinedWords.startsWith(mapName) && !joinedWords.endsWith(mapName)
    ? words.at(-1) ?? ''
    : joinedWords.endsWith(mapName) && !joinedWords.startsWith(mapName)
    ? words.at(0) ?? ''
    : '';

  const videos = await db.query<JoinedVideo>(
    `select share_id
            , title
            , comment
            , videos.created_at
            , rendered_at
            , views
            , requested_by_id
            , requested_by_name
            , video_preview_url
            , thumbnail_url_small
            , thumbnail_url_large
            , video_length
            , board_changelog_id
            , requester.username as requested_by_username
            , requester.discord_avatar_url as requested_by_discord_avatar_url
         from videos
    left join users requester
           on requester.discord_id = videos.requested_by_id
    left join maps
           on maps.map_id = videos.map_id
        where board_changelog_id is not null
          and video_url is not null
          and videos.map_id = ?
          ${sortableId ? 'and (videos.created_at < ? or (videos.created_at = ? and videos.share_id > ?))' : ''}
          ${time === 0 && isNaN(rank) && playerName.length ? `and videos.demo_player_name sounds like ?` : ''}
          ${time !== 0 ? ' and demo_time_score = ?' : ''}
          ${!isNaN(rank) ? ' and board_rank = ?' : ''}
          ${hostOnly !== undefined ? ` and demo_is_host = ${hostOnly ? 1 : 0}` : ''}
     order by videos.created_at desc,
              share_id asc
        limit ${MAX_VIDEOS_PER_REQUEST}`,
    [
      map.map_id,
      ...(sortableId ? [sortableId.date, sortableId.date, sortableId.shareId] : []),
      ...(time === 0 && isNaN(rank) && playerName.length ? [playerName] : []),
      ...(time !== 0 ? [time] : []),
      ...(!isNaN(rank) ? [rank] : []),
    ],
  );

  return videos.length ? videos : await searchFallback();
};

export const loader: DataLoader = async ({ context }) => {
  const query = context.url.searchParams.get('q')?.trim() ?? '';

  if (!query.length) {
    return {
      videos: [],
    } satisfies Data;
  }

  const videos = await searchVideos(context.db, query);

  return {
    videos,
  } satisfies Data;
};

export const Search = () => {
  const { videos } = useLoaderData<Data>();

  return (
    <>
      <div className={tw`lg:flex lg:justify-center md:w-full`}>
        <div>
          <div
            className={tw`grid grid-cols gap-4`}
            x-last-video={getSortableIdByCreated(videos.at(-1))}
          >
            {videos.length === 0 && (
              <span
                className={tw`text-center`}
              >
                No videos found.
              </span>
            )}
            {videos.map((video) => <VideoRow video={video} />)}
          </div>
          {videos.length === MAX_VIDEOS_PER_REQUEST && (
            <div id='loading' className={tw`text-center mt-10 mb-10 hidden`}>
              <div role='status'>
                <svg
                  aria-hidden='true'
                  className={`inline w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600`}
                  viewBox='0 0 100 101'
                  fill='none'
                  xmlns='http://www.w3.org/2000/svg'
                >
                  <path
                    d='M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z'
                    fill='currentColor'
                  />
                  <path
                    d='M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z'
                    fill='currentFill'
                  />
                </svg>
                <span className={`sr-only`}>Loading...</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {videos.length > 0 && <ShareModal />}
    </>
  );
};

export const loadMoreSearch = async (
  db: Database,
  sortableId: SortableId,
  query: string,
): Promise<[html: string, lastId: string | undefined]> => {
  const videos = await searchVideos(db, query, sortableId);

  return [
    renderToString(
      <>
        {videos.map((video) => <VideoRow video={video} />)}
      </>,
    ),
    getSortableIdByCreated(videos.at(-1)),
  ];
};
