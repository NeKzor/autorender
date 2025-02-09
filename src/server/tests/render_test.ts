/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { assert, assertEquals } from '@std/assert';
import * as uuid from '@std/uuid';
import { validateShareId } from '../utils.ts';
import { Video } from '~/shared/models.ts';

// NOTE: Requires AUTORENDER_CLIENT_ACCESS_TOKEN for uploading test video.

const hostUri = `http://${Deno.env.get('SERVER_HOST')}:${Deno.env.get('SERVER_PORT')}`;

Deno.test('Render video', async (t) => {
  let video_id = '';

  await t.step('Upload demo', async () => {
    const url = `${hostUri}/api/v1/videos/render`;

    console.info(`[PUT] ${url}`);

    const filename = 'short.dem';

    const body = new FormData();

    if (!body.get('title')) {
      body.append('title', filename.slice(0, 64));
    }

    body.append('files', new Blob([await Deno.readFile('./tests/demos/short.dem')]), filename);

    const requestedByName = 'nekzor';

    const requestedById = '84272932246810624';
    const requestedInGuildId = '146404426746167296';
    const requestedInChannelId = '401828833189429258';

    body.append('requested_by_name', requestedByName);
    body.append('requested_by_id', requestedById);

    if (requestedInGuildId) {
      body.append('requested_in_guild_id', requestedInGuildId);
      body.append('requested_in_guild_name', 'Portal 2 Speedrun Server');
    }

    if (requestedInChannelId) {
      body.append('requested_in_channel_id', requestedInChannelId);
      body.append('requested_in_channel_name', 'bot-spam');
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${
          encodeURIComponent(
            Deno.env.get('AUTORENDER_BOT_TOKEN')!,
          )
        }`,
      },
      body,
    });

    assertEquals(res.status, 200);

    const video = await res.json() as Video;

    video_id = video.video_id;

    console.log('[QUEUED]', Deno.env.get('AUTORENDER_PUBLIC_URI') + '/queue/' + video.share_id);

    assert(uuid.validate(video.video_id));
    assertEquals(video.game_id, 1);
    assertEquals(video.map_id, 29);
    assert(validateShareId(video.share_id));
    assertEquals(video.title, 'short.dem');
    assertEquals(video.comment, null);
    assertEquals(video.requested_by_name, 'nekzor');
    assertEquals(video.requested_by_id, '84272932246810624');
    assertEquals(video.requested_in_guild_id, '146404426746167296');
    assertEquals(video.requested_in_guild_name, 'Portal 2 Speedrun Server');
    assertEquals(video.requested_in_channel_id, '401828833189429258');
    assertEquals(video.requested_in_channel_name, 'bot-spam');
    assert(!isNaN(new Date(video.created_at).getTime()));
    assertEquals(video.rerender_started_at, null);
    assertEquals(video.render_quality, '720p');
    assertEquals(video.render_options, '');
    assertEquals(video.file_name, 'short.dem');
    assertEquals(video.file_url, null);
    assertEquals(video.full_map_name, 'sp_a2_triple_laser');
    assertEquals(video.demo_size, 251700);
    assertEquals(video.demo_map_crc, 15400960);
    assertEquals(video.demo_game_dir, 'portal2');
    assertEquals(video.demo_playback_time, 1);
    assertEquals(video.demo_required_fix, 0);
    assertEquals(video.demo_tickrate, 60);
    assertEquals(video.demo_portal_score, null);
    assertEquals(video.demo_time_score, null);
    assertEquals(video.demo_player_name, 'NeKz');
    assertEquals(video.demo_steam_id, '76561198049848090');
    assertEquals(video.demo_partner_player_name, null);
    assertEquals(video.demo_partner_steam_id, null);
    assertEquals(video.demo_is_host, 1);
    assertEquals(video.demo_metadata, '{"segments":[],"timestamp":null}');
    assertEquals(video.demo_requires_repair, 0);
    assertEquals(video.board_source, 0);
    assertEquals(video.board_source_domain, null);
    assertEquals(video.board_changelog_id, null);
    assertEquals(video.board_profile_number, null);
    assertEquals(video.board_rank, null);
    assertEquals(video.pending, 1);
    assertEquals(video.rendered_by, null);
    assertEquals(video.rendered_by_token, null);
    assertEquals(video.rendered_at, null);
    assertEquals(video.render_time, null);
    assertEquals(video.render_node, null);
    assertEquals(video.video_url, null);
    assertEquals(video.video_external_id, null);
    assertEquals(video.video_size, null);
    assertEquals(video.video_length, null);
    assertEquals(video.video_preview_url, null);
    assertEquals(video.thumbnail_url_small, null);
    assertEquals(video.thumbnail_url_large, null);
    assertEquals(video.processed, 0);
    assertEquals(video.views, 0);
    assertEquals(video.visibility, 0);
    assertEquals(video.deleted_by, null);
    assertEquals(video.deleted_at, null);
    assertEquals(video.deleted_reason, null);
    assertEquals(video.deleted_reason_type, 0);
    assertEquals(video.deleted_video_url, null);
  });

  await t.step('Upload video', async () => {
    if (!Deno.env.get('AUTORENDER_CLIENT_ACCESS_TOKEN')) {
      console.warn('AUTORENDER_CLIENT_ACCESS_TOKEN not set. Skipping video upload.');
      return;
    }

    const url = `${hostUri}/api/v1/videos/upload`;

    console.info(`[POST] ${url}`);

    const body = new FormData();

    body.append(
      'files',
      new Blob([await Deno.readFile('./tests/videos/test.mp4')], { type: 'video/mp4' }),
    );

    body.append('video_id', video_id);

    const res = await fetch(
      `${hostUri}/api/v1/videos/upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${encodeURIComponent(Deno.env.get('AUTORENDER_CLIENT_ACCESS_TOKEN')!)}`,
        },
        body,
      },
    );

    assertEquals(res.status, 200);

    const video = await res.json() as Pick<Video, 'video_id'>;

    assert(uuid.validate(video.video_id));
    assertEquals(video.video_id, video_id);
  });
});
