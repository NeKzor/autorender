/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Bot } from '../deps.ts';
import { Interaction } from '../deps.ts';
import { ApplicationCommandOptionTypes, ApplicationCommandTypes, InteractionResponseTypes } from '../deps.ts';
import { Messages, SourceDemoParser } from 'npm:@nekz/sdp';
import { createCommand } from './mod.ts';

const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;

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
    const warnFileIsTooBigForRender = attachment.size > AUTORENDER_MAX_DEMO_FILE_SIZE;

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

      const demo = parser
        .parse(buffer)
        .adjustTicks()
        .adjustRange();

      if (demo.gameDirectory !== 'portal2') {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Only old Portal 2 demos can be fixed.`,
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

      const pointSurvey = dt.tables
        .findIndex((table) => table.netTableName === 'DT_PointSurvey');

      if (pointSurvey === -1) {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ This demo does not require a fixup.`,
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

      if (mapsWhichUsePointSurvey.includes(demo.mapName!)) {
        await bot.helpers.editOriginalInteractionResponse(
          interaction.token,
          {
            content: `❌️ Unfortunately this demo cannot be fixed.`,
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
