/*
 * Copyright (c) 2023-2024, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'react';
import { RenderQuality, User } from '~/shared/models.ts';
import { RouteMeta } from './Routes.ts';

export interface AppState {
  user: User | null;
  clients: number[];
  clientStates: Map<number, {
    games: string[];
    renderQualities: RenderQuality[];
  }>;
  url: URL;
  meta: RouteMeta;
  domain: string;
  nonce: string;
  discordAuthorizeLink: string;
}

// deno-lint-ignore no-explicit-any
export type DispatchAction = { type: string; payload: any };

export const reducer: React.Reducer<AppState, DispatchAction> = (
  _state: AppState,
  action: DispatchAction,
) => {
  switch (action.type) {
    default: {
      throw Error('Unknown action: ' + action.type);
    }
  }
};

export const AppStateContext = React.createContext<AppState | null>(null);
export const AppDispatchContext = React.createContext<React.Dispatch<DispatchAction> | null>(null);
