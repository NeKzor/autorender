/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { useLoaderData } from "../Routes.ts";
import { AccessToken } from "../../models.ts";

const Token = () => {
  const token = useLoaderData<Partial<AccessToken> | null>();

  if (!token) {
    return <div>Unauthorized access or token not found :(</div>;
  }

  return (
    <>
      <form action={`/tokens/${token.access_token_id ?? "new"}`} method="post">
        <label htmlFor="token_name">Name</label>
        <input
          id="token_name"
          name="token_name"
          type="text"
          value={token.token_name}
          minLength={3}
          maxLength={32}
          required
        ></input>
        <br />
        <label htmlFor="token_key">Token</label>
        <input
          id="token_key"
          name="token_key"
          type="text"
          value={token.token_key}
          readOnly
        ></input>
        <br />
        <button>{token.access_token_id ? "Update" : "Create"}</button>
      </form>
      {token.access_token_id && (
      <form action={`/tokens/${token.access_token_id}/delete`} method="post">
        <button>Delete</button>
      </form>
      )}
      <a href="/tokens">
        <button>{token.access_token_id ? "Back" : "Cancel"}</button>
      </a>
      <Footer />
    </>
  );
};

export default Token;
