/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/command/mod.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';
import { Input, Secret, Select } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/mod.ts';

type Environment = 'dev' | 'prod';

// Used for template file in docker/compose/ and for generating SSL certs.
const devHostname = 'autorender.portal2.local';

// Used to download files for prod setup.
const repositoryUrl = 'https://raw.githubusercontent.com/NeKzor/autorender/main/';

let inviteLink = '';
let volumeFolder = '';

/** String as volume folder. */
const v = (strings: TemplateStringsArray, ...values: string[]) =>
  volumeFolder + strings.reduce((acc, val, idx) => acc + val + (values[idx] ?? ''), '');

const cli = new Command()
  .name('autorender-setup')
  .version('1.0.0')
  .description('Command line setup tool for a new autorender project.')
  .option('-p, --prod', 'Run setup from production system.');

const main = async () => {
  const result = await cli.parse(Deno.args);
  const env: Environment = result.options.prod ? 'prod' : 'dev';

  volumeFolder = env === 'dev' ? 'docker/volumes/' : '';

  await createDockerComposeFile(env);
  await createConfigAndEnv(env);
  await createDirectories(env);
  await downloadStorageFiles(env);
  await createSslCerts(env);

  console.log(colors.bold('[+]'), colors.green(`Done`));

  if (inviteLink) {
    console.log();
    console.log(colors.white(`Bot invitation link: ${inviteLink}`));
  }
};

const createInviteLink = (discordClientId: string) => {
  const params = new URLSearchParams({
    client_id: discordClientId,
    permissions: '117760',
    scope: 'bot applications.commands',
  });
  inviteLink = `https://discord.com/api/oauth2/authorize?${params}`;
};

const tryStat = async (file: string) => {
  try {
    return await Deno.stat(file);
  } catch {
    return null;
  }
};

const tryCopy = async (source: string, destination: string) => {
  try {
    const stat = await tryStat(destination);
    if (stat) {
      return;
    }

    await Deno.copyFile(source, destination);
  } catch (err) {
    console.log(colors.bold('[-]'), colors.red(`Failed to copy "${source}" to "${destination}"`));
    console.error(err);
  }
};

const tryMkdir = async (path: string) => {
  try {
    const stat = await tryStat(path);
    if (stat) {
      return;
    }

    await Deno.mkdir(path, { recursive: true });
  } catch (err) {
    console.log(colors.bold('[-]'), colors.red(`Failed to create directory "${path}"`));
    console.error(err);
  }
};

const setEnv = (contents: string[], search: string, replace: string) => {
  const index = contents.findIndex((line) => line.startsWith(search));
  if (index !== -1) {
    contents[index] = replace;
  }
};

const downloadFromRepository = async (remote: string, local: string) => {
  const url = repositoryUrl + remote;

  console.log(colors.bold('[+]'), `GET ${url}`);

  const res = await fetch(url, {
    headers: {
      'User-Agent': cli.getName(),
    },
  });

  if (!res.ok || !res.body) {
    console.error(colors.bold('[-]'), `Unable to download file from repository : ${res.status} (${res.statusText})`);
    Deno.exit(1);
  }

  try {
    Deno.remove(local);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      console.error(colors.bold('[-]'), `Unable to delete file: ${local}`);
      console.error(err);
      Deno.exit(1);
    }
  }

  try {
    const file = await Deno.open(local);
    await res.body.pipeTo(file.writable);
    console.log(colors.bold('[+]'), `File written to ${local}`);
    file.close();
  } catch (err) {
    console.error(err);
    Deno.exit(1);
  }
};

const createDockerComposeFile = async (env: Environment) => {
  if (env === 'prod') {
    const template = await Select.prompt({
      message: 'Choose a docker-compose template:',
      options: [
        {
          name: 'autorender.nekz.me.yml',
          value: 'docker/compose/autorender.nekz.me.yml',
        },
        {
          name: 'autorender.portal2.sr.yml',
          value: 'docker/compose/autorender.portal2.sr.yml',
        },
      ],
    });

    console.log({ template });
    await downloadFromRepository(template, `docker-compose.yml`);
    await downloadFromRepository('.dockerignore', '.dockerignore');
    await downloadFromRepository('deno.json', 'deno.json');
    await downloadFromRepository('deno.lock', 'deno.lock');
    await downloadFromRepository('Dockerfile', 'Dockerfile');
  } else {
    await tryCopy(`docker/compose/${devHostname}.yml`, 'docker-compose.yml');
  }
};

/**
 * Storage files:
 *    autorender.cfg        -> .cfg file for clients
 *    portal2_benchmark.dem -> Benchmark demo for clients
 *    quickhud.zip          -> Quickhud files for clients
 *    security.txt          -> Security policy, see https://www.rfc-editor.org/rfc/rfc9116
 */
const downloadStorageFiles = async (env: Environment) => {
  if (env !== 'prod') {
    return;
  }

  await downloadFromRepository('storage/files/autorender.cfg', 'storage/files/autorender.cfg');
  await downloadFromRepository('storage/files/portal2_benchmark.dem', 'storage/files/portal2_benchmark.dem');
  await downloadFromRepository('storage/files/quickhud.zip', 'storage/files/quickhud.zip');
  await downloadFromRepository('storage/files/security.txt', 'storage/files/security.txt');
};

/**
 * Configuration files:
 *    .env        -> used by docker
 *    .env.bot    -> used by the bot    (mounted by docker)
 *    .env.server -> used by the server (mounted by docker)
 */
const createConfigAndEnv = async (env: Environment) => {
  if (env === 'prod') {
    await downloadFromRepository('.env.example', '.env');
    await downloadFromRepository('src/bot/.env.example', v`.env.bot`);
    await downloadFromRepository('src/server/.env.example', v`.env.server`);
  } else {
    await tryCopy('.env.example', '.env');
    await tryCopy('src/bot/.env.example', v`.env.bot`);
    await tryCopy('src/server/.env.example', v`.env.server`);
  }

  const botEnv = (await Deno.readTextFile(v`.env.bot`)).split('\n');
  const serverEnv = (await Deno.readTextFile(v`.env.server`)).split('\n');

  if (env === 'dev') {
    setEnv(serverEnv, 'HOT_RELOAD=false', 'HOT_RELOAD=true');
  }

  const autorenderBotToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
  setEnv(botEnv, 'AUTORENDER_BOT_TOKEN=""', `AUTORENDER_BOT_TOKEN="${autorenderBotToken}"`);
  setEnv(serverEnv, 'AUTORENDER_BOT_TOKEN=""', `AUTORENDER_BOT_TOKEN="${autorenderBotToken}"`);

  const cookieSecretKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
  setEnv(serverEnv, 'COOKIE_SECRET_KEY=""', `COOKIE_SECRET_KEY="${cookieSecretKey}"`);

  const discordUserId = await Input.prompt({ message: 'Your Discord User ID' });
  const discordClientId = await Input.prompt({ message: 'Client ID of the Discord application' });
  const discordClientSecret = await Secret.prompt({ message: 'Client secret of the Discord application' });
  const discordBotToken = await Secret.prompt({ message: 'Token of the Discord bot' });

  discordUserId.length && setEnv(serverEnv, 'DISCORD_USER_ID', discordUserId);
  discordClientId.length && setEnv(serverEnv, 'DISCORD_CLIENT_ID', discordClientId);
  discordClientSecret.length && setEnv(serverEnv, 'DISCORD_CLIENT_SECRET', discordClientSecret);
  discordClientId.length && setEnv(botEnv, 'DISCORD_BOT_ID', discordClientId);
  discordBotToken.length && setEnv(botEnv, 'DISCORD_BOT_TOKEN', discordBotToken);

  if (env === 'prod') {
    const autorenderPublicUri = await Input.prompt({ message: 'Public domain name' });

    if (autorenderPublicUri.length) {
      setEnv(
        botEnv,
        'AUTORENDER_PUBLIC_URI',
        `AUTORENDER_PUBLIC_URI=${autorenderPublicUri}`,
      );
      setEnv(
        serverEnv,
        'AUTORENDER_PUBLIC_URI',
        `AUTORENDER_PUBLIC_URI=${autorenderPublicUri}`,
      );
    }
  }

  await Deno.writeTextFile(v`.env.bot`, botEnv.join('\n'));
  await Deno.writeTextFile(v`.env.server`, serverEnv.join('\n'));

  if (discordClientId.length) {
    createInviteLink(discordClientId);
  } else {
    const discordClientId = botEnv
      .find((line) => line.startsWith('DISCORD_BOT_ID'))
      ?.split('=', 2)
      ?.slice(1)
      ?.shift()
      ?.trim() ?? '';

    if (discordClientId.length) {
      createInviteLink(discordClientId);
    }
  }

  console.log(colors.bold('[+]'), colors.white(`Created .env files`));
};

/**
 * Mounted directories:
 *    logs/bot    -> Bot logs
 *    logs/server -> Server logs
 *    kv          -> Database used by the bot
 *    mysql       -> Database used by the server
 */
const createDirectories = async (_env: Environment) => {
  await tryMkdir(v`logs/bot`);
  await tryMkdir(v`logs/server`);
  await tryMkdir(v`kv`);
  await tryMkdir(v`mysql`);
  await tryMkdir(v`storage`);

  console.log(colors.bold('[+]'), colors.white(`Created directories`));
};

/**
 * Self-signed certificate for development only.
 */
const createSslCerts = async (env: Environment) => {
  if (env === 'prod') {
    return;
  }

  const stat = await tryStat(v`ssl/${devHostname}.crt`);
  if (stat) {
    console.log(colors.bold('[+]'), colors.white(`Skipped self-signed certificate`));
    return;
  }

  await tryMkdir(v`ssl`);

  const mkcert = new Deno.Command('mkcert', {
    args: [
      `-cert-file`,
      v`ssl/${devHostname}.crt`,
      `-key-file`,
      v`ssl/${devHostname}.key`,
      devHostname,
    ],
  });

  try {
    const process = mkcert.spawn();
    const { code } = await process.output();

    if (code === 0) {
      console.log(colors.bold('[+]'), colors.white(`Created self-signed certificate`));
    } else {
      console.log(colors.bold('[-]'), colors.red(`Failed to create self-signed certificate`));
    }
  } catch (err) {
    console.error(err);
    if (err instanceof Deno.errors.NotFound) {
      console.log(
        colors.bold('[-]'),
        colors.red(`mkcert does not seem to be installed. Failed to generate ssl certificates`),
      );
    }
  }
};

await main();
