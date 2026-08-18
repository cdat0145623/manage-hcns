# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=20
ARG DISTROLESS_NODE_IMAGE=gcr.io/distroless/nodejs${NODE_VERSION}-debian12

# ============================================
# Stage 1: Alpine base with pnpm and turbo
# ============================================
FROM node:${NODE_VERSION}-alpine AS alpine
RUN apk update && \
    apk add --no-cache libc6-compat && \
    rm -rf /var/cache/apk/* /tmp/* || true && \
    corepack enable && \
    corepack prepare pnpm@9.14.2 --activate && \
    npm install turbo@2.3.1 --global && \
    pnpm config set store-dir ~/.pnpm-store

# ============================================
# Stage 2: Prune the monorepo
# ============================================
FROM alpine AS pruner

RUN apk add --no-cache git

WORKDIR /app
COPY . .

# Generate version from git (fallback if APP_VERSION not provided)
RUN git fetch --tags --unshallow 2>/dev/null || git fetch --tags 2>/dev/null || true && \
    AUTO_VERSION=$(git describe --tags --always --long 2>/dev/null | \
    sed -E 's/^v?([0-9]+\.[0-9]+\.[0-9]+)-[0-9]+-g([a-f0-9]{7}).*/\1+\2/' | \
    sed 's/^v//' || \
    git rev-parse --short HEAD 2>/dev/null | head -c 7 || \
    echo "unknown") && \
    echo "$AUTO_VERSION" > /app/AUTO_VERSION

RUN turbo prune --scope=@kan/web --scope=@kan/db --docker

# Prune a smaller workspace for the background scheduler image.
FROM alpine AS scheduler-pruner

WORKDIR /app
COPY . .
RUN turbo prune --scope=@kan/db --docker

# ============================================
# Stage 3: Install dependencies
# ============================================
FROM alpine AS deps
WORKDIR /app

COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

ENV CI=true
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store pnpm install --frozen-lockfile

FROM alpine AS scheduler-deps
WORKDIR /app

COPY --from=scheduler-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=scheduler-pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=scheduler-pruner /app/out/json/ .

ENV CI=true
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store \
    pnpm install --frozen-lockfile --prod

# ============================================
# Stage 4: Build the web application
# ============================================
FROM alpine AS builder
ARG APP_VERSION
ARG NEXT_PUBLIC_AVATAR_BUCKET_NAME
ARG NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME
ARG NEXT_PUBLIC_STORAGE_URL

WORKDIR /app

# Olson DB on Alpine: Next SSR during `next build` uses process TZ for plain date-fns `format()`.
RUN apk add --no-cache tzdata

COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/AUTO_VERSION /tmp/AUTO_VERSION

# Force standalone output for production Docker image
ENV NEXT_PUBLIC_USE_STANDALONE_OUTPUT=true
ENV CI=true
ENV TZ=Asia/Ho_Chi_Minh
ENV NEXT_PUBLIC_AVATAR_BUCKET_NAME=$NEXT_PUBLIC_AVATAR_BUCKET_NAME
ENV NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME=$NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME
ENV NEXT_PUBLIC_STORAGE_URL=$NEXT_PUBLIC_STORAGE_URL

RUN --mount=type=cache,id=next_cache,target=/app/apps/web/.next/cache \
    VERSION="${APP_VERSION:-$(cat /tmp/AUTO_VERSION 2>/dev/null | tr -d '\n\r' || echo 'unknown')}" && \
    NEXT_PUBLIC_APP_VERSION="$VERSION" pnpm build --filter=@kan/web
# ============================================
# Stage 4.5: Development (hot reload enabled)
# ============================================
FROM alpine AS dev
WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy ALL workspace packages (quan trọng!)
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tooling/ ./tooling/

# Install ALL dependencies (including devDependencies)
RUN --mount=type=cache,id=pnpm,target=/root/.pnpm-store pnpm install

# Set development environment variables
ENV NODE_ENV=development
ENV CHOKIDAR_USEPOLLING=true
ENV WATCHPACK_POLLING=true
ENV PORT=3000

EXPOSE 3000

# Default command (can be overridden in docker-compose)
CMD ["pnpm", "dev"]

# ============================================
# Stage 4.6: Production task instance scheduler
# ============================================
FROM alpine AS scheduler
WORKDIR /app

RUN apk add --no-cache tzdata

COPY --from=scheduler-deps /app/ ./
COPY --from=scheduler-pruner /app/out/full/ .

ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh

CMD ["pnpm", "exec", "tsx", "packages/db/src/scripts/task-instance-scheduler.ts"]
# ============================================
# Stage 5: Migration image (run-once container)
# ============================================
FROM node:${NODE_VERSION}-alpine AS migrate
WORKDIR /db

COPY packages/db/drizzle.config.ts ./drizzle.config.ts
COPY packages/db/migrations/ ./migrations/

RUN npm init -y && \
    npm install drizzle-kit drizzle-orm pg --save-exact && \
    # Strip unnecessary files from node_modules
    find node_modules -type f \( \
      -name '*.d.ts' -o \
      -name '*.d.mts' -o \
      -name '*.d.cts' -o \
      -name '*.map' -o \
      -name '*.md' -o \
      -name '*.txt' -o \
      -name 'LICENSE*' -o \
      -name 'CHANGELOG*' -o \
      -name 'README*' -o \
      -name '.eslint*' -o \
      -name '.prettier*' -o \
      -name 'tsconfig*.json' \
    \) -delete && \
    find node_modules -type d -empty -delete && \
    rm -rf /root/.npm /tmp/*

CMD ["npx", "drizzle-kit", "migrate"]

# ============================================
# Stage 5.5: IANA tzdata for distroless (no /usr/share/zoneinfo; Node falls back to UTC)
# ============================================
FROM debian:bookworm-slim AS tzdata
RUN apt-get update && \
    apt-get install -y --no-install-recommends tzdata && \
    rm -rf /var/lib/apt/lists/*

# ============================================
# Stage 6: Production web image (distroless)
# ============================================
FROM ${DISTROLESS_NODE_IMAGE} AS web
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Without zoneinfo + TZ, SSR uses UTC for any code that relies on "local" time (date-fns format, etc.)
COPY --from=tzdata /usr/share/zoneinfo /usr/share/zoneinfo
ENV TZ=Asia/Ho_Chi_Minh

# Copy the standalone Next.js server
COPY --from=builder /app/apps/web/.next/standalone/ ./
# Copy static assets and public files
COPY --from=builder /app/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=builder /app/apps/web/public/ ./apps/web/public/

# Copy bootstrap script for runtime env var injection
COPY apps/web/bootstrap.cjs ./bootstrap.cjs

EXPOSE 3000
CMD ["bootstrap.cjs"]
