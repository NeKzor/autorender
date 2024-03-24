# src/bot

FROM denoland/deno:alpine-1.40.5 AS bot

ADD src/import_map.json .

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/bot .

RUN deno cache main.ts bot.ts worker.ts

CMD ./entrypoint.sh

# src/server

FROM denoland/deno:alpine-1.40.5 AS server

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

ADD src/import_map.json .

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/server .

RUN deno cache main.ts

CMD ./entrypoint.sh
