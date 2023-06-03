/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { AppStateContext } from "../AppState.ts";
import Footer from "../components/Footer.tsx";

const Home = () => {
  const state = React.useContext(AppStateContext);

  if (!state?.user) {
    return (
      <>
        <div>
          <a href={state?.discordAuthorizeLink}>Login with Discord</a>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div>Hey {state.user.username}!</div>
      <div>
        <a href={`/profile/${state.user.user_id}`}>Profile</a>
      </div>
      <div>
        <a href="/tokens">Tokens</a>
      </div>
      <div>
        <a href="/logout">Logout</a>
      </div>
      <Footer />
    </>
  );
};

export default Home;
