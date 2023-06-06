# autorender

Convert any Portal 2 demo file into a video with: `/render <attachment>`

## Features

- Render any demo On-Demand in a Discord server!
- Render any workshop map. Powered by [mirror.nekz.me]
- Works without being bound to `board.portal2.sr`
- Render files directly in a web platform
- Written in 100% TypeScript + Deno
- Hosted inside Docker containers

[mirror.nekz.me]: https://github.com/NeKzor/mirror

## Network Topology

```
                  RPC            WSS/HTTPS    WSS
Discord Client 1 --|                           |-- Client 1
Discord Client 2 --|-- Discord Bot -- Server --|-- Client 2
Discord Client 3 --|                           |-- ...
             ... --|
```

## Storage

```
             Bot
          Sends demo
              |
            Server
     Stores and sends demo
              |
        Render Client
     Renders demo to video
              |
            Server
         Deletes demo
         Uploads video
              |
          Backblaze
        Stores video
              |
         Server (Web)
  Links video to Backblaze URL
```

## Local Development

### Requirements

- [deno runtime]
- [Discord Application]
- [Backblaze Bucket]
- [Docker Engine]
- [mkcert] (optional)

[deno runtime]: https://deno.com/runtime
[Discord Application]: https://discord.com/developers/applications
[Backblaze Bucket]: https://www.backblaze.com
[Docker Engine]: https://docs.docker.com/engine/install
[mkcert]: https://github.com/FiloSottile/mkcert

### Setup

Generate files with: `chmod +x setup && ./setup dev`

### Install & Run Server

- Configure `src/server/.env` file
- Build the server image once with: `docker compose build`
- Start all containers with: `docker compose up`
- Add a host entry `127.0.0.1 autorender.portal2.local` to `/etc/hosts`

The server should now be available at: `http://autorender.portal2.local`

### src/server/.env

|Variable|Description|
|---|---|
|HOT_RELOAD|Automatic page reload when the server reloads. Should only be used for development!|
|DISCORD_CLIENT_ID|Client ID of the Discord OAuth2 application.|
|DISCORD_CLIENT_SECRET|Client secret of the Discord OAuth2 application.|
|DISCORD_REDIRECT_URI|OAuth redirect URI of the Discord OAuth2 application.|
|BOT_AUTH_TOKEN|Generated token which is shared between the server and the bot.|
|COOKIE_SECRET_KEY|Secret used to encrypt/decrypt session cookies.|
|B2_BUCKET_ID|Bucket ID from Backblaze.|
|B2_KEY_ID|Key ID from Backblaze.|
|B2_KEY_NAME|Key name from Backblaze.|
|B2_APP_KEY|App key from Backblaze.|

### Install & Run Client

- Install [SourceAutoRecord]
- Copy `autorender.cfg` into the game's `cfg` directory
- Log into `http://autorecord.portal2.local` with your Discord account
- Generate a new token in the platform
- Copy generated token into the `src/client/.env` file as `AUTORENDER_API_KEY`
- Run from the client folder `src/client` the command `deno task start`

[SourceAutoRecord]: https://sar.portal2.sr

#### src/client/.env

|Variable|Description|
|---|---|
|GAME_DIR|Directory path of the game.|
|GAME_EXE|The binary or script to execute: `portal2.exe` (Windows) `portal2.sh` (Linux).|
|AUTORENDER_API_KEY|Access token for autorender server.|

### Install & Run Bot

- Copy the bot credentials of the Discord application into the `src/bot/.env` file
- Configure `BOT_AUTH_TOKEN` with the same password that is shared with the server
- Run from the bot folder `src/bot` the command `deno task start`

#### src/bot/.env

|Variable|Description|
|---|---|
|DISCORD_BOT_TOKEN|Token of the Discord bot application.|
|DISCORD_BOT_ID|Client ID of the Discord bot application.|
|BOT_AUTH_TOKEN|Generated token which is shared between the server and the bot.|

### Caveats

- Permissions have to be managed manually for mounted volumes, see [moby#2259]
- ~~MySQL 8 container leaks memory, see [containerd#6707]~~ MariaDB is better

[moby#2259]: https://github.com/moby/moby/issues/2259
[containerd#6707]: https://github.com/containerd/containerd/issues/6707

## Credits

- [@PortalRex] for idea and motivation
- [@mlugg] for [autorender.portal2.sr]
- [p2sr/SourceAutoRecord] for rendering commands

[@PortalRex]: https://github.com/PortalRex
[@mlugg]: https://github.com/mlugg
[autorender.portal2.sr]: https://autorender.portal2.sr
[p2sr/SourceAutoRecord]: https://github.com/p2sr/SourceAutoRecord

## License

[MIT License](./LICENSE)
