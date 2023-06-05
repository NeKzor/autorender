/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import {
  Client,
  ClientConfig,
  ExecuteResult as MysqlExecuteResult,
} from "https://deno.land/x/mysql@v2.11.0/mod.ts";

// This adds more ergonomic signatures with type-safety for SQL queries.
export type ExecuteResult<T> = Omit<MysqlExecuteResult, "rows"> & {
  rows: T[];
};
export interface Database extends Omit<Client, "connect" | "query" | "execute">  {
  connect(config: ClientConfig): Promise<Database>;
  // deno-lint-ignore no-explicit-any
  query<T, P extends any[] = any[]>(sql: string, params?: P): Promise<T>;
  // deno-lint-ignore no-explicit-any
  execute<T, P extends any[] = any[]>(sql: string, params?: P): Promise<ExecuteResult<T>>;
}

export const db = await (new Client() as Database).connect({
  hostname: Deno.env.get("DB_HOST") ?? "127.0.0.1",
  port: parseInt(Deno.env.get("DB_PORT") ?? "3306", 10),
  username: Deno.env.get("DB_USER") ?? "p2render",
  password: Deno.env.get("DB_PASS") ?? "p2render",
  db: Deno.env.get("DB_NAME") ?? "p2render",
});
