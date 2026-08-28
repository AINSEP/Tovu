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

# `tsc` plus the asset copies. Stock DATA (templates, themes, agent-plugins, public) is copied
# from `content/` to `dist/content/`; drizzle migrations stay under `dist/src/db/`. Each copy
# `rm -rf`s its own target first, so a file deleted from source cannot survive into the image.
RUN npm run build

# Belt and braces. `Dockerfile.dockerignore` already excludes `Tovu/sites`, but
# that directory holds every developer site's real `content.db`, WAL sidecars,
# uploads and edited themes — baking it into a published image would ship their
# data to whoever pulls it. Removing it here means a dockerignore edit cannot
# quietly reintroduce that.
RUN rm -rf sites

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

# ---------------------------------------------------------------------------
# Headless Chromium — for `site_collect_page_evidence` only.
# ---------------------------------------------------------------------------
# `playwright` is a real runtime dependency (package.json), but `npm install`
# only installs the DRIVER. The browser binary is a separate ~150MB download
# plus its shared libraries, and `-slim` carries almost none of them, which is
# why this needs both `--with-deps` and its own layer.
#
# This is the single largest thing in this image after the two node_modules
# trees, and it exists for exactly one capability: observing what a published
# page actually renders (cookies before consent, rendered accessibility
# structure, policy-page reachability) — facts no configuration snapshot can
# establish. That tradeoff was argued explicitly rather than assumed; see
# `ADS-memory/reports/swarm-consensus/runs/2026-08-26T005706Z-consensus-report.md`,
# Q2-b, where it was the one genuinely unresolved point.
#
# HOW TO BUILD WITHOUT IT. Pass `--build-arg TOVU_INSTALL_BROWSER=0`. The image
# is several hundred MB smaller and everything else works unchanged:
# `openPlaywrightSiteEvidenceBrowser()` fails to launch, reports
# `{ available: false, reason }`, and the tool returns every requested page under
# `skipped` with that reason — which the `site-compliance` skill's output
# contract requires it to report as "cannot determine", not as a pass. Degraded,
# honest, and never silent.
#
# `PLAYWRIGHT_BROWSERS_PATH` is set to a world-readable location because the
# browser is installed as root here and the process runs as `node` (see USER
# below); the default per-user cache under /root would be unreadable to it.
ARG TOVU_INSTALL_BROWSER=1
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN if [ "$TOVU_INSTALL_BROWSER" = "1" ]; then \
      npx --yes playwright@1.61.1 install --with-deps chromium \
      && chmod -R a+rX /opt/playwright-browsers; \
    else \
      echo "TOVU_INSTALL_BROWSER=0 — skipping Chromium; site_collect_page_evidence will report 'browser unavailable'."; \
    fi

# Both trees together, from the same stage, so every relative symlink created
# by `npm install` still resolves. This is the single biggest contributor to
# image size and the most obvious thing to optimise later — but correctness
# first: a smaller image that cannot resolve `@jini-ai/core` is worth nothing.
COPY --from=build /workspace /workspace

WORKDIR /workspace/Tovu

# `apps/website/src/server/app.ts` resolves these two from `__dirname` when unset, and the
# compiled layout puts `__dirname` at `dist/src/server`, which makes the
# relative fallback land at `dist/apps/admin/dist` — not where the admin build
# actually is. Setting them explicitly sidesteps that entirely rather than
# relying on a path that happens to work in the source tree and not the built
# one.
ENV TOVU_ADMIN_DIST=/workspace/Tovu/apps/admin/dist \
    TOVU_SITE_CHAT_DIST=/workspace/Tovu/apps/site-chat/dist \
    PORT=3000 \
    JINI_AGENT_DAEMON_PORT=4319

# `sites/` is runtime state, never image content: each site's `content.db` and
# WAL sidecars, `uploads/`, `themes/`, and ops state. Every one of those paths
# derives from `site-dir/site-root.ts`'s `resolveSiteRoot()`, which is relative
# to the working directory unless `TOVU_SITE_DIR` overrides it — so the volume
# mounts here. A missing or unwritable site dir fails boot with SQLITE_CANTOPEN.
#
# Serving a site other than the default: set `TOVU_SITE=<name>` to pick another
# folder under this volume, or `TOVU_SITE_DIR=/abs/path` to leave it entirely.
RUN mkdir -p sites && chown -R node:node /workspace/Tovu/sites
VOLUME ["/workspace/Tovu/sites"]

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
# (`apps/website/src/index.ts`, `spawnAgentDaemon`), which is what stops it being orphaned
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
