FROM denoland/deno:1.10.3

EXPOSE 80

WORKDIR /app

USER deno

COPY deps.ts .
#RUN deno cache deps.ts

ADD ./src/server .

#RUN deno cache main.ts

CMD ["demo", "task", "dev"]
