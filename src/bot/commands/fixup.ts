/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Bot } from "../deps.ts";
import { Interaction } from "../deps.ts";
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  InteractionResponseTypes,
} from "../deps.ts";
import { createCommand } from "./mod.ts";

const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;

const installedDemoFixupTool = (() => {
  try {
    Deno.statSync("./bin/demofixup");
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
})();

if (installedDemoFixupTool) {
  createCommand({
    name: "fixup",
    description: "Fix old demo file!",
    type: ApplicationCommandTypes.ChatInput,
    scope: "Global",
    options: [
      {
        name: "file",
        description: "Demo file.",
        type: ApplicationCommandOptionTypes.Attachment,
        required: true,
      },
    ],
    execute: async (bot: Bot, interaction: Interaction) => {
      const attachment = interaction.data?.resolved?.attachments?.first()!;
      const warnFileIsTooBigForRender =
        attachment.size > AUTORENDER_MAX_DEMO_FILE_SIZE;

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

      let tempFile = "";
      let tempFileFixed = "";

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

        tempFile = await Deno.makeTempFile({ prefix: "demo", dir: "./demos" });
        tempFileFixed = `${tempFile}_fixed`;

        await Deno.writeFile(
          tempFile,
          new Uint8Array(await demo.arrayBuffer()),
        );

        // TODO: Write own fixup tool

        const kill = new Deno.Command("./bin/demofixup", { args: [tempFile] });
        const { code } = kill.outputSync();

        console.log(`./bin/demofixup ${tempFile}`, { code });

        if (code !== 0) {
          throw new Error(`Demo fixup errored: ${code}`);
        }

        const fixed = await Deno.readFile(tempFileFixed);

        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `🔨️ Fixed old demo.` +
            (warnFileIsTooBigForRender
              ? `\n⚠️ Detected that the file is too big for a render.`
              : ""),
          file: {
            blob: new Blob([fixed]),
            name: attachment.filename.toLowerCase().endsWith(".dem")
              ? `${attachment.filename.slice(0, -4)}_fixed.dem`
              : `${attachment.filename}_fixed`,
          },
        });
      } catch (err) {
        console.error(err);

        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: `❌️ Failed to fix demo.`,
        });
      } finally {
        try {
          await Deno.remove(tempFile);
        } catch (err) {
          console.error(err);
        }

        try {
          await Deno.remove(tempFileFixed);
        } catch (err) {
          console.error(err);
        }
      }
    },
  });
}
