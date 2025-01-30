/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as _log from '@std/log';
import { blue, bold, red, yellow } from '@std/fmt/colors';

export const log = _log;
export const logger = _log;

const formatLevel = (level: number, levelName: string): string => {
  switch (level) {
    case _log.LogLevels.INFO:
      return blue(levelName);
    case _log.LogLevels.WARN:
      return yellow(levelName);
    case _log.LogLevels.ERROR:
      return red(levelName);
    case _log.LogLevels.CRITICAL:
      return bold(red(levelName));
    default:
      return levelName;
  }
};

const formatDatetime = (datetime: Date) => {
  const year = datetime.getFullYear();
  const month = (datetime.getMonth() + 1).toString().padStart(2, '0');
  const day = datetime.getDate().toString().padStart(2, '0');
  const hours = datetime.getHours().toString().padStart(2, '0');
  const minutes = datetime.getMinutes().toString().padStart(2, '0');
  const seconds = datetime.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// deno-lint-ignore no-explicit-any
const formatArgs = (args: string | any | any[]): string => {
  if (typeof args === 'string') {
    return args;
  }
  // deno-lint-ignore no-explicit-any
  return args.map((arg: any) => {
    if (typeof arg === 'string') {
      return arg;
    }
    return JSON.stringify(arg);
  }).join(' ');
};

const consoleFormatter: _log.FormatterFunction = ({ datetime, level, levelName, msg, args }) => {
  return `${formatDatetime(datetime)} ${formatLevel(level, levelName)} ${msg}${
    args.length ? ' ' + formatArgs(args) : ''
  }`;
};

_log.setup({
  handlers: {
    console: new _log.ConsoleHandler('DEBUG', {
      useColors: false,
      formatter: consoleFormatter,
    }),
  },
  loggers: {
    default: {
      level: 'DEBUG',
      handlers: ['console'],
    },
  },
});
