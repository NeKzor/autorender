/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import { useLoaderData } from "https://esm.sh/react-router-dom@6.11.2";
import Footer from "../components/Footer.tsx";

const Token = () => {
  const data = useLoaderData();

  return (
    <>
      <form action="/tokens/create" method="post">
        <label for="name">Name</label>
        <input id="name" name="name" type="text"></input>
        <br />
        <label for="token">Token</label>
        <input id="token" name="token" type="text" disabled></input>
        <br />
      </form>
      <button disabled={true}>Create</button>
      <Footer />
    </>
  );
};

export default Token;
