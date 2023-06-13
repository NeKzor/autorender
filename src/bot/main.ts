/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 * 
 * 
 * This is Discord bot sends demo attachments to the  server via the `/render`
 * command. It will send a message once a video is uploaded.
 */

import "https://deno.land/std@0.190.0/dotenv/load.ts";

import {
  ActivityTypes,
  createBot,
  enableCachePlugin,
  enableCacheSweepers,
  fastFileLoader,
  GatewayIntents,
  sendDirectMessage,
  startBot,
} from "./deps.ts";
import { logger } from "./utils/logger.ts";
import { events } from "./events/mod.ts";
import { updateCommands } from "./utils/helpers.ts";
import { BotDataType, BotMessages } from "./protocol.ts";

const videoUrl = (() => {
  const { host, protocol } = new URL(Deno.env.get("AUTORENDER_CONNECT_URI")!);
  return `http${protocol === "http" ? "s" : ""}://${host}/videos/`;
})();

console.log({ videoUrl });

// TODO: file logging
const log = logger({ name: "Main" });

log.info("Starting Bot, this might take a while...");

const paths = ["./events", "./commands"];
await fastFileLoader(paths).catch((err) => {
  log.fatal(`Unable to Import ${paths}`);
  log.fatal(err);
  Deno.exit(1);
});

export const bot = enableCachePlugin(
  createBot({
    token: Deno.env.get("DISCORD_BOT_TOKEN")!,
    botId: BigInt(Deno.env.get("DISCORD_BOT_ID")!),
    intents: GatewayIntents.Guilds,
    events,
  })
);

// @ts-nocheck: no-updated-depencdencies
enableCacheSweepers(bot);

bot.gateway.manager.createShardOptions.makePresence = (shardId: number) => {
  return {
    shardId,
    status: "online",
    activities: [
      {
        name: "Render videos On-Demand!",
        type: ActivityTypes.Watching,
        createdAt: Date.now(),
      },
    ],
  };
};

// Worker thread for connecting to the server.
const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
  type: "module",
});

// Handle all new incoming messages from the server
worker.addEventListener("message", (message) => {
  const { type, data } = JSON.parse(message.data) as BotMessages;

  console.log("Message");

  switch (type) {
    case BotDataType.Upload: {
      sendDirectMessage(bot, BigInt(data.requested_by_id!), {
        content: [
          `📽️ Finished rendering "${data.title ?? "*untitled*"}" video`,
          `📺️ ${videoUrl + data.video_id}`,
        ].join("\n"),
      });
      break;
    }
    case BotDataType.Error: {
      console.warn("Ignoring error for now.", data);
      break;
    }
    default: {
      console.warn("Unknown message type", type);
      break;
    }
  }
});

await startBot(bot);
await updateCommands(bot);
