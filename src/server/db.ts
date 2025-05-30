/*
 * Copyright (c) 2023-2025, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Client, ClientConfig, ExecuteResult as MysqlExecuteResult } from 'mysql/mod.ts';

// This adds more ergonomic signatures with type-safety for SQL queries.
export type ExecuteResult<T> = Omit<MysqlExecuteResult, 'rows'> & {
  rows: T[];
};
export interface Database extends Omit<Client, 'connect' | 'query' | 'execute'> {
  connect(config: ClientConfig): Promise<Database>;
  // deno-lint-ignore no-explicit-any
  query<T, P extends any[] = any[]>(sql: string, params?: P): Promise<T[]>;
  // deno-lint-ignore no-explicit-any
  execute<T, P extends any[] = any[]>(sql: string, params?: P): Promise<ExecuteResult<T>>;
}

export const db = await (new Client() as Database).connect({
  hostname: Deno.env.get('DB_HOST')!,
  port: parseInt(Deno.env.get('DB_PORT')!, 10),
  username: Deno.env.get('DB_USER')!,
  password: Deno.env.get('DB_PASS')!,
  db: Deno.env.get('DB_NAME')!,
  charset: 'utf8mb4',
});
