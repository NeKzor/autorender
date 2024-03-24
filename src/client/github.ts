/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Options } from './cli.ts';
import { logger } from './logger.ts';
import { UserAgent } from './constants.ts';

export const getRelease = async (
  url: string,
  options?: { verboseMode?: Options['verboseMode'] },
) => {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UserAgent,
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url} : status ${res.status}`);
    }
    return await res.json() as GitHubRelease;
  } catch (err) {
    options?.verboseMode && logger.error(err);
    return null;
  }
};

export interface GitHubRelease {
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: [
    {
      url: string;
      id: number;
      node_id: string;
      name: string;
      label: null;
      uploader: {
        login: string;
        id: number;
        node_id: string;
        avatar_url: string;
        gravatar_id: string;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
      };
      content_type: string;
      state: string;
      size: number;
      download_count: number;
      created_at: string;
      updated_at: string;
      browser_download_url: string;
    },
    {
      url: string;
      id: number;
      node_id: string;
      name: string;
      label: null;
      uploader: {
        login: string;
        id: number;
        node_id: string;
        avatar_url: string;
        gravatar_id: string;
        url: string;
        html_url: string;
        followers_url: string;
        following_url: string;
        gists_url: string;
        starred_url: string;
        subscriptions_url: string;
        organizations_url: string;
        repos_url: string;
        events_url: string;
        received_events_url: string;
        type: string;
        site_admin: boolean;
      };
      content_type: string;
      state: string;
      size: number;
      download_count: number;
      created_at: string;
      updated_at: string;
      browser_download_url: string;
    },
  ];
  tarball_url: string;
  zipball_url: string;
  body: string;
}
