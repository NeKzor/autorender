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
      <h2>Cookies</h2>
      <ul>
        <li>
          We only use a single "authentication" cookie.
        </li>
        <li>
          This cookie is used to identify You with Your created user account.
        </li>
      </ul>
      <h2>Stored Data</h2>
      <ul>
        <li>
          We only store Your Discord username and ID from Your authenticated Discord account.
        </li>
        <li>
          We do not store anything else related to Discord.
        </li>
        <li>
          We store any video You uploaded via the API key.
        </li>
        <li>
          Video deletion can take up to 14 days as they are held up for manual review.
        </li>
        <li>
          We log and store information such as Your IP and Your used browser user agent for 30 days.
        </li>
        <li>
          These logs are needed to protect and improve Our service.
        </li>
      </ul>
      <h2>Third Party</h2>
      <ul>
        <li>
          Videos are uploaded and stored via Our Third Party "Blackbaze" (https://backblaze.com).
        </li>
        <li>
          Feel free to also read the Privacy Notice of Blackbaze at: https://www.backblaze.com/company/privacy.html
        </li>
      </ul>
    </>
  );
};

export default Privacy;
