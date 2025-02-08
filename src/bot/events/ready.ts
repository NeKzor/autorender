/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { log } from '../utils/logger.ts';
import { bot } from '../bot.ts';
import { ActivityTypes } from '@discordeno/bot';

bot.events.ready = async (payload) => {
  log.info(`[Application: ${payload.applicationId}]`);

  await bot.gateway.editShardStatus(payload.shardId, {
    status: 'online',
    activities: [
      {
        name: 'your rendered demos!',
        type: ActivityTypes.Watching,
      },
    ],
  });
};
