# build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# copy package.son bun.lock
COPY package.json bun.lock ./
RUN bun install  --frozen-lockfile --production --verbose

# copy rest
COPY . .

# build 
RUN bun build --compile --minify --sourcemap ./src --outfile hono-docker-app

RUN bun build --compile --minify --sourcemap ./src/index.ts --outfile hono-docker-app

CMD ["./hono-docker-app"]











