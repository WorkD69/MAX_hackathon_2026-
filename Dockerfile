# syntax=docker/dockerfile:1.7
FROM node:24.21.0-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS toolchain
RUN npm install --global npm@11.19.0 \
    && test "$(node --version)" = v24.21.0 \
    && test "$(npm --version)" = 11.19.0
WORKDIR /app

FROM toolchain AS build
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/delivery ./scripts/delivery
RUN npm run build --workspace @max-smart-city/contracts \
    && npm run build --workspace @max-smart-city/domain \
    && npm run build --workspace @max-smart-city/db \
    && npm run build --workspace @max-smart-city/web \
    && npx --no-install tsc -p scripts/delivery/tsconfig.api.json \
    && test -s apps/api/dist/app/main.js \
    && test -s apps/web/dist/index.html \
    && test -s packages/db/dist/migrations/0001_foundation.js

FROM toolchain AS dependencies
COPY package.json package-lock.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci --omit=dev --ignore-scripts

FROM toolchain AS runtime
ARG BUILD_SHA
RUN printf '%s' "$BUILD_SHA" | grep -Eq '^[0-9a-f]{40}$'
ENV NODE_ENV=production BUILD_SHA=${BUILD_SHA}
LABEL org.opencontainers.image.revision=${BUILD_SHA}
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build --chown=node:node /app/packages/domain/dist ./packages/domain/dist
COPY --from=build --chown=node:node /app/packages/db/package.json ./packages/db/package.json
COPY --from=build --chown=node:node /app/packages/db/dist ./packages/db/dist
# TG-008 / TG-013 используют этот source seam; Node 24 удаляет type-only syntax.
COPY --from=build --chown=node:node /app/packages/db/src/seed/index.ts ./packages/db/src/seed/index.ts
COPY --chown=node:node scripts/delivery/migrate.mjs scripts/delivery/healthcheck.mjs ./scripts/delivery/
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=12 CMD ["node", "scripts/delivery/healthcheck.mjs"]
CMD ["node", "apps/api/dist/app/main.js"]
