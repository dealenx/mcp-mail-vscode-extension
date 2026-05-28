FROM oven/bun:1 AS base
WORKDIR /app

COPY packages/service/package.json ./
COPY packages/service/src/ ./src/
COPY packages/service/tsconfig.json ./

RUN bun install --production

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]