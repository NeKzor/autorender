/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from "https://esm.sh/react@18.2.0";

const Privacy = () => {
  return (
    <>
      <h1>Privacy Notice</h1>
      <p>Last Update: June 2, 2023</p>
      <br />
      <h2>Cookies</h2>
      <ul>
        <li>We only use two "authentication" cookies.</li>
        <li>
          These cookies are used to identify you with your created user account.
        </li>
      </ul>
      <h2>Stored Data</h2>
      <ul>
        <li>
          We only store your Discord username and ID from your authenticated
          Discord account.
        </li>
        <li>We do not store anything else related to Discord.</li>
        <li>We store any video you rendered.</li>
        <li>
          Video deletion can take up to 14 days as they are held up for manual
          review.
        </li>
        <li>
          We log and store information such as your IP and your used browser
          user agent for 30 days.
        </li>
        <li>These logs are needed to protect and improve our service.</li>
      </ul>
      <h2>Third Party</h2>
      <ul>
        <li>
          Videos are uploaded and stored to the Third Party service "Backblaze
          (https://backblaze.com).
        </li>
        <li>
          Feel free to also read the Privacy Notice of Backblaze at:
          https://www.backblaze.com/company/privacy.html
        </li>
      </ul>
    </>
  );
};

export default Privacy;
