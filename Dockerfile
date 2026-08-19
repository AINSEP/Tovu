# syntax=docker/dockerfile:1.7
#
# Tovu — self-hosted container image.
#
# ============================================================================
# THE BUILD CONTEXT IS THE PARENT DIRECTORY, NOT THIS REPO. READ THIS FIRST.
# ============================================================================
#
# Build with:
#
#     docker build -f Tovu/Dockerfile -t tovu:local ..
#
# ...run from inside the Tovu checkout, or equivalently from the parent:
#
#     docker build -f Tovu/Dockerfile -t tovu:local .
#
# `docker build .` from the Tovu root CANNOT work, and this is not a style
# preference. Tovu declares 22 dependencies as relative paths that escape this
# repo: 12 in the root `package.json` as `file:../Jini/packages/*`, and 10 more
# in `apps/admin/package.json` as `file:../../../Jini/packages/*`. A build
# context rooted at the Tovu checkout cannot see any of them.
#
# Two other routes were considered and rejected on evidence:
#
#   - `npm pack` the Jini packages into tarballs staged inside this repo, then
#     rewrite the specifiers. Dead end: Jini packages declare their internal
#     dependencies with pnpm's workspace protocol (e.g. `@jini-ai/cms`'s
#     `"@jini-ai/core": "workspace:*"`), which npm cannot resolve. Every
#     tarball would need its own manifest rewritten too.
#   - `npm install --install-links` to copy rather than symlink. Same blocker:
#     it does not teach npm what `workspace:*` means.
#
# So the context has to contain both trees. The parent directory also holds
# every other project on the machine, which is why the companion
# `Dockerfile.dockerignore` excludes everything and then re-includes exactly
# `Tovu/` and `Jini/`. BuildKit reads `<dockerfile-name>.dockerignore` from
# beside the Dockerfile and it takes precedence over any `.dockerignore` at the
# context root, which is what lets that file live inside this repo and be
# committed with it.
#
# Requires BuildKit (default in Docker 23+).
#
# ============================================================================
# Paths inside the image
# ============================================================================
#
# Both trees keep their on-disk layout as `/workspace/Jini` and
# `/workspace/Tovu` — siblings, exactly as on a developer machine. This is
# load-bearing: `npm install` resolves `file:` dependencies by creating
# SYMLINKS (verified: every entry in `node_modules/@jini-ai/` is a symlink into
# `../../../Jini/packages/*`), so relocating either tree breaks every one of
# them. Copying Tovu's `node_modules` to an image without the Jini tree beside
# it produces a container that builds cleanly and dies on its first `require`.

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Stage 1 — build the Jini workspace.
# ---------------------------------------------------------------------------
# Jini's `dist/` is gitignored, so a fresh checkout has no build output and
# every `@jini-ai/*` import resolves to nothing. `pnpm -r build` is what makes
# the packages importable at all.
FROM node:${NODE_VERSION}-bookworm AS jini

RUN corepack enable
WORKDIR /workspace/Jini

# The whole tree in one layer. Splitting manifests out for finer cache
# granularity is not worth it across 28 packages whose interdependencies mean
# almost any source change invalidates the install anyway.
COPY Jini/ ./

# `--frozen-lockfile` makes a stale `pnpm-lock.yaml` a hard failure rather than
# a silently different dependency graph than the developer machine resolved.
RUN pnpm install --frozen-lockfile && pnpm -r build

# ---------------------------------------------------------------------------
# Stage 2 — install and build Tovu against the freshly built Jini.
# ---------------------------------------------------------------------------
# On the full `bookworm` image, not `-slim`: the three native modules
# (better-sqlite3, argon2, sharp) need a working toolchain — python3, make, g++
# — which `-slim` does not carry. Bookworm here and bookworm-slim at runtime
# share a glibc, so binaries compiled in this stage load in that one.
FROM node:${NODE_VERSION}-bookworm AS build

WORKDIR /workspace
COPY --from=jini /workspace/Jini ./Jini
COPY Tovu/ ./Tovu

WORKDIR /workspace/Tovu

# NODE_ENV is deliberately NOT set to production anywhere in this stage:
# typescript, vite and the rest of the build chain are devDependencies, and
# `npm install` under NODE_ENV=production would skip all of them.
RUN npm install

# The two browser apps build to static assets served by the Node process. They
# have their own `node_modules` with their own symlinks into the Jini tree.
RUN npm --prefix apps/admin install && npm --prefix apps/admin run build
RUN npm --prefix apps/site-chat install && npm --prefix apps/site-chat run build

# `tsc` plus the asset copies (templates, themes, drizzle migrations, public).
RUN npm run build

# Belt and braces. `Dockerfile.dockerignore` already excludes `Tovu/infra`, but
# that directory holds the developer's real `content.db`, WAL sidecars and
# uploads — baking it into a published image would ship their data to whoever
# pulls it. Removing it here means a dockerignore edit cannot quietly
# reintroduce that.
RUN rm -rf infra

# ---------------------------------------------------------------------------
# Stage 3 — runtime.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime

# sharp's prebuilt libvips and better-sqlite3 both link against the system
# C++ runtime; `-slim` carries libstdc++ but not the ICU data some locales
# need. ca-certificates is required for any outbound HTTPS (integrations,
# provider APIs, remote themes).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Both trees together, from the same stage, so every relative symlink created
# by `npm install` still resolves. This is the single biggest contributor to
# image size and the most obvious thing to optimise later — but correctness
# first: a smaller image that cannot resolve `@jini-ai/core` is worth nothing.
COPY --from=build /workspace /workspace

WORKDIR /workspace/Tovu

# `src/server/app.ts` resolves these two from `__dirname` when unset, and the
# compiled layout puts `__dirname` at `dist/src/server`, which makes the
# relative fallback land at `dist/apps/admin/dist` — not where the admin build
# actually is. Setting them explicitly sidesteps that entirely rather than
# relying on a path that happens to work in the source tree and not the built
# one.
ENV TOVU_ADMIN_DIST=/workspace/Tovu/apps/admin/dist \
    TOVU_SITE_CHAT_DIST=/workspace/Tovu/apps/site-chat/dist \
    PORT=3000 \
    JINI_AGENT_DAEMON_PORT=4319

# `infra/` is runtime state, never image content: `content.db` and its WAL
# sidecars (`src/server/deps.ts:169`), `uploads/` (`deps.ts:133`), and ops
# state. Both paths are resolved relative to the working directory, so the
# volume mounts here. A missing or unwritable `infra/` fails boot with
# SQLITE_CANTOPEN.
RUN mkdir -p infra && chown -R node:node /workspace/Tovu/infra
VOLUME ["/workspace/Tovu/infra"]

# The image serves the site and admin on PORT. JINI_AGENT_DAEMON_PORT is
# deliberately NOT exposed — the agent daemon is an internal process the API
# proxies to, and it authenticates with a bearer token rather than by being
# unreachable. Publishing it would put an agent-execution surface on the
# network for no benefit.
EXPOSE 3000

USER node

# Run the compiled entrypoint directly under node, with no shell wrapper, so
# the process is PID 1's direct child and receives signals unmodified.
#
# The agent daemon is spawned as a DETACHED child in its own process group
# (`src/index.ts`, `spawnAgentDaemon`), which is what stops it being orphaned
# when a dev supervisor dies — but it also means the daemon does not receive a
# signal sent to this process's group. Tovu's own `reap()` handles that on a
# catchable SIGTERM. Run the container with an init process (`--init`, or
# `init: true` in compose, both set in the compose file here) so orphaned
# grandchildren are still reaped if it ever misses one.
#
# Worth knowing: in a compiled build the daemon is spawned as plain
# `node <path>` — the `npx -> tsx -> node` chain is dev-only, so this image
# does not need `tsx` present to keep the assistant alive.
CMD ["node", "dist/src/index.js"]
