/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

/**
 * Check the permissions of a member.
 *
 * @param permissions - The permission of the member.
 * @param flags - The flags to check against.
 * @returns - Returns true if the flags are set.
 */
export const hasPermissionFlags = (permissions: bigint | undefined, flags: bigint) => {
  return (permissions ?? 0n) & flags;
};

/**
 * Escape the title of a link for rendering Discord's masked links.
 *
 * NOTE: Discord's masked links are a scuffed version of Markdown links.
 *       You cannot escape [ and ] which means you have to remove it.
 *
 * @param linkTitle - The link title to escape.
 * @returns
 */
export function escapeMaskedLink(linkTitle: string) {
  return ['[', ']'].reduce(
    (text, characterToRemove) => text.replaceAll(characterToRemove, ''),
    linkTitle,
  );
}

const specialMdCharacters = [
  '[',
  ']',
  '(',
  ')',
  '`',
  '*',
  '_',
  '~',
];

/**
 * Escapes text for rendering Markdown content.
 *
 * @param text - The text to escape.
 * @returns - Escaped text.
 */
export function escapeMarkdown(text: string) {
  return specialMdCharacters.reduce(
    (title, char) => title.replaceAll(char, `\\${char}`),
    text,
  );
}

/**
 * Returns the full public URL of the server.
 * @param url - The URL part.
 * @returns - The full URL.
 */
export function getPublicUrl(url: string) {
  return new URL(url, Deno.env.get('AUTORENDER_PUBLIC_URI')!);
}

/**
 * Split the custom ID into its name and ID.
 * @param customId - The full custom ID of the interaction.
 * @returns - Custom name and ID.
 */
export function parseCustomId(customId?: string): [string, string?] {
  const id = customId ?? '';
  const subId = id.slice(id.indexOf('_') + 1);
  const index = subId.indexOf('_');
  return index !== -1
    ? [
      subId.slice(0, index),
      subId.slice(index + 1),
    ]
    : [subId];
}

/**
 * Format challenge mode time.
 *    e.g. 600 = 6.00
 *         6000 = 1:00.00
 *
 * @param time - Total centiseconds.
 * @returns - Time as string.
 */
export function formatCmTime(time: number) {
  const cs = time % 100;
  const secs = Math.floor(time / 100);
  const sec = secs % 60;
  const min = Math.floor(secs / 60);
  return (min > 0)
    ? `${min}:${((sec < 10) ? `0${sec}` : `${sec}`)}.${((cs < 10) ? `0${cs}` : `${cs}`)}`
    : `${sec}.${((cs < 10) ? `0${cs}` : `${cs}`)}`;
}
