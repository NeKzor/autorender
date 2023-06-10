/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";

const AUTORENDER_CONNECT_URI = Deno.env.get("AUTORENDER_CONNECT_URI")!;
const AUTORENDER_PROTOCOL = Deno.env.get("AUTORENDER_PROTOCOL")!;

console.log("Running worker thread...");

const connect = () => {
  const ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get("AUTORENDER_BOT_TOKEN")!),
  ]);

  ws.onopen = () => {
    console.log("Connected to server");
    ws.send(JSON.stringify({ type: "status" }));
  };

  ws.onmessage = (message) => {
    const { type, data } = JSON.parse(message.data);
    console.log("Server:", { type, data });

    switch (type) {
      case "notify": {
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
