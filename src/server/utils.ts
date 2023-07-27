/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

export const generateShareId = () => {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(8))))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
};

export const validateShareId = (shareId: string) => {
  return /^[0-9A-Za-z_-]{10}[048AEIMQUYcgkosw]$/.test(shareId);
};
