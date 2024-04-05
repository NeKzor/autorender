/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread propagates all new incoming messages from the server to
 * the main thread.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { delay } from '@std/async';

const AUTORENDER_CONNECT_URI = Deno.env.get('AUTORENDER_CONNECT_URI')!;
const AUTORENDER_PROTOCOL = Deno.env.get('AUTORENDER_PROTOCOL')!;

self.postMessage('Running worker thread...');

let ws: WebSocket | null = null;
let wasConnected = false;

const onOpen = () => {
  wasConnected = true;
  self.postMessage('Connected to server');
};

const onMessage = (message: MessageEvent) => {
  self.postMessage(message.data);
};

const onClose = async () => {
  ws = null;

  if (wasConnected) {
    wasConnected = false;
    self.postMessage('Disconnected from server');
  }

  await delay(100);
  connect();
};

const onError = (event: ErrorEvent | Event) => {
  const isErrorEvent = event instanceof ErrorEvent;

  if (isErrorEvent && event.error?.code === 'ECONNREFUSED') {
    return;
  }

  self.postMessage(
    'Connection error: ' + JSON.stringify(isErrorEvent ? event.error?.toString() ?? event.message : event),
  );
};

const connect = () => {
  ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get('AUTORENDER_BOT_TOKEN')!),
  ]);

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
  ws.onerror = onError;
};

connect();
