/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread propagates all new incoming messages from the server to
 * the main thread.
 */

/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";

const AUTORENDER_CONNECT_URI = Deno.env.get("AUTORENDER_CONNECT_URI")!;
const AUTORENDER_PROTOCOL = Deno.env.get("AUTORENDER_PROTOCOL")!;

// TODO: file logging
console.log("Running worker thread...");

let ws: WebSocket | null = null;
let wasConnected = false;

const onOpen = () => {
  wasConnected = true;
  console.log("Connected to server");
};

const onMessage = (message: MessageEvent) => {
  console.log("Server:", message);
  self.postMessage(message.data);
};

const onClose = async () => {
  ws = null;

  if (wasConnected) {
    wasConnected = false;
    console.log("Disconnected from server");
  }

  await delay(100);
  connect();
};

const onError = (event: ErrorEvent | Event) => {
  console.error(
    "Connection error",
    event instanceof ErrorEvent ? event.error : event,
  );
};

const connect = () => {
  ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get("AUTORENDER_BOT_TOKEN")!),
  ]);

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
  ws.onerror = onError
};

connect();
