/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Video } from "../../server/models.ts";
import { Bot } from "../deps.ts";
import { Interaction } from "../deps.ts";
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  InteractionResponseTypes,
} from "../deps.ts";
import { createCommand } from "./mod.ts";

const AUTORENDER_BASE_API = Deno.env.get("AUTORENDER_BASE_API")!;

const videoUrl = new URL("videos", Deno.env.get("AUTORENDER_PUBLIC_URI")!)
  .toString();

createCommand({
  name: "watch",
  description: "Watch rendered videos!",
  type: ApplicationCommandTypes.ChatInput,
  scope: "Global",
  options: [
    {
      name: "latest",
      description: "Watch your latest rendered videos!",
      type: ApplicationCommandOptionTypes.SubCommand,
    },
    {
      name: "random",
      description: "Watch a random rendered video!",
      type: ApplicationCommandOptionTypes.SubCommand,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const subCommand = [...(interaction.data?.options?.values() ?? [])].at(0)!;

    switch (subCommand.name) {
      case "latest": {
        try {
          await bot.helpers.sendInteractionResponse(
            interaction.id,
            interaction.token,
            {
              type: InteractionResponseTypes.ChannelMessageWithSource,
              data: {
                content: `⏳️ Loading videos...`,
              },
            },
          );

          const res = await fetch(
            `${AUTORENDER_BASE_API}/api/v1/videos/status/${interaction.user.id}`,
            {
              method: "GET",
              headers: {
                "User-Agent": "autorender-bot v1.0",
              },
            },
          );

          if (!res.ok) {
            throw new Error(`Videos request failed. Status: ${res.status}`);
          }

          type VideoStatus = Pick<Video, "video_id" | "title"> & {
            errored: boolean;
            rendering: boolean;
            rendered: boolean;
          };

          const videos = await res.json() as VideoStatus[];

          if (videos.length) {
            const getStatus = (video: VideoStatus) => {
              if (video.errored) {
                return "❌️";
              }

              if (video.rendering) {
                return "⌛️";
              }

              if (video.rendered) {
                return "📺️";
              }

              return "";
            };

            await bot.helpers.editOriginalInteractionResponse(
              interaction.token,
              {
                content: videos.map((video) => {
                  // TODO: Use Markdown links once it rolls out everywhere
                  return `${getStatus(video)} ${video.title}\n<${videoUrl}/${video.video_id}>`;
                }).join("\n"),
              },
            );
          } else {
            await bot.helpers.editOriginalInteractionResponse(
              interaction.token,
              {
                content: `📺️ Nothing to watch.`,
              },
            );
          }
        } catch (err) {
          console.error(err);

          await bot.helpers.editOriginalInteractionResponse(interaction.token, {
            content: `❌️ Failed to request rendered videos.`,
          });
        }
        break;
      }
      case "random": {
        try {
          await bot.helpers.sendInteractionResponse(
            interaction.id,
            interaction.token,
            {
              type: InteractionResponseTypes.ChannelMessageWithSource,
              data: {
                content: `⏳️ Loading random video...`,
              },
            },
          );

          const res = await fetch(
            `${AUTORENDER_BASE_API}/api/v1/videos/random/1`,
            {
              method: "GET",
              headers: {
                "User-Agent": "autorender-bot v1.0",
              },
            },
          );

          if (!res.ok) {
            throw new Error(`Videos request failed. Status: ${res.status}`);
          }

          const [video] = await res.json();
          if (!video) {
            throw new Error("No videos found.");
          }

          await bot.helpers.editOriginalInteractionResponse(interaction.token, {
            content: `${videoUrl}/${video.video_id}`,
          });
        } catch (err) {
          console.error(err);

          await bot.helpers.editOriginalInteractionResponse(interaction.token, {
            content: `❌️ Failed to request random video.`,
          });
        }
        break;
      }
      default:
        break;
    }
  },
});
