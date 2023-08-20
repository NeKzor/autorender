/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { tw } from 'twind';

const formatVideoLength = (videoLength: number) => {
  const hours = Math.floor(videoLength / 60 / 60);
  const minutes = Math.floor(videoLength / 60) % 60;
  const seconds = videoLength % 60;
  return `${hours ? `${hours}:` : ''}${hours ? minutes.toString().padStart(2, '0') : minutes}:${
    seconds.toString().padStart(2, '0')
  }`;
};

export const VideoLength = ({ videoLength }: { videoLength: number }) => {
  return (
    <span
      className={tw`absolute p-1 bottom-1 right-1 text-xs font-medium rounded text-white bg-gray-900 dark:bg-gray-900`}
    >
      {formatVideoLength(videoLength)}
    </span>
  );
};
