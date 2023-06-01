/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import "https://deno.land/std@0.190.0/dotenv/load.ts";

import { ActivityTypes, createBot, enableCachePlugin, enableCacheSweepers, fastFileLoader, GatewayIntents, sendDirectMessage, startBot } from './deps.ts'
import { logger } from './utils/logger.ts'
import { events } from './events/mod.ts'
import { updateCommands } from './utils/helpers.ts'

const log = logger({ name: 'Main' })

log.info('Starting Bot, this might take a while...')

const paths = ['./events', './commands']
await fastFileLoader(paths).catch((err) => {
  log.fatal(`Unable to Import ${paths}`)
  log.fatal(err)
  Deno.exit(1)
})

export const bot = enableCachePlugin(
  createBot({
    token: Deno.env.get('DISCORD_BOT_TOKEN') ?? '',
    botId: BigInt(Deno.env.get('DISCORD_BOT_ID') ?? ''),
    intents: GatewayIntents.Guilds,
    events,
  }),
)

// @ts-nocheck: no-updated-depencdencies
enableCacheSweepers(bot)

bot.gateway.manager.createShardOptions.makePresence = (shardId: number) => {
  return {
    shardId,
    status: 'online',
    activities: [
      {
        name: 'Render videos On-Demand!',
        type: ActivityTypes.Watching,
        createdAt: Date.now(),
      },
    ],
  }
}

// Notifications worker.
const worker = new Worker(new URL("./worker.ts", import.meta.url).href, { type: "module" });

worker.addEventListener('message', (notification) => {
  console.log('notification', notification.data);

  if (notification.data.requested_by_id as string) {
    sendDirectMessage(bot, notification.data.requested_by_id, {
      content: [
        `📽️ Finished rendering "${notification.data.title ?? "*untitled*"}" video`,
        `📺️ https://autorender.nekz.me/watch/${notification.data.video_id ?? ''}`,
      ].join('\n'),
    });
  }
});

await startBot(bot)

await updateCommands(bot)
