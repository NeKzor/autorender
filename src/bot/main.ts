/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This is Discord bot sends demo attachments to the  server via the `/render`
 * command. It will send a message once a video is uploaded.
 */

/// <reference lib="deno.unstable" />

import { log } from './utils/logger.ts';
import { escapeMaskedLink, getPublicUrl } from './utils/helpers.ts';
import { BotDataType, BotMessages } from './protocol.ts';
import { bot, updateCommands } from './bot.ts';
import { Queue } from './services/queue.ts';
import { Server } from './services/server.ts';

addEventListener('error', (ev) => {
  console.dir({ error: ev.error }, { depth: 16 });
});

addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();

  console.dir({ unhandledrejection: ev.reason }, { depth: 16 });

  if (ev.reason?.body) {
    Deno.stdout.writeSync(new TextEncoder().encode(ev.reason.body));
  }
});

log.info('Starting bot');

await import('./commands/bot.ts');
await import('./commands/fixup.ts');
await import('./commands/preset.ts');
await import('./commands/render.ts');
await import('./commands/vid.ts');
await import('./commands/watch.ts');

await import('./events/guildCreate.ts');
await import('./events/interactionCreate.ts');
await import('./events/ready.ts');

await updateCommands(bot);

// Worker thread for connecting to the server.
const worker = new Worker(new URL('./worker.ts', import.meta.url).href, {
  type: 'module',
});

// Handle all new incoming messages from the server
worker.addEventListener('message', async (message) => {
  try {
    if (!message.data.startsWith('{')) {
      log.info(message.data);
      return;
    }

    const { type, data } = JSON.parse(message.data) as BotMessages;

    switch (type) {
      case BotDataType.Upload: {
        const title = escapeMaskedLink(data.title);
        const link = getPublicUrl(`/videos/${data.share_id}`);

        const content = [
          `📽️ Rendered video [${title}](${link})`,
        ].join('\n');

        const interaction = Queue.getAndDelete(data.share_id);
        if (interaction) {
          await bot.helpers.editOriginalInteractionResponse(interaction.token, { content });
        } else {
          if (data.requested_in_guild_id && data.requested_in_channel_id) {
            await bot.helpers.sendMessage(data.requested_in_channel_id, { content });
          } else {
            const channel = await bot.helpers.getDmChannel(data.requested_by_id);
            await bot.helpers.sendMessage(channel.id, { content });
          }
        }
        break;
      }
      case BotDataType.Error: {
        const content = `❌️ ${data.message}`;

        const interaction = Queue.getAndDelete(data.share_id);
        if (interaction) {
          await bot.helpers.editOriginalInteractionResponse(interaction.token, { content });
        } else {
          if (data.requested_in_guild_id && data.requested_in_channel_id) {
            await bot.helpers.sendMessage(data.requested_in_channel_id, { content });
          } else {
            const channel = await bot.helpers.getDmChannel(data.requested_by_id);
            await bot.helpers.sendMessage(channel.id, { content });
          }
        }
        break;
      }
      case BotDataType.Config: {
        Server.config = data;
        break;
      }
      default: {
        console.warn('Unknown message type', type);
        break;
      }
    }
  } catch (err) {
    log.error(err);
  }
});

setInterval(() => Queue.deleteOutdated(), 60 * 1_000);

log.info('Started bot');

await bot.start();
