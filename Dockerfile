# src/bot

FROM denoland/deno:alpine-1.35.3 AS bot

ADD src/import_map.json .

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/bot .

RUN deno cache main.ts bot.ts worker.ts

CMD deno task ${DENO_TASK_ENTRYPOINT}

# src/server

FROM denoland/deno:alpine-1.35.3 AS server

ARG DENO_TASK_ENTRYPOINT

RUN apk update
RUN apk upgrade
RUN apk add --no-cache ffmpeg

ADD src/import_map.json .

WORKDIR /shared
ADD src/shared .

WORKDIR /app
ADD src/server .

# TODO: use deps file
RUN deno cache main.ts

CMD deno task ${DENO_TASK_ENTRYPOINT}
