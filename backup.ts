// Copyright (c) 2023-2024, NeKz
// SPDX-License-Identifier: MIT

// Requirements: .env (see .env.example)
// Example usage: deno run --env -A ./docker/volumes/backups/autorender_db_latest.sql.gz ./kv_db_latest.zip.gz

import { format } from 'jsr:@std/fmt/bytes';
import { parseArgs } from 'jsr:@std/cli/parse-args';
import { basename } from 'jsr:@std/path/windows';
import { retry } from 'jsr:@std/async';
import { BackblazeClient } from 'jsr:@nekz/b2';

const {
  _: files,
  'user-agent': userAgent = 'autorender-server/1.0.0',
  'dry-run': dryRun,
} = parseArgs(Deno.args);

const uploadWebhookUrl = Deno.env.get('B2_UPLOAD_DISCORD_WEBHOOK_URL');

const headers = {
  'Content-Type': 'application/json',
  'User-Agent': userAgent,
};

const retryOptions = {
  multiplier: 2,
  maxTimeout: 180_000,
  maxAttempts: 5,
  minTimeout: 30_000,
  jitter: 1,
};

const bucketId = Deno.env.get('B2_BUCKET_ID');
if (!bucketId) {
  console.error('Missing B2_BUCKET_ID');
  Deno.exit(1);
}

const b2 = new BackblazeClient({ userAgent });

try {
  await b2.authorizeAccount({
    applicationKeyId: Deno.env.get('B2_APP_KEY_ID')!,
    applicationKey: Deno.env.get('B2_APP_KEY')!,
  });

  for (const file of files) {
    try {
      const fileContents = await Deno.readFile(file.toString());
      const fileName = basename(file.toString());

      if (dryRun) {
        console.log(`[DRY RUN]: Uploaded file ${fileName}`);
        continue;
      }

      const upload = await retry(async () => {
        return await b2.uploadFile({
          bucketId,
          fileName,
          fileContents,
          contentType: 'application/octet-stream',
          contentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
        });
      }, retryOptions);

      console.log(`Uploaded file ${fileName} (${upload.fileId})`);

      uploadWebhookUrl && await fetch(uploadWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': userAgent,
        },
        body: JSON.stringify({
          embeds: [
            {
              color: 0x0480A5,
              description: `Uploaded file \`${fileName}\` (${format(upload.contentLength)}) ${upload.contentMd5}`,
            },
          ],
        }),
      });
    } catch (err) {
      console.error(err);

      try {
        uploadWebhookUrl && await fetch(uploadWebhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            embeds: [
              {
                color: 0xFF0000,
                description: `An error occurred when trying to upload \`${file}\``,
              },
            ],
          }),
        });
      } catch (err) {
        console.error(err);
      }
    }
  }
} catch (err) {
  console.error(err);

  uploadWebhookUrl && await fetch(uploadWebhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      embeds: [
        {
          color: 0xFF0000,
          description: `An error occurred when trying to run the backup script.`,
        },
      ],
    }),
  });
}
