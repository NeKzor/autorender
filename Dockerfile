ARG DENO_VERSION=2.1.7
ARG ALPINE_VERSION=3.18

FROM denoland/deno:bin-$DENO_VERSION AS deno

# src/bot

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS bot
COPY --from=deno /deno /usr/local/bin/deno

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/bot .

RUN deno install --entrypoint main.ts bot.ts worker.ts

CMD ./entrypoint.sh

# src/server

FROM frolvlad/alpine-glibc:alpine-$ALPINE_VERSION AS server
COPY --from=deno /deno /usr/local/bin/deno

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/server .

RUN deno install --entrypoint main.ts

CMD ./entrypoint.sh
