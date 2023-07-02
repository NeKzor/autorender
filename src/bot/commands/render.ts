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
const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;

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
      maxLength: 64,
    },
    {
      name: "comment",
      description: "Video comment.",
      type: ApplicationCommandOptionTypes.String,
      required: false,
      maxLength: 512,
    },
    {
      name: "render_options",
      description: "Render options e.g. sar_ihud 1, mat_fullbright 1",
      type: ApplicationCommandOptionTypes.String,
      required: false,
      maxLength: 1024,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const attachment = interaction.data?.resolved?.attachments?.first()!;

    if (attachment.size > AUTORENDER_MAX_DEMO_FILE_SIZE) {
      await bot.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: `❌️ File is too big. Uploads are limited to 6 MB.`,
          },
        },
      );
      return;
    }

    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: `⏳️ Uploading file...`,
        },
      },
    );

    try {
      const demo = await fetch(attachment.url, {
        method: "GET",
        headers: {
          "User-Agent": "autorender-bot v1.0",
        },
      });

      if (!demo.ok) {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Unable to download attachment.`,
        });
        return;
      }

      const body = new FormData();
      const args = [...(interaction.data?.options?.values() ?? [])];

      for (const option of ["title", "comment", "render_options"]) {
        const value = args.find((arg) => arg.name === option)?.value;
        if (value) {
          body.append(option, value.toString());
        }
      }

      if (!body.get("title")) {
        body.append("title", attachment.filename.slice(0, 64));
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

      if (response.ok) {
        const video = await response.json() as Video;

        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `⏳️ Queued video "${video.title}" for rendering.`,
        });
      } else {
        if (
          response.headers.get("Content-Type")?.includes("application/json")
        ) {
          type ErrorResponse = { status: number; message: string };
          const error = await response.json() as ErrorResponse;
          console.error(error);

          await bot.helpers.editOriginalInteractionResponse(interaction.token, {
            content: `❌️ Failed to queue video. Reason: ${error.message}`,
          });
        } else {
          throw new Error(`Failed to queue video: ${response.status}`);
        }
      }
    } catch (err) {
      console.error(err);

      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `❌️ Failed to queue video.`,
      });
    }
  },
});
