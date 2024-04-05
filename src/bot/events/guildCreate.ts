/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { events } from './mod.ts';
import { log } from '../utils/logger.ts';
import { updateGuildCommands } from '../utils/helpers.ts';
import { bot } from '../bot.ts';

events.guildCreate = async (guild) => {
  log.info(`[Guild: ${guild.id}]`);

  await updateGuildCommands(bot, guild);
};
