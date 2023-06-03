/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";
import Footer from "../components/Footer.tsx";

const About = () => {
  return (
    <>
      <div>Automatic render of any Portal 2 demo file!</div>
      <div>
        Source Code is on{" "}
        <a href="https://github.com/NeKzor/autorender" target="_blank">
          GitHub
        </a>
      </div>
      <Footer />
    </>
  );
};

export default About;
