/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { log } from '../utils/logger.ts';
import { bot, updateGuildCommands } from '../bot.ts';

bot.events.guildCreate = async (guild) => {
  log.info(`[Guild: ${guild.id}]`);

  await updateGuildCommands(bot, guild);
};
