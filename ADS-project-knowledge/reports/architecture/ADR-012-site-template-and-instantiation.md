# ADR-012: Site Template + Instantiation — Fork the Data, Share the Runtime

- Status: ACCEPTED
- Date: 2026-07-05
- Author: Claude Opus 4.8 / Leon Aburime

## Context

Product-owner question: "shouldn't I have a website package we fork for each new
site — complete with an admin and frontend — unzip a copy, let them interact with
it, and let them bundle it as a binary to run on their own?"

The instinct is right and half-answered already:

- **ADR-011** established the *"site is a folder"* contract — an install dir of
  `{config, SQLite, uploads, themes, plugins}` — and two topologies: standalone
  single binary (the WordPress mode) and open-design Electron desktop host
  (multi-site). It named "the fork/export story" but did not specify **how a new
  site comes into being** or **what gets copied when**.
- SQLite is present in the runtime (engine daemon: `better-sqlite3` 12.10.0), so a
  per-site `content.db` is viable today.

The open question this ADR closes: is a new site a **literal copy of everything**
(admin + frontend + runtime + deps), or something thinner? The naive full-copy
model has three real costs: every site duplicates the runtime (bloat); security
and bug fixes must be re-applied to every fork (patch fan-out); forks drift, making
support intractable.

## Decision

**Creating a site instantiates a versioned _site template_ into a standard
install-dir (ADR-011). The runtime is a shared, versioned dependency — never copied
per site at create time. A full self-contained copy happens once, at binary
export (ADR-011 standalone).**

Three parts:

### 1. What is shared vs per-site

- **Shared runtime (one copy, versioned):** the admin UI, the frontend renderer,
  the core engine/kernel. This is the same discipline as the Jini engine → product
  relationship, applied one level down: many site folders, one runtime.
- **Per-site package (the thing "forked" — small):** only the site's own state.
  ```
  <install-dir>/                     # ADR-011 "site is a folder"
    config.json                      # name, active theme id, domain, enabled plugins
    content.db                       # SQLite — pages/posts/media rows/users
    uploads/                         # assets
    themes/                          # selected + custom themes (ADR-010 declarative)
    plugins/                         # installed plugin artifacts (ADR-004)
    overrides/                       # site-specific custom pages/components
    .site-meta.json                  # template id + version, schema migration version
  ```

### 2. The template ("starter kit")

A **versioned skeleton install-dir**, not runtime code: default `config.json`,
schema **migrations**, a **seed `content.db`**, a default theme id, starter pages,
and an empty plugin manifest. Templates are addressable and upgradable
(`.site-meta.json` records `templateId` + `templateVersion` + `schemaVersion`).
Multiple templates later (blog, store, directory); v1 ships one.

### 3. Flows

- **Create** = copy the template's *data/config* into a new install-dir + run
  migrations to current schema. Fast, small, no runtime code copied. The shared
  runtime then serves that dir (`workspaceId`/site scoping per ADR-007).
- **Customize** = writes land in the site's `content.db` / `overrides/` /
  `themes/`, layered over the shared runtime. Never patch runtime code per site.
- **Export as binary** = `tovu build <site>` packages *runtime + that one site
  dir* into a standalone artifact — Node SEA single binary (tooling exists:
  `build:binary` via postject) or the open-design Electron host (ADR-011). This is
  the only place a full self-contained copy is produced, and it is on demand.

## Consequences

- Cheap creation, single-point runtime updates, real per-site isolation, and a
  genuine "download my site as an app you own" story — without per-fork patch
  fan-out or drift.
- **Implements ADR-011's "fork/export story":** create = instantiate template into
  the install-dir contract; export = ADR-011 standalone binary. The install-dir
  stays the portability contract between desktop-hosted and standalone modes.
- The **template format becomes a compatibility surface** — versioned, with
  migrations, so an old site upgrades to a newer runtime/schema rather than being
  frozen at its template version. Needs a migration runner keyed on
  `schemaVersion`.
- Respects existing ADRs: themes stay declarative data in `themes/` (ADR-010),
  plugins are prebuilt artifacts in `plugins/` running no DDL (ADR-003/004), and
  every row/event/cache key is `workspaceId`/site-scoped (ADR-007).
- **UI already fits:** Websites = list of site instances; "New website" =
  instantiate template; admin = edit one site's install-dir; Deploy / a future
  "Bundle" action = the binary export.
- Deferred: multi-template gallery, template marketplace, and the migration runner
  design (own ADR when built).

## Rejected alternative

**Full copy per site** (admin + frontend + runtime zipped and unpacked on every
create). Rejected: runtime duplication (bloat), security/bug-fix fan-out across all
forks, and drift. Full-copy is correct **only at export time**, when the user
explicitly wants a standalone, frozen artifact.
