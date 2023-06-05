/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";
import { useLoaderData } from "../Routes.ts";
import { AccessToken } from "../../models.ts";

const Tokens = () => {
  const tokens = useLoaderData<AccessToken[]>();

  return (
    <>
      <ul>
        {tokens.map((token) => {
          return (
            <li>
              <a href={`/tokens/${token.access_token_id}`}>
                {token.token_name}
              </a>
            </li>
          );
        })}
      </ul>
      <a href="/tokens/create">
        <button>Create New</button>
      </a>
      <Footer />
    </>
  );
};

export default Tokens;
