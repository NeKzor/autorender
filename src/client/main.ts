/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { delay } from "https://deno.land/std@0.190.0/async/delay.ts";
import { join } from "https://deno.land/std@0.190.0/path/mod.ts";
import { Buffer } from "https://deno.land/std@0.190.0/io/buffer.ts";
import { Video } from "../server/models.ts";

const GAME_DIR = Deno.env.get("GAME_DIR") ?? "";
const AUTORENDER_DIR = join(GAME_DIR, "autorender/");
const AUTORENDER_CFG = Deno.env.get("AUTORENDER_CFG") ?? "";
//const AUTORENDER_TIMEOUT_BASE = parseInt(Deno.env.get("AUTORENDER_TIMEOUT_BASE") ?? "30");
const DUMMY_DEMO = Deno.env.get("DUMMY_DEMO") ?? "";

try {
  await Deno.mkdir(AUTORENDER_DIR);
  console.log(`created autorender directory in ${GAME_DIR}`);
} catch {}

enum ClientStatus {
  Idle = 0,
  Rendering = 1,
}

interface ClientState {
  videos: Video[];
  status: ClientStatus;
}

const state: ClientState = {
  videos: [],
  status: ClientStatus.Idle,
};

const connect = () => {
  const ws = new WebSocket("ws://127.0.0.1:8001/connect/client", [
    "autorender-v1",
    Deno.env.get("API_KEY") ?? "",
  ]);

  let check: number | null = null;

  ws.onopen = () => {
    console.log("Connected to server");

    ws.send(JSON.stringify({ type: "status" }));

    check = setTimeout(() => {
      ws.send(JSON.stringify({ type: "videos" }));
    }, 1000);
  };

  ws.onmessage = async (message) => {
    console.log("Server:", { message });

    if (state.status === ClientStatus.Rendering) {
      return console.warn("got message during rendering... should not happen");
    }

    try {
      if (message.data instanceof Blob) {
        const buffer = await message.data.arrayBuffer();
        const view = new DataView(buffer, 0);
        const length = view.getInt32(0);
        const payload = buffer.slice(4, length);
        const demo = buffer.slice(length);

        const video = JSON.parse(new TextDecoder().decode(payload)) as Video;
        console.log("downloaded demo", { video });

        state.videos.push(video);

        await Deno.writeFile(
          join(AUTORENDER_DIR, `${video.video_id}.dem`),
          new Uint8Array(demo)
        );
      } else {
        const { type, data } = JSON.parse(message.data);

        switch (type) {
          case "videos": {
            if (data.length) {
              state.videos = [];

              for await (const file of Deno.readDir(AUTORENDER_DIR)) {
                if (
                  file.isFile &&
                  (file.name.endsWith(".dem") || file.name.endsWith(".mp4"))
                ) {
                  const filename = join(AUTORENDER_DIR, file.name);

                  try {
                    Deno.remove(filename);
                  } catch (err) {
                    console.error(`failed to remove file ${filename}:`, err.toString());
                  }
                }
              }

              for (const { video_id } of data) {
                ws.send(JSON.stringify({ type: "demo", data: { video_id } }));
              }
            } else {
              if (check !== null) {
                clearTimeout(check);
              }

              check = setTimeout(() => {
                ws.send(JSON.stringify({ type: "videos" }));
              }, 1000);
            }

            break;
          }
          case "start": {
            try {
              state.status = ClientStatus.Rendering;

              // TODO: what's the point of a "dummy" demo?
              const autoexec = [
                "plugin_load sar",
                "sar_fast_load_preset full",
                "sar_disable_no_focus_sleep 1",
                `exec ${AUTORENDER_CFG}`,
                ...state.videos.map(
                  ({ video_id }, idx) =>
                    `sar_alias r_${idx} "playdemo autorender/${video_id}; sar_alias r_next r_${
                      idx + 1
                    }"`
                ),
                //`sar_alias r_${state.videos.length} "playdemo demos/${DUMMY_DEMO}; sar_alias r_next quit`,
                "sar_alias r_next r_0",
                "sar_on_demo_stop r_next",
                //`playdemo demos/${DUMMY_DEMO}`,
              ];

              await Deno.writeTextFile(
                join(GAME_DIR, "cfg", "autoexec.cfg"),
                autoexec.join("\n")
              );

              const command = new Deno.Command(join(GAME_DIR, "portal2"), {
                args: [
                  "portal2",
                  "-game",
                  "portal2",
                  "-novid",
                  "-vulkan",
                  "-windowed",
                  "-w",
                  "1280",
                  "-h",
                  "720",
                  "+mat_motion_blur_enabled",
                  "0",
                ],
              });

              // TODO: timeout based on demo time
              //const timeoutAt = start + 1 * 1_000 + (RENDER_TIMEOUT_BASE * 1_000);

              const { code, stdout, stderr } = await command.output();

              console.log({ code });
              console.log("stderr", new TextDecoder().decode(stderr));
              console.log("stdout", new TextDecoder().decode(stdout));

              for (const { video_id } of state.videos) {
                try {
                  const buffer = new Buffer();
                  const videoId = new Uint8Array(8);
                  new DataView(videoId).setBigUint64(0, BigInt(video_id));

                  await buffer.write(videoId);
                  await buffer.write(
                    await Deno.readFile(
                      join(AUTORENDER_DIR, `${video_id}.dem.mp4`)
                    )
                  );

                  ws.send(buffer.bytes());
                } catch (err) {
                  console.error(err);

                  ws.send(
                    JSON.stringify({
                      type: "error",
                      data: { video_id, message: err.toString() },
                    })
                  );
                }
              }
            } catch (err) {
              console.error(err);
              ws.send(JSON.stringify({ type: "error", data: err.toString() }));
            } finally {
              state.videos = [];
              state.status = ClientStatus.Idle;

              check = setTimeout(() => {
                ws.send(JSON.stringify({ type: "videos" }));
              }, 1000);
            }

            break;
          }
          case "error": {
            console.error(`error code: ${data.status}`);
            break;
          }
          default: {
            console.error(`unhandled type: ${type}`);
            break;
          }
        }
      }
    } catch (err) {
      console.error(err);

      ws.send(
        JSON.stringify({ type: "error", data: { message: err.toString() } })
      );
    }
  };

  ws.onclose = async () => {
    console.log("Disconnected from server");

    if (check !== null) {
      clearTimeout(check);
    }

    await delay(1000);
    connect();
  };
};

connect();
