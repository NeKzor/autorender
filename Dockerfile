ARG DENO_VERSION=1.42.1
ARG ALPINE_VERSION=3.18

FROM denoland/deno:bin-$DENO_VERSION AS deno

# src/bot

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS bot
COPY --from=deno /deno /usr/local/bin/deno

ADD src/import_map.json .

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/bot .

RUN deno cache main.ts bot.ts worker.ts

CMD ./entrypoint.sh

# src/server

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS server
COPY --from=deno /deno /usr/local/bin/deno

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
