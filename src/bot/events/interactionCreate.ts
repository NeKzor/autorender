/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import type { Guild } from '../deps.ts';
import { bgBlack, bgYellow, black, green, InteractionTypes, red, white, yellow } from '../deps.ts';
import { events } from './mod.ts';
import { logger } from '../utils/logger.ts';
import { getGuildFromId } from '../utils/helpers.ts';
import type { Command } from '../commands/mod.ts';
import { commands } from '../commands/mod.ts';
import { BotWithCache } from '../bot.ts';

const log = logger({ name: 'Event: InteractionCreate' });

events.interactionCreate = async (interaction) => {
  const bot = interaction.bot as BotWithCache;

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
      `[Command: ${
        bgYellow(
          black(String(source)),
        )
      } - ${
        bgBlack(white(`Trigger`))
      }] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
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
          `[Modal - ${
            bgBlack(yellow(`Not Found`))
          }] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
            guildName !== 'Direct Message' ? ` (${guild.id})` : ``
          }`,
        );
        return;
      }

      const [modalCommand] = interaction.data.customId.split('_');
      command = commands.get(modalCommand);
    } else {
      command = commands.get(interaction.data.name);
    }

    if (command !== undefined) {
      if (source) {
        try {
          if (command) {
            command.execute(bot, interaction);
            log.info(
              `[Command: ${bgYellow(black(String(source)))} - ${
                bgBlack(green(`Success`))
              }] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
                guildName !== 'Direct Message' ? ` (${guild.id})` : ``
              }`,
            );
          } else {
            throw '';
          }
        } catch (err) {
          log.error(
            `[Command: ${bgYellow(black(String(source)))} - ${
              bgBlack(red(`Error`))
            }] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
              guildName !== 'Direct Message' ? ` (${guild.id})` : ``
            }`,
          );
          err.length ? log.error(err) : undefined;
        }
      } else {
        log.warn(
          `[Command: ${bgYellow(black(String(source)))} - ${
            bgBlack(yellow(`Not Found`))
          }] by ${interaction.user.username}#${interaction.user.discriminator} in ${guildName}${
            guildName !== 'Direct Message' ? ` (${guild.id})` : ``
          }`,
        );
      }
    }
  }
};
