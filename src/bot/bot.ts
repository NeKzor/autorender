/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOption,
  ApplicationCommandTypes,
  Bot,
  Collection,
  CompleteDesiredProperties,
  CreateApplicationCommand,
  createBot,
  createDesiredPropertiesObject,
  DesiredPropertiesBehavior,
  Guild,
  Intents,
} from '@discordeno/bot';
import { log } from './utils/logger.ts';

const _bot = <DiscordBot> createBot({
  token: Deno.env.get('DISCORD_BOT_TOKEN')!,
  applicationId: BigInt(Deno.env.get('DISCORD_BOT_ID')!),
  intents: Intents.Guilds,
  desiredProperties: createDesiredPropertiesObject({}, true),
});

export type DiscordBot =
  & Bot<
    // deno-lint-ignore ban-types
    CompleteDesiredProperties<{}, true>,
    DesiredPropertiesBehavior.RemoveKey
  >
  & {
    commands: Collection<string, Command>;
    guilds: Map<bigint, Guild>;
  };

export type DiscordInteraction = DiscordBot['transformers']['$inferredTypes']['interaction'];

export const bot = _bot as DiscordBot;
bot.commands = new Collection();
bot.guilds = new Map<bigint, Guild>();

export type SubCommand = Omit<Command, 'subcommands'>;
export interface SubCommandGroup {
  name: string;
  subCommands: SubCommand[];
}
export interface Command {
  name: string;
  description: string;
  usage?: string[];
  options?: ApplicationCommandOption[];
  type: ApplicationCommandTypes;
  /** Defaults to `Guild` */
  scope?: 'Global' | 'Guild';
  guilds?: bigint[];
  execute: (bot: DiscordBot, interaction: DiscordInteraction) => unknown;
  subcommands?: (SubCommandGroup | SubCommand)[];
}

/**
 * Create a new command.
 *
 * @param command - The new command.
 */
export function createCommand(command: Command) {
  bot.commands.set(command.name, command);
}

/**
 * Update global commands.
 *
 * @param bot - The bot object.
 */
export async function updateCommands(bot: DiscordBot) {
  const globalCommands = bot.commands
    .filter(({ scope }) => scope === 'Global' || scope === undefined)
    .map(({ name, description, type, options }) => ({
      name,
      description,
      type,
      options,
    } satisfies CreateApplicationCommand));

  if (!globalCommands.length) {
    return;
  }

  log.info(`Updating ${globalCommands.length} global commands`);

  await bot.helpers.upsertGlobalApplicationCommands(globalCommands)
    .catch(log.error);
}

/**
 * Update guild specific commands.
 *
 * @param bot - The bot object.
 * @param guild - The guild object.
 */
export async function updateGuildCommands(bot: DiscordBot, guild: Guild) {
  const guildCommands = bot.commands
    .filter(({ scope, guilds }) => scope === 'Guild' && (!guilds?.length || guilds.includes(guild.id)))
    .map(({ name, description, type, options }) => ({
      name,
      description,
      type,
      options,
    } satisfies CreateApplicationCommand));

  if (!guildCommands.length) {
    return;
  }

  log.info(`Updating ${guildCommands.length} commands for guild ${guild.id}`);

  await bot.helpers.upsertGuildApplicationCommands(guild.id, guildCommands)
    .catch(log.error);
}

/**
 * Get the guild by ID.
 *
 * @param bot - The bot object.
 * @param guildId - The ID of the guild.
 * @returns - Guild object.
 */
export async function getGuildFromId(
  bot: DiscordBot,
  guildId: bigint,
): Promise<Guild> {
  let returnValue: Guild = {} as Guild;

  if (guildId !== 0n) {
    const guild = bot.guilds.get(guildId);
    if (guild) {
      returnValue = guild;
    }

    await bot.helpers.getGuild(guildId).then((guild) => {
      if (guild) {
        bot.guilds.set(guildId, guild as Guild);
        returnValue = guild as Guild;
      }
    });
  }

  return returnValue;
}
