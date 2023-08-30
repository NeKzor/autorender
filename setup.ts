/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Command } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/command/mod.ts';
import { colors } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/ansi/colors.ts';
import { Input, Secret, Select } from 'https://deno.land/x/cliffy@v1.0.0-rc.2/prompt/mod.ts';

type Environment = 'dev' | 'prod';

// Used for template file in docker/compose, for the public URI in .env files and for generating SSL certs.
const devHostname = 'autorender.portal2.local';

// Used to download files for prod setup.
const repositoryUrl = 'https://raw.githubusercontent.com/NeKzor/autorender/main/';

let inviteLink = '';
let volumeFolder = '';
let publicUri = '';

/** String as volume folder. */
const v = (strings: TemplateStringsArray, ...values: string[]) =>
  volumeFolder + strings.reduce((acc, val, idx) => acc + val + (values[idx] ?? ''), '');

const cli = new Command()
  .name('autorender-setup')
  .version('1.0.0')
  .description('Command line setup tool for the autorender project.')
  .option('-p, --prod', 'Run setup for the production system.')
  .option('-s, --sync', 'Sync latest files for the production system.');

const main = async () => {
  const { options: { prod, sync } } = await cli.parse(Deno.args);

  if (sync && !prod) {
    console.error(
      colors.bold('[-]'),
      `Syncing files is not allowed. Did you mean to run this for a production system? Try: --prod --sync`,
    );
    Deno.exit(1);
  }

  const env: Environment = prod ? 'prod' : 'dev';

  volumeFolder = prod ? '' : 'docker/volumes/';

  if (!sync) {
    await createDockerComposeFile(env);
    await createConfigAndEnv(env);
    await createEntryPointFiles(env);
    await createDirectories();
  }

  if (prod) {
    await downloadRemoteFiles();
    await downloadStorageFiles();
  } else {
    await createSslCerts();
  }

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

const setEnv = (env: string[], key: string, value: string) => {
  key += '=';
  const index = env.findIndex((line) => line.startsWith(key));
  if (index !== -1) {
    env[index] = key + value;
  }
};

const downloadFromRepository = async (remote: string, local: string, skipIfExists?: boolean) => {
  if (skipIfExists) {
    const stat = await tryStat(local);
    if (stat) {
      return;
    }
  }

  const url = repositoryUrl + remote;

  const res = await fetch(url, {
    headers: {
      'User-Agent': cli.getName(),
    },
  });

  console.log(colors.bold(`[${res.ok ? '+' : '-'}]`), `GET ${url} : ${res.status}`);

  if (!res.ok || !res.body) {
    console.log(colors.bold('[-]'), `Unable to download file from repository: ${res.statusText}`);
    Deno.exit(1);
  }

  try {
    await Deno.remove(local);
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      console.error(colors.bold('[-]'), `Unable to delete file: ${local}`);
      console.error(err);
      Deno.exit(1);
    }
  }

  try {
    const file = await Deno.open(local, { create: true, write: true, truncate: true });
    await res.body.pipeTo(file.writable);
    console.log(colors.bold('[+]'), `    File written to ${local}`);
  } catch (err) {
    console.error(err);
    Deno.exit(1);
  }
};

/**
 * Gets a docker-compose file from the "docker/compose/" folder.
 */
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

    await downloadFromRepository(template, `docker-compose.yml`, true);

    publicUri = `https://${template.split('/').at(-1)!.slice(0, -4)}`;
  } else {
    await tryCopy(`docker/compose/${devHostname}.yml`, 'docker-compose.yml');

    publicUri = `https://${devHostname}`;
  }
};

const downloadRemoteFiles = async () => {
  await downloadFromRepository('docker/volumes/initdb/_create.sql', 'initdb/_create.sql');
  await downloadFromRepository('docker/volumes/initdb/_init.sql', 'initdb/_init.sql');
  await downloadFromRepository('docker/volumes/initdb/_populate.sql', 'initdb/_populate.sql');
  await downloadFromRepository('deno.json', 'deno.json');
  await downloadFromRepository('deno.lock', 'deno.lock');
};

/**
 * Storage files:
 *    autorender.cfg        -> .cfg file for clients
 *    portal2_benchmark.dem -> Benchmark demo for clients
 *    quickhud.zip          -> Quickhud files for clients
 *    security.txt          -> Security policy, see https://www.rfc-editor.org/rfc/rfc9116
 */
const downloadStorageFiles = async () => {
  const remoteStorageFiles = 'docker/volumes/storage/files/';
  await downloadFromRepository(`${remoteStorageFiles}autorender.cfg`, 'storage/files/autorender.cfg');
  await downloadFromRepository(`${remoteStorageFiles}portal2_benchmark.dem`, 'storage/files/portal2_benchmark.dem');
  await downloadFromRepository(`${remoteStorageFiles}quickhud.zip`, 'storage/files/quickhud.zip');
  await downloadFromRepository(`${remoteStorageFiles}security.txt`, 'storage/files/security.txt');
};

/**
 * Configuration files:
 *    .env        -> used by docker
 *    .env.bot    -> used by the bot    (mounted by docker)
 *    .env.server -> used by the server (mounted by docker)
 */
const createConfigAndEnv = async (env: Environment) => {
  if (env === 'prod') {
    await downloadFromRepository('.env.example', '.env', true);
    await downloadFromRepository('src/bot/.env.example', v`.env.bot`, true);
    await downloadFromRepository('src/server/.env.example', v`.env.server`, true);
  } else {
    await tryCopy('.env.example', '.env');
    await tryCopy('src/bot/.env.example', v`.env.bot`);
    await tryCopy('src/server/.env.example', v`.env.server`);
  }

  const botEnv = (await Deno.readTextFile(v`.env.bot`)).split('\n');
  const serverEnv = (await Deno.readTextFile(v`.env.server`)).split('\n');

  if (env === 'dev') {
    setEnv(serverEnv, 'HOT_RELOAD', 'true');
  }

  const autorenderBotToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
  setEnv(botEnv, 'AUTORENDER_BOT_TOKEN', autorenderBotToken);
  setEnv(serverEnv, 'AUTORENDER_BOT_TOKEN', autorenderBotToken);

  const cookieSecretKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))));
  setEnv(serverEnv, 'COOKIE_SECRET_KEY', cookieSecretKey);

  const discordUserId = await Input.prompt({ message: 'Your Discord User ID' });
  const discordClientId = await Input.prompt({ message: 'Client ID of the Discord application' });
  const discordClientSecret = await Secret.prompt({ message: 'Client secret of the Discord application' });
  const discordBotToken = await Secret.prompt({ message: 'Token of the Discord bot' });

  discordUserId.length && setEnv(serverEnv, 'DISCORD_USER_ID', discordUserId);
  discordClientId.length && setEnv(serverEnv, 'DISCORD_CLIENT_ID', discordClientId);
  discordClientSecret.length && setEnv(serverEnv, 'DISCORD_CLIENT_SECRET', discordClientSecret);
  discordClientId.length && setEnv(botEnv, 'DISCORD_BOT_ID', discordClientId);
  discordBotToken.length && setEnv(botEnv, 'DISCORD_BOT_TOKEN', discordBotToken);

  setEnv(botEnv, 'AUTORENDER_PUBLIC_URI', publicUri);
  setEnv(serverEnv, 'AUTORENDER_PUBLIC_URI', publicUri);

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

  console.log(colors.bold('[+]'), `Created .env files`);
};

/**
 * Entrypoint files for Docker:
 *    entrypoint.bot.sh    -> Script when starting the bot
 *    entrypoint.server.sh -> Script when starting the server
 */
const createEntryPointFiles = async (env: Environment) => {
  const botEntryPoint = v`entrypoint.bot.sh`;
  const serverEntryPoint = v`entrypoint.server.sh`;

  if (!await tryStat(botEntryPoint)) {
    await Deno.writeTextFile(botEntryPoint, `deno task ${env}\n`);
    await Deno.chmod(botEntryPoint, 755);
  }

  if (!await tryStat(serverEntryPoint)) {
    await Deno.writeTextFile(serverEntryPoint, `deno task ${env}\n`);
    await Deno.chmod(serverEntryPoint, 755);
  }
};

/**
 * Mounted directories:
 *    backups     -> Folder for database dumps
 *    logs        -> Bot and server logs
 *    kv          -> Bot database
 *    mysql       -> Server database
 *    storage     -> Server file storage
 */
const createDirectories = async () => {
  await tryMkdir(v`backups`);
  await tryMkdir(v`initdb`);
  await tryMkdir(v`kv`);
  await tryMkdir(v`logs/bot`);
  await tryMkdir(v`logs/server`);
  await tryMkdir(v`mysql`);
  await tryMkdir(v`storage/demos`);
  await tryMkdir(v`storage/files`);
  await tryMkdir(v`storage/previews`);
  await tryMkdir(v`storage/thumbnails`);
  await tryMkdir(v`storage/videos`);

  console.log(colors.bold('[+]'), `Created directories`);
};

/**
 * Self-signed certificate for development only.
 */
const createSslCerts = async () => {
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
