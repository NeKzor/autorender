/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Client } from "https://deno.land/x/mysql@v2.11.0/mod.ts";

export const db = await new Client().connect({
  hostname: Deno.env.get("DB_HOST") ?? "127.0.0.1",
  port: parseInt(Deno.env.get("DB_PORT") ?? "3306", 10),
  username: Deno.env.get("DB_USER") ?? "p2render",
  password: Deno.env.get("DB_PASS") ?? "p2render",
  db: Deno.env.get("DB_NAME") ?? "p2render",
});
