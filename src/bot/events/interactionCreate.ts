/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import type { Guild } from '@discordeno/bot';
import { InteractionTypes } from '@discordeno/bot';
import { log } from '../utils/logger.ts';
import { bot, Command, DiscordBot, getGuildFromId } from '../bot.ts';

bot.events.interactionCreate = async (interaction) => {
  const bot = interaction.bot as DiscordBot;

  if (interaction.data && interaction.id) {
    let guildName = 'Direct Message';
    let guild = {} as Guild;

    if (interaction.guildId) {
      const guildOrVoid = await getGuildFromId(bot, interaction.guildId).catch(
        (err) => {
          log.error(err);
        },
      );
      if (guildOrVoid) {
        guild = guildOrVoid;
        guildName = guild.name;
      }
    }

    const source = interaction.data.name ?? interaction.data.customId;

    log.info(
      `[Command: ${source} - Trigger] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
        guildName !== 'Direct Message' ? ` (${guild.id})` : ``
      }`,
    );

    let command: Command | undefined = undefined;

    if (
      interaction.type === InteractionTypes.ModalSubmit ||
      interaction.type === InteractionTypes.MessageComponent
    ) {
      if (!interaction.data.customId) {
        log.warn(
          `[Modal - Not Found] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
            guildName !== 'Direct Message' ? ` (${guild.id})` : ``
          }`,
        );
        return;
      }

      const [modalCommand] = interaction.data.customId.split('_', 1) as [string];
      command = bot.commands.get(modalCommand);
    } else {
      command = bot.commands.get(interaction.data.name);
    }

    if (command !== undefined) {
      if (source) {
        try {
          command.execute(bot, interaction);
          log.info(
            `[Command: ${source} - Success] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
              guildName !== 'Direct Message' ? ` (${guild.id})` : ``
            }`,
          );
        } catch (err) {
          log.error(
            `[Command: ${source} - Error] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
              guildName !== 'Direct Message' ? ` (${guild.id})` : ``
            }`,
          );
          log.error(err);
        }
      } else {
        log.warn(
          `[Command: ${source} - Not Found] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
            guildName !== 'Direct Message' ? ` (${guild.id})` : ``
          }`,
        );
      }
    }
  }
};
