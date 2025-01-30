/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Bot,
  Interaction,
  InteractionResponseTypes,
} from '@discordeno/bot';
import { Messages, SourceDemoParser } from '@nekz/sdp';
import { createCommand } from './mod.ts';
import { Server } from '../services/server.ts';

createCommand({
  name: 'fixup',
  description: 'Fix an old demo file!',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Global',
  options: [
    {
      name: 'file',
      description: 'Demo file.',
      type: ApplicationCommandOptionTypes.Attachment,
      required: true,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const attachment = interaction.data?.resolved?.attachments?.first()!;
    const warnFileIsTooBigForRender = attachment.size > Server.config.maxDemoFileSize;

    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: `⏳️ Fixing file...`,
        },
      },
    );

    try {
      const res = await fetch(attachment.url, {
        method: 'GET',
        headers: {
          'User-Agent': Deno.env.get('USER_AGENT')!,
        },
      });

      if (!res.ok) {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Unable to download attachment.`,
        });
        return;
      }

      const buffer = await res.arrayBuffer();

      const parser = SourceDemoParser.default()
        .setOptions({
          dataTables: true,
        });

      const demo = parser.parse(buffer);

      // NOTE: The code here should be similar to autoFixupOldPortal2Demo in src/server/demo.ts

      if (demo.gameDirectory !== 'portal2' && demo.gameDirectory !== 'Portal 2 Speedrun Mod') {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Only Portal 2 demos require a fixup.`,
        });
        return;
      }

      const dt = demo.findMessage(Messages.DataTable)?.dataTable;
      if (!dt) {
        console.error(`DataTable message not found in demo.`);
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Unable to parse demo.`,
        });
        return;
      }

      const mapsWhichUsePointSurvey = [
        'sp_a2_bts2',
        'sp_a2_bts3',
        'sp_a3_portal_intro',
        'sp_a2_core',
        'sp_a2_bts4',
      ];

      const pointCameraClasses = dt.serverClasses.filter((table) => table.className === 'CPointCamera');

      // Fixup not needed for already fixed demos.
      if (pointCameraClasses.length === 2) {
        if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
          await bot.helpers.editOriginalInteractionResponse(interaction.token, {
            content:
              '❌️ This demo has been corrupted by demofixup.\nSee [p2sr/demofixup#2](https://github.com/p2sr/demofixup/issues/2)',
          });
          return;
        }

        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ This demo has been fixed already.`,
        });
        return;
      }

      const pointSurvey = dt.tables
        .findIndex((table) => table.netTableName === 'DT_PointSurvey');

      // Fixup not needed for new demos.
      if (pointSurvey === -1) {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ This demo does not require a fixup because it was played on the latest version.`,
        });
        return;
      }

      if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
        await bot.helpers.editOriginalInteractionResponse(
          interaction.token,
          {
            content:
              `❌️ Unfortunately this demo cannot be fixed.\nSee [p2sr/demofixup#2](https://github.com/p2sr/demofixup/issues/2)`,
          },
        );
        return;
      }

      dt.tables.splice(pointSurvey, 1);

      const svc = dt.serverClasses.find((table) => table.dataTableName === 'DT_PointSurvey');

      if (!svc) {
        console.error(`CPointCamera server class not found in demo.`);
        await bot.helpers.editOriginalInteractionResponse(
          interaction.token,
          {
            content: `❌️ Unable to parse demo.`,
          },
        );
        return;
      }

      svc.className = 'CPointCamera';
      svc.dataTableName = 'DT_PointCamera';

      const fixed = parser.save(demo, buffer.byteLength);

      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `🔨️ Fixed old demo.` +
          (warnFileIsTooBigForRender ? `\n⚠️ Detected that the file is too big for a render.` : ''),
        files: [
          {
            blob: new Blob([fixed]),
            name: attachment.filename.toLowerCase().endsWith('.dem')
              ? `${attachment.filename.slice(0, -4)}_fixed.dem`
              : `${attachment.filename}_fixed`,
          },
          {
            blob: new Blob([buffer]),
            name: attachment.filename,
          },
        ],
      });
    } catch (err) {
      console.error(err);

      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `❌️ Failed to fix demo.`,
      });
    }
  },
});
