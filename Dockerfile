# syntax=docker/dockerfile:1.7
#
# Tovu — self-hosted container image.
#
# Build from the Tovu checkout itself:
#
#     docker build -t tovu:local .
#
# The build context is this repo's own root. `@jini-ai/*` packages are consumed from the npm
# registry (see `package.json` / `apps/admin/package.json` / `apps/site-chat/package.json`) —
# there is no sibling `Jini` checkout to stage in, and no separate build stage for it.
#
# Requires BuildKit (default in Docker 23+).
#
# ============================================================================
# Paths inside the image
# ============================================================================
#
# The checkout lands at `/workspace/Tovu` in both the build and runtime stages — kept as its
# own directory (rather than e.g. `/workspace`) so the rest of this file's paths, and the
# volume/mount paths in `fly.toml` and `docker-compose.yml`, didn't all need to move in lockstep
# with this rewrite.

ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# Stage 1 — install and build.
# ---------------------------------------------------------------------------
# On the full `bookworm` image, not `-slim`: the three native modules
# (better-sqlite3, argon2, sharp) need a working toolchain — python3, make, g++
# — which `-slim` does not carry. Bookworm here and bookworm-slim at runtime
# share a glibc, so binaries compiled in this stage load in that one.
FROM node:${NODE_VERSION}-bookworm AS build

WORKDIR /workspace/Tovu

# The whole repo in one layer. Splitting manifests out for finer cache granularity buys little
# here: `apps/admin` and `apps/site-chat` have their own installs below regardless.
COPY . .

# NODE_ENV is deliberately NOT set to production anywhere in this stage:
# typescript, vite and the rest of the build chain are devDependencies, and
# `npm install` under NODE_ENV=production would skip all of them.
RUN npm install

# The two browser apps build to static assets served by the Node process. They
# have their own `node_modules`.
RUN npm --prefix apps/admin install && npm --prefix apps/admin run build
RUN npm --prefix apps/site-chat install && npm --prefix apps/site-chat run build

# `packages/sdk` is a real npm workspace (root `npm install` above already linked and installed
# its deps), but its own `dist/` is gitignored like every other build output, so it never reaches
# this image already-built the way `apps/admin`/`apps/site-chat` bring their own `dist` in via
# their install+build lines above. `apps/website/src` imports `@tovu/sdk` as a real (non-type-only)
# module in several places, so without this the `npm run build` step below fails module resolution
# with `Cannot find module '@tovu/sdk'`.
RUN npm run build --workspace=packages/sdk

# `emit-dist-package-json.mjs` (part of `npm run build` below) records the building commit's SHA
# in `dist/runtime-manifest.json` for provenance (ADR-020 5). It normally reads that from `git
# rev-parse HEAD`, but this stage's `.git` is excluded by `Dockerfile.dockerignore`, so there is no
# repo to ask. `fly-deploy.yml` passes the real commit through as this build arg.
ARG TOVU_BUILD_SHA
ENV TOVU_BUILD_SHA=${TOVU_BUILD_SHA}

# `tsc` plus the asset copies. Stock DATA (templates, themes, agent-plugins, public) is copied
# from `content/` to `dist/content/`; drizzle migrations stay under `dist/src/db/`. Each copy
# `rm -rf`s its own target first, so a file deleted from source cannot survive into the image.
RUN npm run build

# Ships each site's stock content seed (`npm run seed:site`, development/scripts/seed-site.mjs — a
# pruned, VACUUMed `sites/<site>/content.seed.db`, tracked in git) as STOCK DATA under `content/`,
# alongside `content/themes` above, for the identical reason: it must live OUTSIDE `sites/` to
# survive `fly.toml`'s volume mount over `/workspace/Tovu/sites`, which shadows the image's ENTIRE
# `sites/` tree at runtime — anything left there for a fresh volume to read would be invisible the
# moment the mount takes effect. `hydrate-content-db-from-seed.ts`'s `hydrateContentDbFromSeed()`
# (wired into `server/deps.ts`'s `createSqliteRouteDeps()`) copies this back INTO the mounted
# `<site>/content.db` on that one site's first boot only — see its own header for why a later boot
# must never repeat that copy: content.db is live production data by then. Looped rather than a
# single explicit COPY: correct for however many sites happen to have a committed seed (today, just
# tovu-com) with no name to update here as sites are added or removed; a no-op when none exist yet.
#
# The `uploads/` copy alongside it (2026-09-02) closes a real production incident: `content.seed.db`
# ships `media`/`asset_blobs` ROWS (neither table is pruned by `seed-site.mjs`), but until this line
# existed nothing shipped the BYTES those rows' `storage_key`s point at — real rows, zero files,
# every admin media preview 500ing. Same "must live outside `sites/`" reasoning as the seed db
# above; `hydrate-blob-store-from-seed.ts`'s `hydrateBlobStoreFromSeed()` (also wired into
# `createSqliteRouteDeps()`) is the boot-time consumer, gated per-blob rather than per-directory —
# see that function's own header for why. `[ -d ... ]` guarded, not unconditional: a site can have a
# committed `content.seed.db` with no blobs at all (no media uploaded yet), and `cp -R` on a missing
# source directory would fail the build.
RUN for seed in sites/*/content.seed.db; do \
      [ -f "$seed" ] || continue; \
      site="$(basename "$(dirname "$seed")")"; \
      mkdir -p "dist/content/seed-sites/$site"; \
      cp "$seed" "dist/content/seed-sites/$site/content.seed.db"; \
      if [ -d "sites/$site/uploads" ]; then \
        cp -R "sites/$site/uploads" "dist/content/seed-sites/$site/uploads"; \
      fi; \
    done

# Belt and braces. `Dockerfile.dockerignore` already excludes `Tovu/sites` (renamed `sites` —
# see that file), but that directory holds every developer site's real `content.db`, WAL
# sidecars, uploads and edited themes — baking it into a published image would ship their data
# to whoever pulls it. Removing it here means a dockerignore edit cannot quietly reintroduce it.
# The one file this stage still needed from `sites/` — each site's `content.seed.db` — was already
# extracted to `dist/content/seed-sites/` immediately above, so this wipe cannot lose it.
RUN rm -rf sites

# ---------------------------------------------------------------------------
# Stage 2 — runtime.
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
# This is the single largest thing in this image after node_modules, and it
# exists for exactly one capability: observing what a published page actually
# renders (cookies before consent, rendered accessibility structure, policy-page
# reachability) — facts no configuration snapshot can establish. That tradeoff
# was argued explicitly rather than assumed; see
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

COPY --from=build /workspace/Tovu /workspace/Tovu

WORKDIR /workspace/Tovu

# `apps/website/src/server/runtime/composition/app.ts` resolves these two from `import.meta.dirname`
# when unset, and the compiled layout puts that at `dist/src/server/runtime/composition`, whose
# relative fallback does NOT land on the actual admin/site-chat build output. Setting them
# explicitly sidesteps that entirely rather than relying on a path that happens to work in one
# tree layout and not another.
#
# TOVU_DISABLE_DEV_TLS: `COPY . .` above has no .dockerignore, so a developer's local `.certs/`
# (mkcert, localhost-only) can ride into the image. `index.ts` finds the checkout's `.certs/` by
# walking up (`resolveCheckoutRoot`), so without this the container would terminate TLS itself with
# those dev certs. The platform proxy (Fly) terminates TLS and forwards plain HTTP to this port.
ENV TOVU_ADMIN_DIST=/workspace/Tovu/apps/admin/dist \
    TOVU_SITE_CHAT_DIST=/workspace/Tovu/apps/site-chat/dist \
    TOVU_DISABLE_DEV_TLS=1 \
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
