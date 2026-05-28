FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/core/src/ packages/core/src/
COPY packages/service/package.json packages/service/package.json
COPY packages/service/src/ packages/service/src/

RUN bun install --production

EXPOSE 3000

WORKDIR /app/packages/service
CMD ["bun", "run", "src/index.ts"]