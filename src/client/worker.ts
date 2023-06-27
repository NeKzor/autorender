/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 *
 * This worker thread handle the connection to the server.
 */

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";
import { logger } from "./logger.ts";
import { AutorenderSendMessages } from "./protocol.ts";

const AUTORENDER_CONNECT_URI = Deno.env.get("AUTORENDER_CONNECT_URI")!;
const AUTORENDER_PROTOCOL = Deno.env.get("AUTORENDER_PROTOCOL")!;
const AUTORENDER_SEND_MAX_RETRIES = 5;
const AUTORENDER_SEND_RETRY_INTERVAL = 1_000;

let ws: WebSocket | null = null;
let wasConnected = false;

const send = async (
  data: Uint8Array | AutorenderSendMessages,
  options?: { dropDataIfDisconnected: boolean },
) => {
  const isBuffer = data instanceof Uint8Array;
  const dataToSend = isBuffer ? data : JSON.stringify(data)

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
      "dropped data",
      isBuffer ? `buffer of size ${data.byteLength}` : data,
    );
  }
};

// deno-lint-ignore no-explicit-any
(self as any).addEventListener("message", async (message: MessageEvent) => {
  switch (message.data.type) {
    case "send": {
      type SendData = {
        data: Uint8Array | AutorenderSendMessages;
        options?: { dropDataIfDisconnected: boolean };
      };

      const { data, options } = message.data.data as SendData;
      await send(data, options);
      break;
    }
    default:
      logger.error(`Unhandled type: ${message.data.type}`);
      break;
  }
});

const onOpen = () => {
  wasConnected = true;
  logger.info("Connected to server");
  // deno-lint-ignore no-explicit-any
  (self as any).postMessage({ type: "connected" });
};

const onClose = async () => {
  ws = null;

  if (wasConnected) {
    wasConnected = false;
    logger.info("Disconnected from server");
  }

  // deno-lint-ignore no-explicit-any
  (self as any).postMessage({ type: "disconnected" });

  await delay(100);
  connect();
};

const onMessage = async (message: MessageEvent) => {
  console.log("Server:", message);
  // deno-lint-ignore no-explicit-any
  (self as any).postMessage(
    message.data instanceof Blob
      // TODO: Deno bug? Blob should be transferrable, no?
      ? await message.data.arrayBuffer()
      : { type: "message", data: message.data },
  );
};

const connect = () => {
  ws = new WebSocket(AUTORENDER_CONNECT_URI, [
    AUTORENDER_PROTOCOL,
    encodeURIComponent(Deno.env.get("AUTORENDER_API_KEY")!),
  ]);

  ws.onopen = onOpen;
  ws.onmessage = onMessage;
  ws.onclose = onClose;
};

connect();
