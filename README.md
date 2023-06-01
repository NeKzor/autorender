# autorender.nekz.me

Render any Portal 2 demo file to a video with: `/render <file>`

[Invite the bot to your server!]

[Invite the bot to your server!]: https://discord.com/oauth2/authorize?&client_id=1112876563881537607&scope=bot&permissions=3072

## What's different from autorender.portal2.sr?

- Render any demo On-Demand with a single command in a Discord server!
- Render any workshop map. Powered by [mirror.nekz.me]
- Works without being bound to `board.portal2.sr`
- Render files directly in a web platform
- Demo validation
- Can easily be ported to other Source Engine games
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

## Local Development

Requirements:

- [deno runtime]
- [Discord Bot Application Token]
- Discord OAuth Application Token
- [Backblaze Account]
- [Docker Engine] | [Reference](https://docs.docker.com/compose/reference/)
- [mkcert]

[deno runtime]: https://deno.com/runtime
[Discord Bot Application Token]: https://discord.com/developers/applications
[Backblaze Account]: https://www.backblaze.com
[Docker Engine]: https://docs.docker.com/engine/install
[mkcert]: https://github.com/FiloSottile/mkcert

Steps:

- Project setup with `chmod +x setup && ./setup dev`
- Configure the generated `src/server/.env` file:
  - `DISCORD_CLIENT_ID` Discord application client ID
  - `BOT_AUTH_TOKEN` Randomly generated shared password between bot and server
  - `B2_KEY_ID` Backblaze application key ID
  - `B2_KEY_NAME`Backblaze application key name
  - `B2_APP_KEY`Backblaze application key
- Configure the generated `src/client/.env` file:
  - `API_KEY` API application token for accessing the server
- Configure the generated `src/bot/.env` file:
  - `DISCORD_BOT_TOKEN` Discord bot token
  - `DISCORD_BOT_ID` Discord bot client ID
  - `BOT_AUTH_TOKEN` Randomly generated shared password between bot and server
- Build the server image once with `docker compose build`
- Start the containers with `docker compose up`
- Add the host entry `127.0.0.1 autorender.portal2.local` to `/etc/hosts`

The server should now be available at: `http://autorender.portal2.local`

### Caveats

- Permissions have to be managed manually for mounted volumes, see [moby#2259]
- ~~MySQL 8 container leaks memory, see [containerd#6707]~~ MariaDB is better

[moby#2259]: https://github.com/moby/moby/issues/2259
[containerd#6707]: https://github.com/containerd/containerd/issues/6707

## Credits

- @PortalRex for idea and motivation
- @mlugg for `autorender.portal2.sr` (used as a reference)

## License

[MIT License](./LICENSE)
