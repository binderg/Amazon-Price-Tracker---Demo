# syntax=docker/dockerfile:1

FROM oven/bun:1 AS frontend-builder
WORKDIR /app/apt-frontend
COPY apt-frontend/package.json apt-frontend/bun.lock* ./
RUN bun install
COPY apt-frontend/ ./
RUN bun run build

FROM oven/bun:1 AS backend-deps
WORKDIR /app/apt-backend
COPY apt-backend/package.json apt-backend/bun.lock* ./
RUN bun install --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production

COPY --from=backend-deps /app/apt-backend/node_modules ./apt-backend/node_modules
COPY apt-backend ./apt-backend
COPY --from=frontend-builder /app/apt-frontend/dist ./apt-frontend/dist

WORKDIR /app/apt-backend
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
