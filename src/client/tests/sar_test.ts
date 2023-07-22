/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { colors } from "https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts";
import ProgressBar from "https://deno.land/x/progress@v1.3.8/mod.ts";
import { bgCyan } from "https://deno.land/std@0.192.0/fmt/colors.ts";
import { getBinary, getRelease } from "../options.ts";

const sarRelease = await getRelease(
  "https://api.github.com/repos/NeKzor/sar/releases/latest",
);

const url = sarRelease
  ?.assets
  ?.find(({ name }) => name.includes("linux"))
  ?.browser_download_url;

if (!url) {
  console.log(colors.green(`Failed to get latest SourceAutoRecord release`));
  Deno.exit(1);
}

let progress = {} as ProgressBar;

const sar = await getBinary(url, {
  onStart: () => {
    progress = new ProgressBar({
      title: "🗿️ Downloading SourceAutoRecord",
      total: 100,
      complete: bgCyan(" "),
    });
  },
  onProgress: (event) => {
    const completed = Math.floor((event.loaded / event.total) * 100);
    if (completed <= 100) {
      progress.render(completed);
    }
  },
  onEnd: () => {
    progress.end();
  },
});

if (!sar) {
  console.log(colors.green(`Failed to download SourceAutoRecord`));
  Deno.exit(1);
}
