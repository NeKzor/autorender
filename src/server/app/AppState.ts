import * as React from "https://esm.sh/react@18.2.0";
import { User } from "../models.ts";

export interface AppState {
  user: User | null;
  discordAuthorizeLink: string;
}

export type DispatchAction = { type: string; payload: any };

export const reducer: React.Reducer<AppState, DispatchAction> = (
  state: AppState,
  action: DispatchAction
) => {
  switch (action.type) {
    default: {
      throw Error("Unknown action: " + action.type);
    }
  }
};

export const AppStateContext = React.createContext<AppState | null>(null);
export const AppDispatchContext = React.createContext<React.Dispatch<DispatchAction> | null>(null);
