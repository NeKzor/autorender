# autorender

Convert any Portal 2 demo file into a video with: `/render <attachment>`

## Features

- Render videos On-Demand in a Discord server
- Support for workshop maps, powered by [mirror.nekz.me]
- Render files directly in a web platform (TODO)
- Runs in a secure runtime with [Deno]
- Written in 100% TypeScript
- Hosted inside Docker containers (TODO)

[mirror.nekz.me]: https://github.com/NeKzor/mirror
[Deno]: https://deno.com/runtime

## TODO

- Resolves render options
- Generate video preview + thumbnails
- Design frontend platform
  - Profiles
  - Search
  - Users
  - Audit logs
  - Demo upload
- Support game mods
- Unlisted videos
- Figure out how private videos would work
- Package client code
  - Installer CLI
  - Download SAR/autorender.cfg automatically
  - Single executable
- Figure out docker + easier setup
- Figure out a way to fix the server's [net permission](#caveats)
- SAR wishlist:
  - Remove unnecessary watermark
  - Sandbox commands like in 1.0
  - IPC between client and game process

## Network Topology

```
                HTTPS/WSS      WSS  HTTPS/WSS    WSS
Discord Client 1 --|                              |-- Client 1
Discord Client 2 --|-- Discord -- Bot -- Server --|-- Client 2
Discord Client 3 --|                              |-- ...
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
- Run from the server folder `src/server` the command `deno task start:dev`

The server should now be available at: `http://autorender.portal2.local`

### User Setup

- Create the user account once by logging in from the home page
- Make sure that `DISCORD_USER_ID` in the `src/server/.env` file is the correct user ID of the created user
- Set all permissions for the account with `deno run -A tasks/dev.ts`
- Logout and login again

### src/server/.env

|Variable|Description|
|---|---|
|HOT_RELOAD|Automatic page reload when the server reloads. Should only be used for development!|
|DISCORD_USER_ID|Discord user ID of developer account. This is only used to reset the permissions.|
|DISCORD_CLIENT_ID|Client ID of the Discord OAuth2 application.|
|DISCORD_CLIENT_SECRET|Client secret of the Discord OAuth2 application.|
|DISCORD_REDIRECT_URI|OAuth redirect URI of the Discord OAuth2 application.|
|AUTORENDER_BOT_TOKEN|Generated token which is shared between the server and the bot.<br>Example: `openssl rand -hex 12`|
|COOKIE_SECRET_KEY|Non-predictable key used to encrypt/decrypt session cookies.|
|B2_BUCKET_ID|Bucket ID from Backblaze.|
|B2_KEY_ID|Key ID from Backblaze.|
|B2_KEY_NAME|Key name from Backblaze.|
|B2_APP_KEY|App key from Backblaze.|

### Install & Run Client

- Install [fixed version of SourceAutoRecord]
- Copy `autorender.cfg` into the game's `cfg` directory
- Log into the platform
- Generate a new token in the platform (make sure the permissions have been set for the logged in account)
- Copy generated token into the `src/client/.env` file as `AUTORENDER_API_KEY`
- Run from the client folder `src/client` the command `deno task start:dev`

[fixed version of SourceAutoRecord]: https://github.com/NeKzor/sar/releases/tag/autorender

#### src/client/.env

|Variable|Description|
|---|---|
|GAME_DIR|Directory path of the game.|
|GAME_EXE|The binary or script to execute: `portal2.exe` (Windows) `portal2.sh` (Linux).|
|AUTORENDER_API_KEY|Access token for autorender server.|

### Install & Run Bot

- Copy the bot credentials of the Discord application into the `src/bot/.env` file
- Configure `AUTORENDER_BOT_TOKEN` with the same password that is shared with the server
- Run from the bot folder `src/bot` the command `deno task start:dev`

#### src/bot/.env

|Variable|Description|
|---|---|
|DISCORD_BOT_TOKEN|Token of the Discord bot application.|
|DISCORD_BOT_ID|Client ID of the Discord bot application.|
|AUTORENDER_BOT_TOKEN|Generated token which is shared between the server and the bot.|

### Caveats

- Deno permissions do not support wildcards for domains, see [deno#6532]
- Permissions for containers have to be managed manually for mounted volumes, see [moby#2259]
- ~~MySQL 8 container leaks memory, see [containerd#6707]~~ MariaDB is better

[deno#6532]: https://github.com/denoland/deno/issues/6532
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
