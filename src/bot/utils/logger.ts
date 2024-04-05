/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as _log from 'log/mod.ts';
import { blue, bold, red, yellow } from 'fmt/colors.ts';

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

class FileLogger extends _log.RotatingFileHandler {
  override handle(logRecord: _log.LogRecord) {
    super.handle(logRecord);
    this.flush(); // Always flush
  }
}

const formatDatetime = (datetime: Date) => {
  const year = datetime.getFullYear();
  const month = (datetime.getMonth() + 1).toString().padStart(2, '0');
  const day = datetime.getDate().toString().padStart(2, '0');
  const hours = datetime.getHours().toString().padStart(2, '0');
  const minutes = datetime.getMinutes().toString().padStart(2, '0');
  const seconds = datetime.getSeconds().toString().padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const consoleFormatter: _log.FormatterFunction = ({ datetime, level, levelName, msg }) => {
  return `${formatDatetime(datetime)} ${formatLevel(level, levelName)} ${msg}`;
};

const fileFormatter: _log.FormatterFunction = ({ datetime, levelName, msg }) => {
  return `${formatDatetime(datetime)} ${levelName} ${msg}`;
};

_log.setup({
  handlers: {
    console: new _log.ConsoleHandler('DEBUG', {
      useColors: false,
      formatter: consoleFormatter,
    }),
    infoLog: new FileLogger('DEBUG', {
      maxBytes: 100 * 1024 * 1024,
      maxBackupCount: 7,
      filename: '/logs/bot/info.log',
      formatter: fileFormatter,
    }),
    errorLog: new FileLogger('ERROR', {
      maxBytes: 100 * 1024 * 1024,
      maxBackupCount: 7,
      filename: '/logs/bot/error.log',
      formatter: fileFormatter,
    }),
  },
  loggers: {
    default: {
      level: 'DEBUG',
      handlers: ['console', 'infoLog', 'errorLog'],
    },
  },
});
