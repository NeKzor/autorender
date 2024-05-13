/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOption,
  ApplicationCommandOptionChoice,
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Attachment,
  Bot,
  ButtonComponent,
  ButtonStyles,
  Interaction,
  InteractionDataOption,
  InteractionResponseTypes,
  InteractionTypes,
  Message,
  MessageComponentTypes,
} from '@discordeno/bot';
import { Presets } from '../services/presets.ts';
import { Queue } from '../services/queue.ts';
import { escapeMaskedLink, getPublicUrl } from '../utils/helpers.ts';
import { createCommand } from './mod.ts';
import { Video } from '~/shared/models.ts';
import { Server } from '../services/server.ts';

const AUTORENDER_BASE_API = Deno.env.get('AUTORENDER_BASE_API')!;

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

    // Input/Output: https://mel.board.portal2.sr/getDemo?id=234826

    if (
      url.origin === 'https://mel.board.portal2.sr' &&
      url.pathname === '/getDemo' &&
      url.search.startsWith('?id=')
    ) {
      const id = parseInt(url.search.slice(4), 10);
      return isNaN(id) ? null : `https://mel.board.portal2.sr/getDemo?id=${id}`;
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

    // Input:  https://autorender.portal2.sr/queue/ScDd_mkTzZs
    // Input:  https://autorender.portal2.sr/videos/ScDd_mkTzZs
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
  source?: { attachment?: Attachment; url?: string },
) => {
  const attachment = source?.attachment ?? interaction.data?.resolved?.attachments?.first();

  if (attachment) {
    if (attachment.size > Server.config.maxDemoFileSize) {
      await bot.helpers.sendInteractionResponse(
        interaction.id,
        interaction.token,
        {
          type: InteractionResponseTypes.ChannelMessageWithSource,
          data: {
            content: `❌️ File is too big. Uploads are limited to ${
              Math.trunc(Server.config.maxDemoFileSize / 1_000_000)
            } MB.`,
          },
        },
      );
      return;
    }
  } else if (!source?.url) {
    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: `❌️ Missing attachment.`,
        },
      },
    );
    return;
  }

  const url = attachment?.url ?? source?.url;
  if (!url) {
    await bot.helpers.sendInteractionResponse(
      interaction.id,
      interaction.token,
      {
        type: InteractionResponseTypes.ChannelMessageWithSource,
        data: {
          content: `❌️ Missing URL.`,
        },
      },
    );
    return;
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
    // FIXME: I wish board.portal2.sr would just return the filename
    //        in a Content-Disposition header :>
    const useManualRedirect = (new URL(url)).hostname === 'board.portal2.sr';

    const maybeRedirect = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': Deno.env.get('USER_AGENT')!,
      },
      redirect: useManualRedirect ? 'manual' : 'follow',
    });

    const [demo, originalFilename] = await (async (res) => {
      if (!useManualRedirect) {
        const contentDisposition = res.headers.get('Content-Disposition');
        const filename = contentDisposition
          ? contentDisposition.slice(
            contentDisposition.indexOf('"') + 1,
            contentDisposition.lastIndexOf('"'),
          )
          : null;

        return [res, filename];
      }

      const location = res.headers.get('Location');
      if (!location) {
        console.error({ url: res.url, headers: res.headers });
        throw new Error('Unable to redirect without location.');
      }

      const redirect = new URL(res.url);
      redirect.pathname = location;

      const demo = await fetch(redirect.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': Deno.env.get('USER_AGENT')!,
        },
      });

      return [demo, location.slice(location.lastIndexOf('/') + 1)];
    })(maybeRedirect);

    if (!demo.ok) {
      await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `❌️ Unable to download demo.`,
      });
      return;
    }

    const filename = attachment?.filename ?? originalFilename ?? 'demo.dem';

    const body = new FormData();
    const args = [...(interactionData.options?.values() ?? [])];

    for (const option of ['title', 'comment', 'quality']) {
      const value = args.find((arg) => arg.name === option)?.value;
      if (value) {
        body.append(option, value.toString());
      }
    }

    const presetName = args.find((arg) => arg.name === 'preset')?.value as string | undefined;
    if (presetName) {
      const preset = await Presets.find(interaction.user.id, presetName);
      if (!preset) {
        await bot.helpers.editOriginalInteractionResponse(interaction.token, {
          content: '❌️ This preset does not exist. Please make sure to create your own preset first.' +
            ' Use `/preset help` for more info.',
        });
        return;
      }

      body.append('render_options', preset.options.replace('sar_force_fov', 'sar_on_config_exec sar_force_fov'));
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
          'User-Agent': Deno.env.get('USER_AGENT')!,
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

      const queueMessage = await bot.helpers.editOriginalInteractionResponse(interaction.token, {
        content: `⏳️ Queued video [${title}](<${link}>) for rendering.`,
        components: [
          {
            type: MessageComponentTypes.ActionRow,
            components: buttons,
          },
        ],
      });

      if (queueMessage) {
        Queue.set(video.share_id, {
          token: interaction.token as string,
          userId: interaction.user.id,
          timestamp: queueMessage!.timestamp!,
        });
      } else {
        console.log('Unable to queue message', video.share_id);
      }
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
  {
    name: 'preset',
    description: 'Choose a custom preset.',
    type: ApplicationCommandOptionTypes.String,
    required: false,
    autocomplete: true,
  },
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
            const args = [...(subCommand.options?.values() ?? [])];
            const quality = args.find((arg) => arg.name === 'quality');
            const preset = args.find((arg) => arg.name === 'preset');

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
            } else if (preset?.focused) {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
                  data: {
                    choices: [
                      // TODO: Maybe have a custom preset by default?
                      // {
                      //   name: 'No preset (default)',
                      //   value: 'no-preset',
                      // },
                      ...(await Presets.list(interaction.user.id)).map((preset) => {
                        return {
                          name: preset.name,
                          value: preset.name,
                        };
                      }),
                    ],
                  },
                },
              );
            }
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

            let attachment: Attachment | undefined;

            for (const message of messages) {
              attachment = (message.attachments ?? []).find((attachment) => {
                return attachment.filename.endsWith('.dem');
              });

              if (attachment) {
                break;
              }
            }

            if (attachment) {
              render(bot, interaction, subCommand, { attachment });
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
              render(bot, interaction, subCommand, { attachment });
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

            render(bot, interaction, subCommand, { url });
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
