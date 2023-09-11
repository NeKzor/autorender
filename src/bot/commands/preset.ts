/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  Bot,
  ButtonStyles,
  Interaction,
  InteractionResponseTypes,
  InteractionTypes,
  MessageComponentTypes,
  MessageFlags,
  TextStyles,
} from '@discordeno/bot';
import { Presets, RenderPreset } from '../services/presets.ts';
import { escapeMarkdown, parseCustomId } from '../utils/helpers.ts';
import { createCommand } from './mod.ts';

createCommand({
  name: 'preset',
  description: 'Custom predefined render preset!',
  type: ApplicationCommandTypes.ChatInput,
  scope: 'Global',
  options: [
    {
      name: 'create',
      description: 'Create a render preset!',
      type: ApplicationCommandOptionTypes.SubCommand,
    },
    {
      name: 'get',
      description: 'Get a render preset!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'name',
          description: 'The name of the preset.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: 'edit',
      description: 'Edit a render preset!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'name',
          description: 'The name of the preset to edit.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: 'delete',
      description: 'Delete a render preset!',
      type: ApplicationCommandOptionTypes.SubCommand,
      options: [
        {
          name: 'name',
          description: 'The name of the preset to delete.',
          type: ApplicationCommandOptionTypes.String,
          required: true,
          autocomplete: true,
        },
      ],
    },
    {
      name: 'help',
      description: 'Get a list of supported options!',
      type: ApplicationCommandOptionTypes.SubCommand,
    },
  ],
  execute: async (bot: Bot, interaction: Interaction) => {
    const subCommand = [...(interaction.data?.options?.values() ?? [])].at(0)!;

    switch (interaction.type) {
      case InteractionTypes.ApplicationCommandAutocomplete: {
        switch (subCommand.name) {
          case 'get':
          case 'edit':
          case 'delete': {
            const args = [...(subCommand.options?.values() ?? [])];
            const name = args.find((arg) => arg.name === 'name');

            if (name?.focused) {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ApplicationCommandAutocompleteResult,
                  data: {
                    choices: (await Presets.list(interaction.user.id)).map((preset) => {
                      return {
                        name: preset.name,
                        value: preset.name,
                      };
                    }),
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
      case InteractionTypes.MessageComponent: {
        const [button, name] = parseCustomId(interaction.data?.customId);

        switch (button) {
          case 'edit': {
            try {
              if (!name?.length) {
                throw new Error(`Invalid preset name.`);
              }

              const preset = await Presets.find(interaction.user.id, name);
              if (!preset) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Failed to find preset.`,
                      flags: MessageFlags.Ephemeral,
                    },
                  },
                );
                return;
              }

              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.Modal,
                  data: {
                    title: `Edit preset "${preset.name}"`,
                    customId: `preset_edit_${preset.name}`,
                    components: [
                      {
                        type: MessageComponentTypes.ActionRow,
                        components: [
                          {
                            type: MessageComponentTypes.InputText,
                            style: TextStyles.Paragraph,
                            customId: 'options',
                            label: 'Options',
                            placeholder: 'Please enter your new render commands',
                            maxLength: 1024,
                            required: true,
                            value: preset.options,
                          },
                        ],
                      },
                    ],
                  },
                },
              );
            } catch (err) {
              console.error(err);

              await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                content: `❌️ Failed to edit preset.`,
              });
            }
            break;
          }
          default:
            break;
        }
        break;
      }
      case InteractionTypes.ModalSubmit: {
        const [subCommand, presetName] = parseCustomId(interaction.data?.customId);

        switch (subCommand) {
          case 'create':
          case 'edit': {
            try {
              const isEdit = subCommand === 'edit';

              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: interaction.message
                    ? InteractionResponseTypes.UpdateMessage
                    : InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `📃️ ${isEdit ? 'Updating' : 'Creating'} preset...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const modal = interaction.data?.components;

              const name = presetName ?? modal?.at(0)?.components?.at(0)?.value ?? '';
              const options = modal?.at(isEdit ? 0 : 1)?.components?.at(0)?.value!;

              const [validOptions, invalidOptions] = validatePresetOptions(options);

              const preset: RenderPreset = {
                userId: interaction.user.id,
                name,
                options: validOptions!.join('\n'),
              };

              const { ok } = await Presets.update(preset);
              if (!ok) {
                await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                  content: `❌️ Failed to ${isEdit ? 'update' : 'create'} preset.`,
                });
                return;
              }

              const presetOptions = validOptions!.length
                ? [
                  '```',
                  validOptions!.join('\n'),
                  '```',
                ]
                : [
                  `Empty preset.`,
                ];

              const status = invalidOptions!.length
                ? [
                  `Errors found:`,
                  '```',
                  invalidOptions!.join('\n'),
                  '```',
                  'Use `/preset help` to list all supported commands.',
                ]
                : [];

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: [
                    `${isEdit ? 'Updated' : 'Created'} preset "${preset.name}"`,
                    ...presetOptions,
                    ...status,
                  ].join('\n'),
                  components: [
                    {
                      type: MessageComponentTypes.ActionRow,
                      components: [
                        {
                          type: MessageComponentTypes.Button,
                          label: 'Edit',
                          style: ButtonStyles.Primary,
                          customId: `preset_edit_${preset.name}`,
                        },
                      ],
                    },
                  ],
                },
              );
            } catch (err) {
              console.error(err);

              await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                content: `❌️ Failed to create preset.`,
              });
            }
            break;
          }
          default:
            break;
        }
        break;
      }
      case InteractionTypes.ApplicationCommand: {
        switch (subCommand.name) {
          case 'create': {
            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.Modal,
                  data: {
                    title: `Create preset`,
                    customId: [interaction.data?.name, subCommand.name].join('_'),
                    components: [
                      {
                        type: MessageComponentTypes.ActionRow,
                        components: [
                          {
                            type: MessageComponentTypes.InputText,
                            style: TextStyles.Short,
                            customId: 'name',
                            label: 'Name',
                            maxLength: 32,
                            required: true,
                          },
                        ],
                      },
                      {
                        type: MessageComponentTypes.ActionRow,
                        components: [
                          {
                            type: MessageComponentTypes.InputText,
                            style: TextStyles.Paragraph,
                            customId: 'options',
                            label: 'Options',
                            placeholder: 'Please enter your render commands e.g. sar_ihud 1',
                            minLength: 1,
                            maxLength: 1024,
                            required: true,
                          },
                        ],
                      },
                    ],
                  },
                },
              );
            } catch (err) {
              console.error(err);
            }
            break;
          }
          case 'edit': {
            const args = [...(subCommand.options?.values() ?? [])];
            const name = args.find((arg) => arg.name === 'name')!
              .value as string;

            try {
              const preset = await Presets.find(interaction.user.id, name);

              if (!preset) {
                await bot.helpers.sendInteractionResponse(
                  interaction.id,
                  interaction.token,
                  {
                    type: InteractionResponseTypes.ChannelMessageWithSource,
                    data: {
                      content: `❌️ Failed to find preset.`,
                      flags: MessageFlags.Ephemeral,
                    },
                  },
                );
                return;
              }

              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.Modal,
                  data: {
                    title: `Edit preset "${preset.name}"`,
                    customId: `preset_edit_${preset.name}`,
                    components: [
                      {
                        type: MessageComponentTypes.ActionRow,
                        components: [
                          {
                            type: MessageComponentTypes.InputText,
                            style: TextStyles.Paragraph,
                            customId: 'options',
                            label: 'Options',
                            placeholder: 'Please enter your render commands e.g. sar_ihud 1',
                            minLength: 1,
                            maxLength: 1024,
                            required: true,
                            value: preset.options,
                          },
                        ],
                      },
                    ],
                  },
                },
              );
            } catch (err) {
              console.error(err);

              await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                content: `❌️ Failed to edit preset.`,
              });
            }
            break;
          }
          case 'get': {
            const args = [...(subCommand.options?.values() ?? [])];
            const name = args.find((arg) => arg.name === 'name')!
              .value as string;

            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `📃️ Finding preset...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const preset = await Presets.find(interaction.user.id, name);

              if (!preset) {
                await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                  content: `❌️ Failed to find preset.`,
                });
                return;
              }

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `${preset.name}\n\`\`\`\n${preset.options}\n\`\`\``,
                  components: [
                    {
                      type: MessageComponentTypes.ActionRow,
                      components: [
                        {
                          type: MessageComponentTypes.Button,
                          label: 'Edit',
                          style: ButtonStyles.Primary,
                          customId: `preset_edit_${preset.name}`,
                        },
                      ],
                    },
                  ],
                },
              );
            } catch (err) {
              console.error(err);

              await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                content: `❌️ Failed to find preset.`,
              });
            }
            break;
          }
          case 'delete': {
            const args = [...(subCommand.options?.values() ?? [])];
            const name = args.find((arg) => arg.name === 'name')!
              .value as string;

            try {
              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: `📃️ Deleting preset...`,
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );

              const preset = await Presets.find(interaction.user.id, name);

              if (!preset) {
                await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                  content: `❌️ Failed to find preset.`,
                });
                return;
              }

              await Presets.delete(preset);

              await bot.helpers.editOriginalInteractionResponse(
                interaction.token,
                {
                  content: `📃️ Deleted preset.`,
                },
              );
            } catch (err) {
              console.error(err);

              await bot.helpers.editOriginalInteractionResponse(interaction.token, {
                content: `❌️ Failed to create preset.`,
              });
            }
            break;
          }
          case 'help': {
            try {
              const supported = supportedCommands.map((command) => {
                switch (command.argType) {
                  case 'float':
                  case 'integer': {
                    let range = '';
                    if (command.range) {
                      const [min, max] = command.range;
                      range = `:${min !== undefined ? min : ''}..${max !== undefined ? max : ''}`;
                    }
                    return `${command.name} [${command.argType}${range}]`;
                  }
                  case 'multiple': {
                    return `${command.name} ...`;
                  }
                  case 'any':
                  case 'string': {
                    return `${command.name} [${command.argType}]`;
                  }
                }
              });

              const buffer = new TextEncoder().encode(supported.join('\n'));

              await bot.helpers.sendInteractionResponse(
                interaction.id,
                interaction.token,
                {
                  type: InteractionResponseTypes.ChannelMessageWithSource,
                  data: {
                    content: [
                      '`/preset create` - create a new preset',
                      '`/preset get` - show a preset',
                      '`/preset edit` - update a preset',
                      '`/preset delete` - delete a preset',
                      '',
                      'The following commands are supported:',
                    ].join('\n'),
                    files: [
                      {
                        name: 'supported_preset_commands.txt',
                        blob: new Blob([buffer]),
                      },
                    ],
                    flags: MessageFlags.Ephemeral,
                  },
                },
              );
            } catch (err) {
              console.error(err);
            }
            break;
          }
          default:
            break;
        }
        break;
      }
      default:
        break;
    }
  },
});

type ConsoleCommand = {
  name: string;
  noArgs?: boolean;
  range?: [number | undefined, number | undefined];
  validValues?: (number | string)[];
  argType?: 'string' | 'integer' | 'float' | 'any' | 'multiple';
};

const supportedCommands: ConsoleCommand[] = [
  { name: 'mat_ambient_light_r', argType: 'float', range: [0, 1] },
  { name: 'mat_ambient_light_g', argType: 'float', range: [0, 1] },
  { name: 'mat_ambient_light_b', argType: 'float', range: [0, 1] },
  { name: 'mat_fullbright', argType: 'integer', range: [0, 1] },
  { name: 'sar_force_fov', argType: 'integer', range: [45, 140] },
  { name: 'sar_hud_angles', argType: 'integer' },
  { name: 'sar_hud_avg', argType: 'integer' },
  { name: 'sar_hud_bg', argType: 'integer' },
  { name: 'sar_hud_cps', argType: 'integer' },
  { name: 'sar_hud_demo', argType: 'integer' },
  { name: 'sar_hud_duckstate', argType: 'integer' },
  { name: 'sar_hud_ent_slot_serial', argType: 'integer' },
  { name: 'sar_hud_eyeoffset', argType: 'integer' },
  { name: 'sar_hud_font_color', argType: 'string' },
  { name: 'sar_hud_font_index', argType: 'integer' },
  { name: 'sar_hud_frame', argType: 'integer' },
  { name: 'sar_hud_fps', argType: 'integer' },
  { name: 'sar_hud_ghost_spec', argType: 'integer' },
  { name: 'sar_hud_grounded', argType: 'integer' },
  { name: 'sar_hud_groundframes', argType: 'integer' },
  { name: 'sar_hud_groundspeed', argType: 'integer' },
  { name: 'sar_hud_inspection', argType: 'integer' },
  { name: 'sar_hud_jump', argType: 'integer' },
  { name: 'sar_hud_jump_peak', argType: 'integer' },
  { name: 'sar_hud_jumps', argType: 'integer' },
  { name: 'sar_hud_last_frame', argType: 'integer' },
  { name: 'sar_hud_last_session', argType: 'integer' },
  { name: 'sar_hud_orange_only', argType: 'integer' },
  { name: 'sar_hud_pause_timer', argType: 'integer' },
  { name: 'sar_hud_portal_angles', argType: 'integer' },
  { name: 'sar_hud_portal_angles_2', argType: 'integer' },
  { name: 'sar_hud_portals', argType: 'integer' },
  { name: 'sar_hud_position', argType: 'integer' },
  { name: 'sar_hud_precision', argType: 'integer' },
  { name: 'sar_hud_rainbow', argType: 'integer' },
  { name: 'sar_hud_session', argType: 'integer' },
  { name: 'sar_hud_spacing', argType: 'integer' },
  { name: 'sar_hud_steps', argType: 'integer' },
  { name: 'sar_hud_sum', argType: 'integer' },
  { name: 'sar_hud_tastick', argType: 'integer' },
  { name: 'sar_hud_tbeam', argType: 'integer' },
  { name: 'sar_hud_tbeam_count', argType: 'integer' },
  { name: 'sar_hud_timer', argType: 'integer' },
  { name: 'sar_hud_trace', argType: 'integer' },
  { name: 'sar_hud_velang', argType: 'integer' },
  { name: 'sar_hud_velocity', argType: 'integer' },
  { name: 'sar_hud_velocity_peak', argType: 'integer' },
  { name: 'sar_hud_velocity_precision', argType: 'integer' },
  { name: 'sar_hud_x', argType: 'integer' },
  { name: 'sar_hud_y', argType: 'integer' },
  { name: 'sar_ihud', argType: 'integer' },
  { name: 'sar_ihud_analog_image_scale', argType: 'float', range: [0, 1] },
  { name: 'sar_ihud_analog_view_deshake', argType: 'integer', range: [0, 1] },
  { name: 'sar_ihud_grid_padding', argType: 'integer' },
  { name: 'sar_ihud_grid_size', argType: 'integer' },
  { name: 'sar_ihud_modify', argType: 'string' },
  { name: 'sar_ihud_preset', argType: 'string' },
  { name: 'sar_ihud_setpos', argType: 'string' },
  { name: 'sar_ihud_x', argType: 'integer' },
  { name: 'sar_ihud_y', argType: 'integer' },
  { name: 'sar_lphud', argType: 'integer' },
  { name: 'sar_lphud_font', argType: 'integer' },
  { name: 'sar_lphud_set', argType: 'integer' },
  { name: 'sar_lphud_setpos', argType: 'string' },
  { name: 'sar_lphud_x', argType: 'integer' },
  { name: 'sar_lphud_y', argType: 'integer' },
  { name: 'sar_pip_align', argType: 'string' },
  { name: 'sar_portalgun_hud', argType: 'integer' },
  { name: 'sar_portalgun_hud_x', argType: 'integer' },
  { name: 'sar_portalgun_hud_y', argType: 'integer' },
  { name: 'sar_pp_hud', argType: 'integer' },
  { name: 'sar_pp_hud_font', argType: 'integer' },
  { name: 'sar_pp_hud_opacity', argType: 'integer', range: [0, 255] },
  { name: 'sar_pp_hud_show_blue', argType: 'integer' },
  { name: 'sar_pp_hud_show_orange', argType: 'integer' },
  { name: 'sar_pp_hud_x', argType: 'integer' },
  { name: 'sar_pp_hud_y', argType: 'integer' },
  { name: 'sar_vphys_hud', argType: 'integer' },
  { name: 'sar_vphys_hud_font', argType: 'integer' },
  { name: 'sar_vphys_hud_precision', argType: 'integer' },
  { name: 'sar_vphys_hud_show_hitboxes', argType: 'integer' },
  { name: 'sar_vphys_hud_x', argType: 'integer' },
  { name: 'sar_vphys_hud_y', argType: 'integer' },
];

const validatePresetOptions = (options: string) => {
  console.log({ options });
  const result: string[] = [];
  const errors: string[] = [];

  const commands = options.trim().split('\n');

  for (const line of commands) {
    const command = line.trim();

    if (command.length === 0) {
      continue;
    }

    if (!/^[a-zA-Z0-9_ .=# ]+$/g.test(command)) {
      errors.push(`Invalid character found: "${escapeMarkdown(command)}"`);
      continue;
    }

    const tokens = command.split(' ', 3);
    const argCount = tokens.length - 1;

    const [commandName, commandValue, restValues] = tokens;
    const supported = supportedCommands.find((whitelisted) => commandName === whitelisted.name);

    console.log({ commandName, commandValue, restValues });
    if (!supported) {
      errors.push(`Command not supported: "${escapeMarkdown(command)}"`);
      continue;
    }

    if (supported.noArgs) {
      if (commandValue !== undefined) {
        errors.push(`Command is not allowed to have any values: "${escapeMarkdown(command)}"`);
      } else {
        result.push(`${commandName}`);
      }
      continue;
    }

    if (supported.validValues && !supported.validValues.some((validValue) => validValue === commandValue)) {
      errors.push(
        `Value must be one of the following ${supported.validValues.join(', ')}: "${escapeMarkdown(command)}"`,
      );
      continue;
    }

    if (supported.argType === 'float' || supported.argType === 'integer') {
      if (argCount !== 1) {
        errors.push(`Expected only one value: "${escapeMarkdown(command)}"`);
        continue;
      }

      const value = supported.argType === 'float' ? parseFloat(commandValue!) : parseInt(commandValue!, 10);

      if (isNaN(value)) {
        errors.push(`Value is not of type ${supported.argType}: "${escapeMarkdown(command)}"`);
        continue;
      }

      if (supported.range) {
        const [min, max] = supported.range;

        if (min !== undefined && value < min) {
          errors.push(`Minimum value must be ${min}: "${escapeMarkdown(command)}"`);
          continue;
        }

        if (max !== undefined && value > max) {
          errors.push(`Maximum value must be ${max}: "${escapeMarkdown(command)}"`);
          continue;
        }
      }
    }

    if (restValues !== undefined) {
      result.push(`${commandName} ${commandValue} ${restValues}`);
    } else {
      result.push(`${commandName} ${commandValue}`);
    }
  }

  console.log({ result, errors });

  return [result, errors];
};
