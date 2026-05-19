# build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# copy package.son bun.lock
COPY package.json bun.lock ./
# RUN bun install  --frozen-lockfile --production --verbose
RUN bun install  --frozen-lockfile  --verbose

# copy rest
COPY . .

# build
# RUN bun build --compile --minify --sourcemap ./src/index.ts --outfile hono-docker-app

# CMD ["./hono-docker-app"]

CMD ["bun", "run", "dev"]
