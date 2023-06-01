/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";

console.log("Running worker thread...");

const connect = () => {
  const ws = new WebSocket("ws://127.0.0.1:8001/connect/bot", [
    "autorender-v1",
    Deno.env.get("BOT_AUTH_TOKEN") ?? '',
  ]);

  ws.onopen = () => {
    console.log("Connected to server");
    ws.send(JSON.stringify({ type: "status" }));
  };
  ws.onmessage = (message) => {
    const { type, data } = JSON.parse(message.data);
    console.log("Server:", { type, data });

    switch (type) {
      case 'notify': {
        (self as any).postMessage(data);
        break;
      }
      default: {
        console.error(`unhandled type: ${type}`);
        break;
      }
    }
  };
  ws.onclose = async () => {
    console.log("Disconnected from server");
    await delay(1000);
    connect();
  };
};

connect();
