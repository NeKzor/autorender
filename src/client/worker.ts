/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread handle the connection to the server.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { delay } from 'https://deno.land/std@0.190.0/async/delay.ts';
import { logger } from './logger.ts';
import { AutorenderSendMessages } from './protocol.ts';
import { Config } from './config.ts';

const AUTORENDER_SEND_MAX_RETRIES = 5;
const AUTORENDER_SEND_RETRY_INTERVAL = 1_000;

export enum WorkerDataType {
  Config = 'config',
  Connect = 'connect',
  Send = 'send',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Message = 'message',
}

export type WorkerMessage<T extends WorkerDataType, P> = {
  type: T;
  data: P;
};

export type WorkerMessageConfig = WorkerMessage<
  WorkerDataType.Config,
  { config: Config }
>;

export type WorkerMessageConnect = WorkerMessage<
  WorkerDataType.Connect,
  undefined
>;

export type WorkerMessageSend = WorkerMessage<
  WorkerDataType.Send,
  {
    data: AutorenderSendMessages;
    options: { dropDataIfDisconnected: boolean };
  }
>;

export type WorkerMessageConnected = WorkerMessage<
  WorkerDataType.Connected,
  undefined
>;

export type WorkerMessageDisconnected = WorkerMessage<
  WorkerDataType.Disconnected,
  undefined
>;

export type WorkerMessageMessage = WorkerMessage<
  WorkerDataType.Message,
  unknown
>;

export type WorkerMessages =
  | WorkerMessageConfig
  | WorkerMessageConnect
  | WorkerMessageSend
  | WorkerMessageConnected
  | WorkerMessageDisconnected
  | WorkerMessageMessage;

let ws: WebSocket | null = null;
let wasConnected = false;

const config = {} as Config;

const send = async (
  data: Uint8Array | AutorenderSendMessages,
  options?: { dropDataIfDisconnected: boolean },
) => {
  const isBuffer = data instanceof Uint8Array;
  const dataToSend = isBuffer ? data : JSON.stringify(data);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(dataToSend);
  } else if (!options?.dropDataIfDisconnected) {
    let retries = AUTORENDER_SEND_MAX_RETRIES;
    do {
      await delay(AUTORENDER_SEND_RETRY_INTERVAL);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(dataToSend);
        return;
      }
    } while (retries-- > 0);

    logger.warn(
      'dropped data',
      isBuffer ? `buffer of size ${data.byteLength}` : data,
    );
  }
};

self.addEventListener(
  'message',
  async (message: MessageEvent<WorkerMessages>) => {
    const { type, data } = message.data;

    switch (type) {
      case WorkerDataType.Config: {
        Object.assign(config, data.config);
        break;
      }
      case WorkerDataType.Connect: {
        connect();
        break;
      }
      case WorkerDataType.Send: {
        await send(data.data, data.options);
        break;
      }
      default:
        logger.error(`Unhandled worker message type: ${type}`);
        break;
    }
  },
);

const onOpen = () => {
  wasConnected = true;
  logger.info('Connected to server');
  self.postMessage({ type: WorkerDataType.Connected });
};

const onClose = async () => {
  ws = null;

  if (wasConnected) {
    wasConnected = false;
    logger.info('Disconnected from server');
  }

  self.postMessage({ type: WorkerDataType.Disconnected });

  await delay(100);
  connect();
};

const onError = (event: ErrorEvent | Event) => {
  logger.error(
    'Connection error',
    event instanceof ErrorEvent ? event.error : event,
  );
};

const onMessage = async (message: MessageEvent) => {
  if (message.data instanceof Blob) {
    // TODO: Avoid using ArrayBuffer by using Blob directly.
    //       This is not supported yet :>
    //       https://github.com/denoland/deno/issues/12067
    const buffer = await message.data.arrayBuffer();
    self.postMessage(buffer, [buffer]);
  } else {
    self.postMessage({
      type: WorkerDataType.Message,
      data: message.data,
    });
  }
};

const connect = () => {
  ws = new WebSocket(config.autorender['connect-uri'], [
    config.autorender['protocol'],
    encodeURIComponent(config.autorender['access-token']),
  ]);

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
  ws.onerror = onError;
};
