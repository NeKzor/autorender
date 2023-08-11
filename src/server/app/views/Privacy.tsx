/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import * as React from 'https://esm.sh/react@18.2.0';
import { tw } from 'https://esm.sh/twind@0.16.16';

export const Privacy = () => {
  return (
    <div className={tw`flex items-center justify-center`}>
      <article className={tw`format lg:format-lg`}>
        <h1>Privacy Notice</h1>
        <p>Last Update: Aug 6, 2023</p>
        <br />
        <b>Cookies</b>
        <ul>
          <li>We only use two "session" cookies.</li>
          <li>
            These cookies are used to identify you with your created user account.
          </li>
        </ul>
        <br />
        <b>Stored Data</b>
        <ul>
          <li>
            We store username and ID from your Discord account.
          </li>
          <li>
            We store information about which server and which channel a render request came from.
          </li>
          <li>
            We store the uploaded demo file and its metadata for each requested video.
          </li>
          <li>
            Our Third Party render clients temporarily store uploaded demos and rendered videos.
          </li>
          <li>
            We store any video you rendered on Backblaze, see Third Party section.
          </li>
          <li>
            Video deletion can take up to 14 days as they are held up for manual review.
          </li>
          <li>
            We log and store information such as your IP and your used browser user agent for 30 days.
          </li>
          <li>These logs are needed to protect and improve our service.</li>
        </ul>
        <br />
        <b>Third Party</b>
        <ul>
          <li>
            Our render clients are responsible to convert your demo file into a video.
          </li>
          <li>
            Videos are then uploaded and stored on "Backblaze" (https://backblaze.com).
          </li>
          <li>
            Feel free to also read the Privacy Notice of Backblaze at: https://www.backblaze.com/company/privacy.html
          </li>
        </ul>
      </article>
    </div>
  );
};
