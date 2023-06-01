/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";

const url = new URLSearchParams();
url.set("client_id", Deno.env.get("DISCORD_CLIENT_ID") ?? "");
url.set("redirect_uri", Deno.env.get("DISCORD_REDIRECT_URI") ?? "");
url.set("response_type", "code");
url.set("scope", "identify");

const discordAuthorizeLink = `https://discord.com/api/oauth2/authorize?${url.toString()}`;

const Home = () => {
  return (
    <div>
      <a href={discordAuthorizeLink}>Login with Discord</a>
    </div>
  );
};

export default Home;
