/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Bot,
  Interaction,
  InteractionResponseTypes,
  MessageFlags,
} from '@discordeno/bot';
import { getPublicUrl } from '../utils/helpers.ts';
import { createCommand } from './mod.ts';

const startTime = Date.now();

createCommand({
  name: 'bot',
  description: 'Bot specific commands.',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Global',
  options: [
    {
      name: 'info',
      description: 'Get info about the bot!',
      type: ApplicationCommandOptionTypes.SubCommand,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const sec = (Date.now() - startTime) / 1_000;
    const uptime = sec < 60
      ? `${sec.toFixed(2)} seconds`
      : sec < (60 * 60)
      ? `${(sec / 60).toFixed(2)} minutes`
      : sec < (60 * 60 * 24)
      ? `${(sec / (60 * 60)).toFixed(2)} hours`
      : `${(sec / (60 * 60 * 24)).toFixed(2)} days`;

    const domain = getPublicUrl('/');

    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: [
            `:robot: [${domain.hostname}](${domain.origin})`,
            `:small_red_triangle: ${Deno.build.os} ${Deno.build.arch}`,
            `:up: ${uptime}`,
          ].join('\n'),
          flags: MessageFlags.Ephemeral,
        },
      },
    );
  },
});
