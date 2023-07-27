/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Video } from '../../server/models.ts';
import {
  ApplicationCommandOption,
  ApplicationCommandOptionChoice,
  Attachment,
  Bot,
  ButtonComponent,
  ButtonStyles,
  InteractionDataOption,
  InteractionTypes,
  Message,
  MessageComponentTypes,
} from '../deps.ts';
import { Interaction } from '../deps.ts';
import { ApplicationCommandOptionTypes, ApplicationCommandTypes, InteractionResponseTypes } from '../deps.ts';
import { escapeMaskedLink, getPublicUrl } from '../utils/helpers.ts';
import { createCommand } from './mod.ts';

const AUTORENDER_BASE_API = Deno.env.get('AUTORENDER_BASE_API')!;
const AUTORENDER_MAX_DEMO_FILE_SIZE = 6_000_000;

const validateUrl = (urlString: string) => {
  try {
    const url = new URL(urlString);

    // Input/Output: https://board.portal2.sr/getDemo?id=234826

    if (
      url.origin === 'https://board.portal2.sr' &&
      url.pathname === '/getDemo' &&
      url.search.startsWith('?id=')
    ) {
      const id = parseInt(url.search.slice(4), 10);
      return isNaN(id) ? null : `https://board.portal2.sr/getDemo?id=${id}`;
    }

    // Input:  https://autorender.portal2.sr/video.html?v=234826
    // Output: https://board.portal2.sr/getDemo?id=234826

    if (
      url.origin === 'https://autorender.portal2.sr' &&
      url.pathname === '/video.html' &&
      url.search.startsWith('?v=')
    ) {
      const id = parseInt(url.search.slice(3), 10);
      return isNaN(id) ? null : `https://board.portal2.sr/getDemo?id=${id}`;
    }

    // Input:  https://autorender.nekz.me/queue/ScDd_mkTzZs
    // Input:  https://autorender.nekz.me/videos/ScDd_mkTzZs
    // Output: {AUTORENDER_BASE_API}/storage/demos/ScDd_mkTzZs

    const queueUrl = getPublicUrl('/queue/');
    const videosUrl = getPublicUrl('/videos/');

    if (
      (url.origin === queueUrl.origin && url.pathname.startsWith(queueUrl.pathname)) ||
      (url.origin === videosUrl.origin && url.pathname.startsWith(videosUrl.pathname))
    ) {
      const [shareId] = url.pathname.split('/', 3).slice(2);
      return /^[0-9A-Za-z_-]{10}[048AEIMQUYcgkosw]$/.test(shareId ?? '')
        ? `${AUTORENDER_BASE_API}/storage/demos/${shareId}`
        : null;
    }

    // deno-lint-ignore no-empty
  } catch {
  }

  return null;
};

const render = async (
  bot: Bot,
  interaction: Interaction,
  interactionData: InteractionDataOption,
  attachmentOrUrl?: Attachment | string,
) => {
  const isAttachment = typeof attachmentOrUrl === 'object';

  if (isAttachment) {
    const attachment = attachmentOrUrl ?? interaction.data?.resolved?.attachments?.first()!;

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
    const demo = await fetch(isAttachment ? attachmentOrUrl.url : attachmentOrUrl!, {
      method: 'GET',
      headers: {
        'User-Agent': 'autorender-bot v1.0',
      },
    });

    if (!demo.ok) {
      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `❌️ Unable to download demo.`,
      });
      return;
    }

    const extractFilenameFromHeaders = () => {
      const location = demo.headers.get('Location');
      return location ? location.slice(location.lastIndexOf('/')) : 'demo.dem';
    };

    const filename = isAttachment ? attachmentOrUrl.filename : extractFilenameFromHeaders();

    const body = new FormData();
    const args = [...(interactionData.options?.values() ?? [])];

    for (const option of ['title', 'comment', 'quality', 'render_options']) {
      const value = args.find((arg) => arg.name === option)?.value;
      if (value) {
        body.append(option, value.toString());
      }
    }

    if (!body.get('title')) {
      body.append('title', filename.slice(0, 64));
    }

    // NOTE: We have to reorder the file before something else, thanks to this wonderful bug in oak.
    //       https://github.com/oakserver/oak/issues/581

    body.append('files', await demo.blob(), filename);

    const requestedByName = interaction.user.discriminator !== '0'
      ? `${interaction.user.username}#${interaction.user.discriminator}`
      : interaction.user.username;

    const requestedById = interaction.user.id.toString();
    const requestedInGuildId = interaction.guildId?.toString();
    const requestedInChannelId = interaction.channelId?.toString();

    body.append('requested_by_name', requestedByName);
    body.append('requested_by_id', requestedById);

    if (requestedInGuildId) {
      body.append('requested_in_guild_id', requestedInGuildId);

      const guildName = (await bot.helpers.getGuild(requestedInGuildId)).name;
      if (guildName) {
        body.append('requested_in_guild_name', guildName);
      }
    }

    if (requestedInChannelId) {
      body.append('requested_in_channel_id', requestedInChannelId);

      const channelName = (await bot.helpers.getChannel(requestedInChannelId)).name;
      if (channelName) {
        body.append('requested_in_channel_name', channelName);
      }
    }

    const response = await fetch(
      `${AUTORENDER_BASE_API}/api/v1/videos/render`,
      {
        method: 'PUT',
        headers: {
          'User-Agent': 'autorender-bot v1.0',
          Authorization: `Bearer ${
            encodeURIComponent(
              Deno.env.get('AUTORENDER_BOT_TOKEN')!,
            )
          }`,
        },
        body,
      },
    );

    if (response.ok) {
      const video = await response.json() as Video;

      const title = escapeMaskedLink(video.title);
      const link = getPublicUrl(`/queue/${video.share_id}`).toString();

      const buttons: [ButtonComponent] | [ButtonComponent, ButtonComponent] = [
        {
          type: MessageComponentTypes.Button,
          label: 'Download Demo',
          style: ButtonStyles.Link,
          url: getPublicUrl(`/storage/demos/${video.share_id}`).toString(),
        },
      ];

      if (video.demo_required_fix) {
        buttons.push({
          type: MessageComponentTypes.Button,
          label: 'Download Fixed Demo',
          style: ButtonStyles.Link,
          url: getPublicUrl(`/storage/demos/${video.share_id}/fixed`).toString(),
        });
      }

      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `⏳️ Queued video [${title}](<${link}>) for rendering.`,
        components: [
          {
            type: MessageComponentTypes.ActionRow,
            components: buttons,
          },
        ],
      });
    } else {
      if (
        response.headers.get('Content-Type')?.includes('application/json')
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
};

const renderOptions: ApplicationCommandOption[] = [
  {
    name: 'title',
    description: 'Video title.',
    type: ApplicationCommandOptionTypes.String,
    required: false,
    maxLength: 64,
  },
  {
    name: 'comment',
    description: 'Video comment.',
    type: ApplicationCommandOptionTypes.String,
    required: false,
    maxLength: 512,
  },
  {
    name: 'quality',
    description: 'Quality option (default 720p).',
    type: ApplicationCommandOptionTypes.String,
    required: false,
    autocomplete: true,
  },
  // TODO: Come up with a better solution.
  //       Maybe with custom pre-defined settings?
  // {
  //   name: "render_options",
  //   description: "Render options e.g. sar_ihud 1, mat_fullbright 1",
  //   type: ApplicationCommandOptionTypes.String,
  //   required: false,
  //   maxLength: 1024,
  // },
];

createCommand({
  name: 'render',
  description: 'Render a demo file!',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Guild',
  options: [
    {
      name: 'demo',
      description: 'Render a demo file!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'file',
          description: 'Demo file.',
          type: ApplicationCommandOptionTypes.Attachment,
          required: true,
        },
        ...renderOptions,
      ],
    },
    {
      name: 'message',
      description: 'Render a demo file from a message!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'url-or-id',
          description: 'Message URL or ID containing a demo file.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        ...renderOptions,
      ],
    },
    {
      name: 'latest',
      description: 'Render the latest demo file in the channel!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        ...renderOptions,
      ],
    },
    {
      name: 'link',
      description: 'Render a demo file or re-render a video by link!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'url',
          description: 'The URL to the demo or video.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
        },
        ...renderOptions,
      ],
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const subCommand = [...(interaction.data?.options?.values() ?? [])].at(0)!;

    switch (interaction.type) {
      case InteractionTypes.ApplicationCommandAutocomplete: {
        switch (subCommand.name) {
          case 'demo':
          case 'latest':
          case 'message':
          case 'link': {
            checkQualityOptions(bot, interaction, subCommand);
            break;
          }
          default:
            break;
        }
        break;
      }
      case InteractionTypes.ApplicationCommand: {
        if (!validateQualityOption(subCommand)) {
          await bot.helpers.sendInteractionResponse(
            interaction.id,
            interaction.token,
            {
              type: InteractionResponseTypes.ChannelMessageWithSource,
              data: {
                content: `❌️ Invalid quality option.`,
              },
            },
          );
          return;
        }

        switch (subCommand.name) {
          case 'demo':
            render(bot, interaction, subCommand);
            break;
          case 'latest': {
            const messages = await bot.helpers.getMessages(
              interaction.channelId!,
              {
                limit: 10,
              },
            );

            const attachment = messages.find((message) => {
              return (message.attachments ?? []).find((attachment) => {
                return attachment.filename.endsWith('.dem');
              });
            })?.attachments?.at(0);

            if (attachment) {
              render(bot, interaction, subCommand, attachment);
            } else {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `❌️ Unable to find any message with an attached demo file.`,
                  },
                },
              );
            }
            break;
          }
          case 'message': {
            const args = [...(subCommand.options?.values() ?? [])];
            const messageUrlOrId = args.find((arg) => arg.name === 'url-or-id')!
              .value as string;

            let message: Message | null = null;

            try {
              const url = new URL(messageUrlOrId);

              try {
                const [route, _guildId, channelId, messageId] = url.pathname
                  .split(
                    '/',
                  )
                  .filter((x) => x);

                if (route !== 'channels') {
                  throw new Error('Invalid route.');
                }

                if (channelId == undefined) {
                  throw new Error('Invalid channel ID.');
                }

                if (messageId === undefined) {
                  throw new Error('Invalid message ID.');
                }

                message = await bot.helpers.getMessage(channelId, messageId);
              } catch (_err) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Invalid message URL.`,
                    },
                  },
                );
              }
            } catch (_err) {
              try {
                message = await bot.helpers.getMessage(interaction.channelId!, messageUrlOrId);
              } catch (_err) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Invalid URL or message ID.`,
                    },
                  },
                );
              }
            }

            if (!message) {
              return;
            }

            const attachment = message.attachments?.at(0);

            if (attachment) {
              render(bot, interaction, subCommand, attachment);
            } else {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `❌️ Unable to find an attached demo file for this message.`,
                  },
                },
              );
            }
            break;
          }
          case 'link': {
            const args = [...(subCommand.options?.values() ?? [])];
            const urlArg = args.find((arg) => arg.name === 'url')!
              .value as string;

            const url = validateUrl(urlArg);

            if (!url) {
              const domain = getPublicUrl('/').hostname;

              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `❌️ Invalid URL. Only links from portal2.sr and ${domain} are supported.`,
                  },
                },
              );
              return;
            }

            render(bot, interaction, subCommand, url);
            break;
          }
          default:
            break;
        }
        break;
      }
    }
  },
});

const qualityOptionChoices: ApplicationCommandOptionChoice[] = [
  {
    name: '480p (SD)',
    value: '480p',
  },
  {
    name: '720p (HD)',
    value: '720p',
  },
  {
    name: '1080p (FHD)',
    value: '1080p',
  },
  // TODO: Client render might or might not support these resolutions.
  //       Allowing these would also mean we need more storage...
  // {
  //   name: "1440p (QHD)",
  //   value: "1440p",
  // },
  // {
  //   name: "2160p (UHD)",
  //   value: "2160p",
  // },
];

const checkQualityOptions = async (
  bot: Bot,
  interaction: Interaction,
  interactionData: InteractionDataOption,
) => {
  const args = [...(interactionData.options?.values() ?? [])];
  const quality = args.find((arg) => arg.name === 'quality');

  if (quality?.focused) {
    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
        data: {
          choices: qualityOptionChoices,
        },
      },
    );
  }
};

const validateQualityOption = (
  interactionData: InteractionDataOption,
) => {
  const args = [...(interactionData.options?.values() ?? [])];
  const quality = args.find((arg) => arg.name === 'quality')?.value;

  if (!quality) {
    return true;
  }

  return qualityOptionChoices.some((option) => quality === option.value);
};
