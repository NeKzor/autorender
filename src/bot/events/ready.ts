/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { events } from "./mod.ts";
import { logger } from "../utils/logger.ts";

const log = logger({ name: "Event: Ready" });

events.ready = (payload) => {
  log.info(`[Application: ${payload.applicationId}]`);
};
