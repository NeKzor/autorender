/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as yaml from "https://deno.land/std@0.193.0/yaml/mod.ts";
import {
  Checkbox,
  Confirm,
  Input,
  prompt,
  Select,
} from "https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/mod.ts";
import { colors } from "https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts";
import { join } from "https://deno.land/std@0.192.0/path/mod.ts";

const isDev = Deno.args.includes("--dev");
const isWindows = Deno.build.os === "windows";

const [connectUri, baseApi] = isDev
  ? [
    "ws://autorender.portal2.local:8001/connect/client",
    "http://autorender.portal2.local:8001",
  ]
  : [
    "wss://autorender.nekz.me/connect/client",
    "https://autorender.nekz.me",
  ];

export interface Config {
  autorender: {
    "access-token": string;
    "connect-uri": string;
    "base-api": string;
    "folder-name": string;
    protocol: string;
    "timeout-base": number;
    "max-supported-quality": string;
  };
  games: GameConfig[];
}

export interface GameConfig {
  exe: string;
  proc: string;
  cfg: string;
  mod: string;
  dir: string;
}

const supportedGames: Record<string, Partial<GameConfig>> = {
  "Portal 2": {
    mod: "portal2",
  },
  "Aperture Tag": {
    mod: "aperturetag",
  },
  "Thinking with Time Machine": {
    mod: "twtm",
  },
  "Portal Stories Mel": {
    mod: "portalstories",
  },
  "Portal 2 Community Edition": {
    mod: "p2ce",
  },
  "Portal Reloaded": {
    mod: "portalreloaded",
  },
};

const configFile = join(Deno.env.get("PWD") ?? "", "autorender.yaml");

let config: Config | undefined = undefined;

export const getConfig = async () => {
  if (!config) {
    try {
      config = yaml.parse(await Deno.readTextFile(configFile)) as Config;
    } catch {
      config = await createConfig();
    }
  }
  return config;
};

const createConfig = async () => {
  console.log(colors.bold.white("Client setup for autorender!"));
  console.log(
    colors.white("Please visit https://autorender.nekz.me to get your token."),
  );

  const setup = await prompt([
    {
      name: "access_token",
      message: "Enter or paste your access token here:",
      type: Input,
      after: async ({ access_token }, next) => {
        if (access_token) {
          await next();
        } else {
          await next("access_token");
        }
      },
    },
    {
      name: "supported_quality",
      message:
        "What is the maximum quality you want to support? (default: 1080p)",
      type: Select,
      options: ["1080p (default)", "720p", "480p"],
    },
    {
      name: "game_mod",
      message:
        "Which games do should be supported? (default: portal2) Select a game with spacebar.",
      type: Checkbox,
      options: Object.keys(supportedGames),
      minOptions: 1,
      confirmSubmit: false,
    },
    {
      name: "steam_common",
      message:
        "Please enter Steam's common directory where all games are installed.",
      suggestions: [
        isWindows ? "C:\\Program Files\\Steam\\steamapps\\common" : join(
          "/home/",
          Deno.env.get("USER") ?? "user",
          "/.steam/steam/steamapps/common",
        ),
      ],
      type: Input,
      after: async ({ steam_common }, next) => {
        if (steam_common) {
          await next();
        } else {
          await next("steam_common");
        }
      },
    },
    {
      name: "correct",
      message: "Is the data above correct?",
      type: Confirm,
    },
  ]);

  const config: Config = {
    "autorender": {
      "access-token": setup.access_token!,
      "connect-uri": connectUri,
      "base-api": baseApi,
      "folder-name": "autorender",
      "protocol": "autorender-v1",
      "timeout-base": 30,
      "max-supported-quality": "1080p",
    },
    "games": [
      ...setup.game_mod!.map((game) => {
        return {
          exe: isWindows ? "portal2.exe" : "portal2.sh",
          proc: isWindows ? "portal2.exe" : "portal2_linux",
          cfg: "autorender.cfg",
          ...supportedGames[game as keyof typeof supportedGames],
          dir: join(setup.steam_common!, game),
        } as Config["games"]["0"];
      }),
    ],
  };

  // deno-lint-ignore no-explicit-any
  const autorenderYaml = yaml.stringify(config as any);

  await Deno.writeTextFile(configFile, autorenderYaml);
  console.log(`Generated ${configFile}`);

  return config;
};
