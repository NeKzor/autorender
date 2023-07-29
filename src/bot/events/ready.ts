/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { events } from './mod.ts';
import { logger } from '../utils/logger.ts';
import { bot } from '../bot.ts';
import { ActivityTypes } from '../deps.ts';

const log = logger({ name: 'Event: Ready' });

events.ready = async (payload) => {
  log.info(`[Application: ${payload.applicationId}]`);

  await bot.gateway.shards.get(payload.shardId)?.editBotStatus({
    status: 'online',
    activities: [
      {
        name: 'your rendered demos!',
        type: ActivityTypes.Watching,
      },
    ],
  });
};
