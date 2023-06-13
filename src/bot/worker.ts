/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 * 
 * 
 * This worker thread propagates all new incoming messages from the server to
 * the main thread.
 */

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";

const AUTORENDER_CONNECT_URI = Deno.env.get("AUTORENDER_CONNECT_URI")!;
const AUTORENDER_PROTOCOL = Deno.env.get("AUTORENDER_PROTOCOL")!;

// TODO: file logging
console.log("Running worker thread...");

const connect = () => {
  const ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get("AUTORENDER_BOT_TOKEN")!),
  ]);

  ws.onopen = () => {
    console.log("Connected to server");
  };

  ws.onmessage = (message) => {
    console.log("Server:", message);
    // deno-lint-ignore no-explicit-any
    (self as any).postMessage(message.data);
  };

  ws.onclose = async () => {
    console.log("Disconnected from server");
    await delay(1000);
    connect();
  };
};

connect();
