/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";

const Tokens = () => {
  return (
    <>
      <ul>
        <li>
          <a href="/tokens/test">Test Token</a>
        </li>
      </ul>
      <form>
        <button formaction="/tokens/new">Create New</button>
      </form>
      <Footer />
    </>
  );
};

export default Tokens;
