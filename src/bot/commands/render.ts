/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Video } from "../../server/models.ts";
import { Bot, getChannel, getGuild } from "../deps.ts";
import { Interaction } from "../deps.ts";
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  InteractionResponseTypes,
} from "../deps.ts";
import { createCommand } from "./mod.ts";

const AUTORENDER_BASE_API = Deno.env.get("AUTORENDER_BASE_API")!;
const AUTORENDER_VIDEO_URL = new URL(
  "videos",
  Deno.env.get("AUTORENDER_PUBLIC_URI")!,
).toString();

createCommand({
  name: "render",
  description: "Render a demo file!",
  type: ApplicationCommandTypes.ChatInput,
  scope: "Global",
  options: [
    {
      name: "file",
      description: "Demo file.",
      type: ApplicationCommandOptionTypes.Attachment,
      required: true,
    },
    {
      name: "title",
      description: "Video title.",
      type: ApplicationCommandOptionTypes.String,
      required: false,
    },
    {
      name: "comment",
      description: "Video comment.",
      type: ApplicationCommandOptionTypes.String,
      required: false,
    },
    {
      name: "render_options",
      description: "Render options e.g. sar_ihud 1, mat_fullbright 1",
      type: ApplicationCommandOptionTypes.String,
      required: false,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const args = [...(interaction.data?.options?.values() ?? [])];
    const attachment = interaction.data?.resolved?.attachments?.first()!;

    try {
      await bot.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: `⏳️ Queueing video...`,
          },
        },
      );

      const demo = await fetch(attachment.url, {
        method: "GET",
        headers: {
          "User-Agent": "autorender-bot v1.0",
        },
      });

      const body = new FormData();

      for (const option of ["title", "comment", "render_options"]) {
        const value = args.find((arg) => arg.name === option)?.value;
        if (value) {
          body.append(option, value.toString());
        }
      }

      if (!body.get("title")) {
        body.append("title", attachment.filename);
      }

      // NOTE: We have to reorder the file before something else, thanks to this wonderful bug in oak.
      //       https://github.com/oakserver/oak/issues/581

      body.append("files", await demo.blob());

      const requestedByName = interaction.user.discriminator !== "0"
        ? `${interaction.user.username}#${interaction.user.discriminator}`
        : interaction.user.username;

      const requestedById = interaction.user.id.toString();
      const requestedInGuildId = interaction.guildId?.toString();
      const requestedInChannelId = interaction.channelId?.toString();

      body.append("requested_by_name", requestedByName);
      body.append("requested_by_id", requestedById);

      if (requestedInGuildId) {
        body.append("requested_in_guild_id", requestedInGuildId);

        const guildName =
          (await getGuild(bot, BigInt(requestedInGuildId))).name;
        if (guildName) {
          body.append("requested_in_guild_name", guildName);
        }
      }

      if (requestedInChannelId) {
        body.append("requested_in_channel_id", requestedInChannelId);

        const channelName =
          (await getChannel(bot, BigInt(requestedInChannelId))).name;
        if (channelName) {
          body.append("requested_in_channel_name", channelName);
        }
      }

      const response = await fetch(
        `${AUTORENDER_BASE_API}/api/v1/videos/render`,
        {
          method: "PUT",
          headers: {
            "User-Agent": "autorender-bot v1.0",
            Authorization: `Bearer ${
              encodeURIComponent(
                Deno.env.get("AUTORENDER_BOT_TOKEN")!,
              )
            }`,
          },
          body,
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to render video: ${response.status}`);
      }

      const video = await response.json() as Video;

      const content = [
        `⏳️ Queued video "${video.title}" for rendering.`,
        `📺️ ${AUTORENDER_VIDEO_URL}/${video.video_id}`,
      ].join("\n");

      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content,
      });
    } catch (err) {
      console.error(err);

      await bot.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: `❌️ Failed to queue video :(`,
          },
        },
      );
    }
  },
});
