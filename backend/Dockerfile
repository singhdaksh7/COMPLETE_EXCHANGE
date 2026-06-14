# ---------- Stage 1: build ----------
FROM node:20-alpine AS builder

# Prisma needs OpenSSL present to generate the correct engine.
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies (including dev) using the lockfile for reproducibility.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and generate the Prisma client + compile TypeScript.
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# Strip dev dependencies for a smaller runtime image.
RUN npm prune --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl wget

ENV NODE_ENV=production
WORKDIR /app

# Run as the non-root "node" user that ships with the base image.
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/package.json ./package.json

USER node

EXPOSE 4000

# Container-level healthcheck hitting the liveness endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health || exit 1

# The application container ONLY runs the server. Migrations are applied by a
# separate, single-run step (the `migrate` compose service / CI job / init
# container) so that scaling the API to N replicas never races N concurrent
# `migrate deploy` invocations against the same database.
CMD ["node", "dist/server.js"]
