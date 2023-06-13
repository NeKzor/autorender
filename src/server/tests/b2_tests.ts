/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import "https://deno.land/std@0.177.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.191.0/testing/asserts.ts";
import { BackblazeClient, BackblazeAccount, BackblazeApiError } from "../b2.ts";

const b2 = new BackblazeClient({ userAgent: "autorender-v1" });

const login: BackblazeAccount = {
  accountId: Deno.env.get("B2_KEY_ID")!,
  applicationKey: Deno.env.get("B2_APP_KEY")!,
};

const bucketId = Deno.env.get("B2_BUCKET_ID")!;

assert(login.accountId);
assert(login.applicationKey);
assert(bucketId);

Deno.test("authorizeAccount()", async () => {
  const auth = await b2.authorizeAccount(login);
  console.log(auth);
  assert(auth.authorizationToken);
});

Deno.test("uploadFile()", async () => {
  try {
    const file = await b2.uploadFile({
      bucketId,
      fileName: "videos/26 test.mp4",
      fileContents: Deno.readFileSync("./videos/26.mp4"),
      contentType: "video/mp4",
    });
  
    console.log(file);
    assert(file);
  
    const url = b2.getDownloadUrl(file.fileName);
  
    console.log(url);
    assert(file);
  } catch (err) {
    console.error(err);

    if (err instanceof Error && err.cause) {
      const cause = err.cause as BackblazeApiError;
      console.log({ cause });
    }

    throw err;
  }
});
