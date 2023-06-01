/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import 'https://deno.land/std@0.177.0/dotenv/load.ts';
import { assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

const hostname = Deno.env.get('SERVER_HOST') ?? '127.0.0.1';
const port = parseInt(Deno.env.get('SERVER_PORT') ?? '8001', 10);
const uri = `http${Deno.env.get('SERVER_SSL_CERT') !== 'none' ? 's' : ''}://${hostname}:${port}`;
const userAgent = 'autorender v1.0';

console.log(`running tests for ${uri}`);

// Deno.test('Should start a render', async () => {
//     const demo = await Deno.readFile("./tests/demos/bhop-outdoors_9-7.dem");

//     // NOTE: We have to reorder the file before something else, thanks to this wonderful bug in oak.
//     //       https://github.com/oakserver/oak/issues/581

//     const body = new FormData();
//     body.append('title', 'Test Render');
//     body.append('comment', 'This is a render :)');
//     body.append('requested_by_name', 'NeKz#0332');
//     body.append('requested_by_id', '84272932246810624');
//     body.append('files', new File([demo], "bhop-outdoors_9-7.dem"));
//     body.append('render_options', 'mat_fullbright 1');

//     const response = await fetch(uri + '/api/v1/videos/render', {
//         method: 'PUT',
//         headers: {
//             'User-Agent': userAgent,
//             'Authorization': `Bearer ${Deno.env.get('BOT_AUTH_TOKEN')}`,
//         },
//         body,
//     });

//     assert(response.ok, `response ${response.status} is not ok`);
// });

Deno.test('Should return pending videos', async () => {
    const response = await fetch(uri + '/api/v1/videos/pending');
    assert(response.ok, `response ${response.status} is not ok`);
    console.log(await response.json());
});

// Deno.test('Should finish a render', async () => {
//     const response = await fetch(uri + '/api/v1/videos/render');
//     assert(response.ok, `response ${response.status} is not ok`);
// });
