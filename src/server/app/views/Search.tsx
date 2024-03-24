/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';
import { DataLoader, json, PageMeta, useLoaderData } from '../Routes.ts';
import { MapModel, MapType, Video } from '~/shared/models.ts';
import { VideoRow } from '../components/VideoRow.tsx';
import ShareModal from '../components/ShareModal.tsx';

type JoinedVideo =
  & Pick<
    Video,
    | 'share_id'
    | 'title'
    | 'comment'
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

export const meta: PageMeta<Data> = ({ data }) => {
  return {
    title: 'Search',
  };
};

export const loader: DataLoader = async ({ context }) => {
  const query = context.url.searchParams.get('q')?.trim() ?? '';

  if (!query.length) {
    return json<Data>({
      videos: [],
    });
  }

  const searchFallback = async () => {
    return await context.db.query<JoinedVideo>(
      `select share_id
            , title
            , comment
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
               MATCH (title) AGAINST (?)
            or maps.name sounds like ?
            or maps.alias sounds like ?
            or videos.demo_player_name sounds like ?)
        limit 16`,
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
    ? await context.db.query<Pick<MapModel, 'map_id' | 'alias'>>(
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
    return json<Data>({
      videos: await searchFallback(),
    });
  }

  const joinedWords = words.join(' ').toLowerCase();
  const mapName = map.alias.toLocaleLowerCase();
  const playerName = joinedWords.startsWith(mapName) && !joinedWords.endsWith(mapName)
    ? words.at(-1) ?? ''
    : joinedWords.endsWith(mapName) && !joinedWords.startsWith(mapName)
    ? words.at(0) ?? ''
    : '';

  const videos = await context.db.query<JoinedVideo>(
    `select share_id
            , title
            , comment
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
          ${time === 0 && isNaN(rank) && playerName.length ? `and videos.demo_player_name sounds like ?` : ''}
          ${time !== 0 ? ' and demo_time_score = ?' : ''}
          ${!isNaN(rank) ? ' and board_rank = ?' : ''}
          ${hostOnly !== undefined ? ` and demo_is_host = ${hostOnly ? 1 : 0}` : ''}
     order by videos.created_at desc
        limit 20`,
    [
      map.map_id,
      ...(time === 0 && isNaN(rank) && playerName.length ? [playerName] : []),
      ...(time !== 0 ? [time] : []),
      ...(!isNaN(rank) ? [rank] : []),
    ],
  );

  return json<Data>({
    videos: videos.length ? videos : await searchFallback(),
  });
};

export const Search = () => {
  const { videos } = useLoaderData<Data>();

  return (
    <>
      <div className={tw`lg:flex lg:justify-center md:w-full`}>
        <div>
          <div
            className={tw`grid grid-cols gap-4`}
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
        </div>
      </div>
      {videos.length > 0 && <ShareModal />}
    </>
  );
};
