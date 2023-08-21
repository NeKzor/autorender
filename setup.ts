/*
 * Copyright (c) 2023, NeKz
 *
 * SPDX-License-Identifier: MIT
 */

import { Command } from 'cliffy/command/mod.ts';
import { colors } from 'cliffy/ansi/colors.ts';
import { Input, Secret, Select } from 'cliffy/prompt/mod.ts';

type Environment = 'dev' | 'prod';

const devHostname = 'autorender.portal2.local';

let inviteLink = '';

const main = async () => {
  await new Command()
    .name('autorender-setup')
    .version('1.0.0')
    .description('Command line setup tool for a new autorender project.')
    .parse(Deno.args);

  await setup();
};

const setup = async () => {
  const envValue = await Select.prompt({
    message: 'In which environment does the server run?',
    options: [
      {
        name: 'Development',
        value: 'dev',
      },
      {
        name: 'Production',
        value: 'prod',
      },
    ],
  });

  const env = envValue as Environment;

  await createDockerComposeFile(env);
  await createConfigAndEnv(env);
  await createLogs(env);
  await createVolumes(env);
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

const createDockerComposeFile = async (env: Environment) => {
  if (env === 'prod') {
    const files = [];
    for await (const file of Deno.readDir('docker/compose')) {
      if (file.isFile && file.name.endsWith('.yml')) {
        files.push(file.name);
      }
    }

    const template = await Select.prompt({
      message: 'Choose a docker-compose template:',
      options: files,
    });

    await tryCopy(`docker/compose/${template}`, 'docker-compose.yml');
  } else {
    await tryCopy(`docker/compose/${devHostname}.yml`, 'docker-compose.yml');
  }
};

/**
 * Configuration files:
 *    .env            -> used by docker
 *    src/bot/.env    -> used by the bot    (mounted by docker)
 *    src/server/.env -> used by the server (mounted by docker)
 */
const createConfigAndEnv = async (env: Environment) => {
  await tryCopy('.env.example', '.env');
  await tryCopy('src/bot/.env.example', 'src/bot/.env');
  await tryCopy('src/server/.env.example', 'src/server/.env');

  const botEnv = (await Deno.readTextFile('src/bot/.env')).split('\n');
  const serverEnv = (await Deno.readTextFile('src/server/.env')).split('\n');

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

  await Deno.writeTextFile('src/bot/.env', botEnv.join('\n'));
  await Deno.writeTextFile('src/server/.env', serverEnv.join('\n'));

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
 * Mounted log directories:
 *    src/bot/log/bot
 *    src/server/log/server
 */
const createLogs = async (_env: Environment) => {
  await tryMkdir('docker/logs/bot');
  await tryMkdir('docker/logs/server');

  console.log(colors.bold('[+]'), colors.white(`Created log directories in docker/logs`));
};

/**
 * Other mounted volumes:
 *    docker/volumes/kv    -> database used by the bot
 *    docker/volumes/mysql -> database used by the server
 */
const createVolumes = async (_env: Environment) => {
  await tryMkdir('docker/volumes/kv');
  await tryMkdir('docker/volumes/mysql');

  console.log(colors.bold('[+]'), colors.white(`Created volumes in docker/volumes`));
};

/**
 * Self-signed certificate for development only.
 */
const createSslCerts = async (env: Environment) => {
  if (env === 'prod') {
    return;
  }

  const stat = await tryStat(`docker/ssl/${devHostname}.crt`);
  if (stat) {
    console.log(colors.bold('[+]'), colors.white(`Skipped self-signed certificate`));
    return;
  }

  await tryMkdir(`docker/ssl`);

  const mkcert = new Deno.Command('mkcert', {
    args: [
      `-cert-file`,
      `docker/ssl/${devHostname}.crt`,
      `-key-file`,
      `docker/ssl/${devHostname}.key`,
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
