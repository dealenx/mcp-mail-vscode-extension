FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json ./
COPY bun.lock ./
COPY packages/core/ packages/core/
COPY packages/service/ packages/service/

RUN bun install --production

WORKDIR /app/packages/service
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]