/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This is Discord bot sends demo attachments to the  server via the `/render`
 * command. It will send a message once a video is uploaded.
 */

import "https://deno.land/std@0.190.0/dotenv/load.ts";

import { ActivityTypes } from "./deps.ts";
import { logger } from "./utils/logger.ts";
import { escapeMaskedLink, getPublicUrl, updateCommands } from "./utils/helpers.ts";
import { BotDataType, BotMessages } from "./protocol.ts";
import { bot } from "./bot.ts";

// TODO: file logging
const log = logger({ name: "Main" });

addEventListener("error", (ev) => {
  console.dir({ error: ev.error }, { depth: 16 });
});

addEventListener("unhandledrejection", (ev) => {
  console.dir({ unhandledrejection: ev.reason }, { depth: 16 });

  if (ev.reason?.body) {
    Deno.stdout.writeSync(new TextEncoder().encode(ev.reason.body));
  }
});

log.info("Starting bot");

await import("./commands/bot.ts");
await import("./commands/fixup.ts");
await import("./commands/render.ts");
await import("./commands/watch.ts");

import("./events/guildCreate.ts");
import("./events/interactionCreate.ts");
import("./events/ready.ts");

await updateCommands(bot);

// Worker thread for connecting to the server.
const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
  type: "module",
});

// Handle all new incoming messages from the server
worker.addEventListener("message", async (message) => {
  try {
    const { type, data } = JSON.parse(message.data) as BotMessages;

    switch (type) {
      case BotDataType.Upload: {
        const title = escapeMaskedLink(data.title);
        const link = getPublicUrl(`/videos/${data.video_id}`);

        const content = [
          `📽️ Rendered video [${title}](${link})`,
        ].join("\n");

        if (data.requested_in_guild_id && data.requested_in_channel_id) {
          await bot.helpers.sendMessage(data.requested_in_channel_id, {
            content,
          });
        } else {
          const channel = await bot.helpers.getDmChannel(data.requested_by_id);
          await bot.helpers.sendMessage(channel.id, { content });
        }
        break;
      }
      case BotDataType.Error: {
        const content = `❌️ ${data.message}`;

        if (data.requested_in_guild_id && data.requested_in_channel_id) {
          await bot.helpers.sendMessage(data.requested_in_channel_id, {
            content,
          });
        } else {
          const channel = await bot.helpers.getDmChannel(data.requested_by_id);
          await bot.helpers.sendMessage(channel.id, { content });
        }
        break;
      }
      default: {
        console.warn("Unknown message type", type);
        break;
      }
    }
  } catch (err) {
    log.error(err);
  }
});

log.info("Started bot");

// FIXME: This is the wrong place to update the status
setTimeout(async () => {
  await bot.gateway.editBotStatus({
    status: "online",
    activities: [
      {
        name: "your rendered demos!",
        type: ActivityTypes.Watching,
      },
    ],
  });

  log.info("Updated bot status");
}, 3_000);

await bot.start();
