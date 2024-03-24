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
  InteractionTypes,
} from '@discordeno/bot';
import { createCommand } from './mod.ts';
import { escapeMaskedLink, formatCmTime } from '../utils/helpers.ts';
import { log } from '../utils/logger.ts';

const AUTORENDER_BASE_API = Deno.env.get('AUTORENDER_BASE_API')!;
const AUTORENDER_PUBLIC_URI = Deno.env.get('AUTORENDER_PUBLIC_URI')!;

createCommand({
  name: 'vid',
  description: 'Search for a video video.',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Global',
  options: [
    {
      name: 'search',
      description: 'Search query.',
      type: ApplicationCommandOptionTypes.String,
      required: true,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const command = interaction.data!;

    switch (interaction.type) {
      case InteractionTypes.ApplicationCommand: {
        const args = [...(command.options?.values() ?? [])];
        const search = args.find((arg) => arg.name === 'search')?.value?.toString()?.toLowerCase() ?? '';

        try {
          await bot.helpers.sendInteractionResponse(
            interaction.id,
            interaction.token,
            {
              type: InteractionResponseTypes.ChannelMessageWithSource,
              data: {
                content: `🔍️ Searching video...`,
              },
            },
          );

          const url = `${AUTORENDER_BASE_API}/api/v1/search?q=${search}`;
          log.info(`[GET] ${url}`);

          const res = await fetch(url, {
            headers: {
              'User-Agent': Deno.env.get('USER_AGENT')!,
            },
          });

          if (!res.ok) {
            throw new Error(`Failed to fetch videos on: "${search}"`);
          }

          interface SearchResponse {
            end: false;
            results: {
              comment: string;
              cur_rank: number;
              date: string;
              id: number;
              map: string;
              map_id: number;
              obsoleted: number;
              orig_rank: number;
              time: number;
              user: string;
              user_id: string;
              views: number;
              share_id: string;
            }[];
          }

          const { results } = await res.json() as SearchResponse;

          const [video] = results;
          if (!video) {
            await bot.helpers.editOriginalInteractionResponse(
              interaction.token,
              {
                content: `❌️ Video not found.`,
              },
            );
            return;
          }

          const map = escapeMaskedLink(video.map);
          const mapLink = escapeMaskedLink(
            `https://board.portal2.sr/chamber/${video.map_id}`,
          );

          const time = escapeMaskedLink(formatCmTime(video.time));
          const videoLink = `${AUTORENDER_PUBLIC_URI}/videos/${video.share_id}`;

          const playerName = escapeMaskedLink(video.user);
          const profileLink = `https://board.portal2.sr/profile/${video.user_id}`;

          await bot.helpers.editOriginalInteractionResponse(
            interaction.token,
            {
              content: `[${map}](<${mapLink}>) in [${time}](${videoLink}) by [${playerName}](<${profileLink}>)`,
            },
          );
        } catch (err) {
          log.error(err);

          await bot.helpers.editOriginalInteractionResponse(
            interaction.token,
            {
              content: `❌️ Failed to fetch videos.`,
            },
          );
        }
        break;
      }
      default:
        break;
    }
  },
});
