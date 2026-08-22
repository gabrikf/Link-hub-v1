# syntax=docker/dockerfile:1.7
#
# Production image for apps/api — and ONLY apps/api.
#
# One image, three processes. The API, the resume-embedding worker and the
# activity-digest worker are the same build; docker-compose.prod.yml starts them
# with different `command`s and a different SERVICE_ROLE. Building three images
# for three entry points in the same codebase would triple the build time and
# guarantee they eventually drift apart.
#
# NOT in this image, deliberately:
#   apps/web       static Vite bundle, deployed to Cloudflare Pages
#   apps/mcp       CLI, installed by users on their own machines
#   apps/extractor CLI, ditto
#   apps/training  runs in GitHub Actions
#
# WHY bookworm-slim AND NOT alpine: `argon2` and `sharp` are native. Both ship
# prebuilt glibc binaries (`@img/sharp-linux-x64`, argon2's node-gyp-build
# prebuilds) that install with zero compilation. On musl there is no prebuild
# for argon2, so alpine would drag in python3 + make + g++ + a node-gyp source
# build — a slower build and a *larger* image than the glibc one it was supposed
# to shrink.

ARG NODE_VERSION=22-bookworm-slim


# ---------------------------------------------------------------------------
# deps — dependency layer, cached independently of application source
# ---------------------------------------------------------------------------
# Only manifests are copied here. Editing a single .ts file must not invalidate
# a 400MB npm install, and the only way to guarantee that is for this stage to
# never see a .ts file at all.
FROM node:${NODE_VERSION} AS deps

WORKDIR /app

ENV npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false

# Root manifests + lockfile.
COPY package.json package-lock.json turbo.json ./

# EVERY workspace manifest, including the ones this image does not build.
# `npm ci` validates the lockfile against the whole workspace graph; a missing
# apps/web/package.json makes it refuse to install even when web is filtered
# out of the install itself.
COPY apps/api/package.json          apps/api/
COPY apps/extractor/package.json    apps/extractor/
COPY apps/mcp/package.json          apps/mcp/
COPY apps/training/package.json     apps/training/
COPY apps/web/package.json          apps/web/
COPY packages/eslint-config/package.json    packages/eslint-config/
COPY packages/schemas/package.json          packages/schemas/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json               packages/ui/

# --workspace filtering is what keeps this sane: an unfiltered `npm ci` installs
# 1294 packages (react, @tensorflow/tfjs, vite, the whole front end). Filtered to
# the two workspaces this image actually needs it is 645, and with --omit=dev in
# the runtime stage, 283.
#   --workspace=api            the service
#   --workspace=@repo/schemas  api depends on it AND we must build it, which
#                              needs its own devDependencies (typescript,
#                              @repo/typescript-config) — those are only
#                              installed when the workspace is selected itself,
#                              not when it is merely a dependency of a selection
#   --include-workspace-root   root deps (dotenv, zod) + root devDeps, which is
#                              where `turbo` and `typescript` live
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=api --workspace=@repo/schemas --include-workspace-root


# ---------------------------------------------------------------------------
# build — compile @repo/schemas then apps/api
# ---------------------------------------------------------------------------
FROM deps AS build

WORKDIR /app

# Only the sources that participate in the api build. Copying `.` would pull in
# apps/web and invalidate this layer on every front-end commit.
COPY packages/typescript-config packages/typescript-config
COPY packages/schemas packages/schemas
COPY apps/api apps/api

# `--filter=api` + turbo.json's `build.dependsOn: ["^build"]` builds
# @repo/schemas first. apps/api's build is `tsc -p tsconfig.build.json`, which
# excludes *.test.ts so no vitest import ever reaches dist/.
RUN npx turbo run build --filter=api


# ---------------------------------------------------------------------------
# runtime — production dependencies + compiled output, nothing else
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# Set before `npm ci` so npm itself also honours it, and read by app code
# (assertProductionConfig, logger, rate limits, AI quotas all key off it).
ENV NODE_ENV=production \
    PORT=3333 \
    HOST=0.0.0.0 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json          apps/api/
COPY apps/extractor/package.json    apps/extractor/
COPY apps/mcp/package.json          apps/mcp/
COPY apps/training/package.json     apps/training/
COPY apps/web/package.json          apps/web/
COPY packages/eslint-config/package.json    packages/eslint-config/
COPY packages/schemas/package.json          packages/schemas/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/ui/package.json               packages/ui/

# THE @repo/schemas WORKSPACE-SYMLINK PROBLEM, AND HOW IT IS SOLVED HERE.
#
# npm workspaces do not copy a workspace into node_modules — they symlink it.
# After an install at the repo root the tree is:
#
#   /app/node_modules/@repo/schemas -> ../../packages/schemas   (symlink)
#   /app/node_modules/api           -> ../apps/api              (symlink)
#   /app/apps/api/node_modules/...  (the few deps that could not hoist)
#
# The classic broken Dockerfile does `COPY --from=build /app/node_modules ...`
# plus `COPY --from=build /app/apps/api/dist ...` and stops there. The symlink is
# copied faithfully, its target `packages/schemas` never is, and the container
# dies at boot with ERR_MODULE_NOT_FOUND on the very first `@repo/schemas`
# import — a failure that cannot happen in dev, because in dev the target is
# right there on disk.
#
# The fix is to keep the workspace layout instead of fighting it: install at
# /app exactly as the repo does, so npm recreates the symlink itself, and then
# materialise its target by copying `packages/schemas/{package.json,dist}` into
# the image. The symlink then resolves to a real directory with a real
# dist/index.js, and Node's resolver — which reads `packages/schemas/package.json`
# ("main": "dist/index.js", "exports": "./dist/index.js") through the link —
# behaves identically to development.
#
# Note that node_modules is REBUILT here rather than copied from `build`. That is
# what drops the ~460MB dev tree (typescript, tsx, drizzle-kit, vitest, turbo) to
# a ~200MB production one, and it is a separately cached layer keyed only on the
# lockfile.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace=api --include-workspace-root \
    && npm cache clean --force

# Compiled output. Copied after the install so a source-only change reuses every
# layer above this line.
COPY --from=build --chown=node:node /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=build --chown=node:node /app/apps/api/dist         ./apps/api/dist

# The migration SQL and its `meta/_journal.json` ledger. REQUIRED AT RUNTIME:
# `npm run db:migrate:prod` reads these files directly. drizzle-kit is a
# devDependency and is not in this image — dist/infra/database/drizzle/migrate.js
# uses drizzle-orm's migrator against this exact folder instead.
COPY --chown=node:node apps/api/drizzle ./apps/api/drizzle

# Built-in unprivileged user that the node images ship (uid/gid 1000).
USER node

# cwd is apps/api so that `npm run start` / `npm run db:migrate:prod` resolve,
# and so the relative `--import ./dist/...` in those scripts points at the right
# file. No .env file is baked in — dotenv/config finds nothing and silently
# no-ops, which is correct: configuration comes from compose's env_file.
WORKDIR /app/apps/api

EXPOSE 3333

# `node -e` rather than curl/wget: Node 22 has a global fetch, so the probe costs
# zero extra bytes and zero extra CVE surface in the image.
# /health is exempt from rate limiting and from CORS origin checks (it sends no
# Origin header), so this cannot flap under load or after a WEB_APP_URL change.
# The workers do not listen on a port — docker-compose.prod.yml disables this
# inherited healthcheck for them.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3333/health').then(r=>{if(!r.ok)throw new Error('status '+r.status)}).catch(()=>process.exit(1))"]

# Commit the image was built from. Declared LAST, on purpose: it changes on
# every single build, so anything below it is rebuilt every time and anything
# above it stays cached. Placed here it invalidates one ~0-byte metadata layer.
#
# Read by the app as the Sentry release fallback and as a resource attribute on
# every span and metric, which is what lets a regression be traced to the deploy
# that introduced it. Both scripts/deploy.sh and .github/workflows/deploy.yml
# pass it as --build-arg.
ARG GIT_SHA=unknown
ENV GIT_SHA=${GIT_SHA}
LABEL org.opencontainers.image.revision=${GIT_SHA}

# The exact command behind `npm run start`, invoked directly rather than through
# npm. npm as PID 1 is an extra process between Docker and Node that forwards
# SIGTERM unreliably, and this app has a real graceful-shutdown path (drain the
# server, flush metrics, flush Sentry, close Redis) that only runs if the signal
# actually reaches Node. Compose sets `init: true` to reap orphans.
CMD ["node", "--import", "./dist/infra/observability/register.js", "dist/index.js"]
