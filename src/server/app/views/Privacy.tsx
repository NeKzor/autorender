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
        <h2 className={tw`text-4xl font-extrabold dark:text-white`}>
          Privacy Notice
        </h2>
        <p className={tw`my-4`}>Last Update: Aug 11, 2023</p>
        <h6 className={tw`my-1 font-extrabold`}>
          Cookies
        </h6>
        <ul className={tw`space-y-1 list-disc list-inside`}>
          <li>We only use two "session" cookies.</li>
          <li>
            These cookies are used to identify you with your created user account.
          </li>
        </ul>
        <br />
        <h6 className={tw`my-1 font-extrabold`}>
          Stored Data
        </h6>
        <ul className={tw`space-y-1 list-disc list-inside`}>
          <li>
            We store username, ID, avatar, banner and accent color from your Discord account.
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
        <h6 className={tw`my-1 font-extrabold`}>
          Third Party
        </h6>
        <ul className={tw`space-y-1 list-disc list-inside`}>
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
