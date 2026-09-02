# START HERE — Tovu (website product)

Cold-start entry point. If you were just dropped into this repo, read this first.

## What this repo is

**Tovu = the website product** — the WordPress-like CMS runtime: the deployed
site visitors see **plus** its per-site admin and content model. It is **not** the
desktop host (that's the sibling **`Tovu-Runner`** repo, which owns multi-site
management, media/video generation, agent detection, and the operator chat). The
dependency arrow only ever points **Runner → Tovu, never reverse** (ADR-011).

**Status: active, existing codebase.** The v1 first slice below has shipped and
grown well past it — `apps/website`, `apps/admin`, `apps/site-chat`, and
`packages/sdk` exist with a full git history (2,388+ commits as of 2026-09-02) and
an active feature branch. Docs + the ADR corpus are here too, but treat this file
as a record of *original intent* (the v1 slice, build order, and stack defaults
below are still accurate as design decisions) — do not treat it as a from-scratch
build entry point, and do not conclude there is nothing to port or preserve.

## Read first (in order)

1. **`development/tovu-v2-design.md`** — the reconciled v1 blueprint. The "Where they disagree,
   and the call" section *is* the scope: it's already made the hard calls (split
   into 4–6 workspaces, payments is a plugin, SQLite-first via Payload's shape,
   Zod at boundaries, Claude's architecture doc is canonical).
2. **`ADS-memory/docs/architecture/READING-ORDER.md`** → the 10-minute orientation path into
   `ADS-memory/docs/architecture/tovu-architecture.md` (target architecture, treat as
   aspirational not built).
3. **`ADS-memory/reports/architecture/ADR-INDEX.md`** — 57+ entries (through
   ADR-062 as of 2026-09-02; check the index for the current count). Non-negotiable
   for v1: **001** (agent-native modular monolith),
   **002** (React blessed renderer), **006** (a port needs two adapters), **007**
   (`workspaceId` on everything), **010** (declarative themes by default), **011**
   (two topologies), **012** (site = folder instantiated from a template),
   **013/014** (assistant: one engine, N profiles, layered manifest).
4. **`development/todos.md`** — the full product backlog (see "Backlog" below).

## The v1 first slice (proposed — confirm or cut before building)

The smallest thing that is recognizably *a Tovu website*: the **standalone
single-binary happy path** — ADR-011 topology 1 wired end-to-end with ADR-012's
create→serve flow. A walking skeleton, not a layer:

1. **Site-as-folder** — instantiate a versioned template into an install-dir
   (`config.json` + `content.db` + `uploads/` + `themes/`). ADR-012 create flow.
2. **Content model** — `post` + `page` in the per-site `content.db` behind a
   `SiteStorePort` (better-sqlite3 adapter), `workspaceId`-scoped (ADR-007).
3. **Renderer** — minimal React render of a page/post through **one declarative
   theme** (ADR-002 + ADR-010).
4. **Admin** — a minimal auth boundary + one "edit this post" screen.
5. **Serve** — the `tovu` binary boots the install-dir and serves site + admin.

**Explicitly cut from v1** (present in `development/todos.md`, gated behind the skeleton):
plugin runtime, commerce, AEO/GEO plugins, search, membership, multi-template
gallery, and the assistant itself. The assistant lands *after* the skeleton rolls.

**Why this slice:** it proves ADR-011 topology 1 + ADR-012 end-to-end — "create a
site, edit content, see it rendered, run it as one binary you own" — which every
other capability hangs off. It's the skateboard that actually rolls.

## Build order

Maps onto `development/todos.md` sections:
**§1 Kernel** (DI/ports/config) → **§3 Data Layer** (`SiteStorePort` +
better-sqlite3, migrations) → **§7 Feature Modules** (post/page only) →
**§8 Theme** (one declarative theme + the renderer) → **§11 Admin** (minimal) →
**§10 Server** (keep the Express baseline) → **binary export** (ADR-012 `tovu
build`). *Then* unlock plugins (§9), the assistant (§12 → ADR-013/014), commerce,
and the AEO/GEO plugin suite.

## Scaffold / stack decisions (proposed defaults)

- **Language/shape:** TypeScript, ESM, strict. Modular monolith with ports/adapters;
  **core never imports adapters** — enforce with **dependency-cruiser** as a
  CI-failing rule (`development/todos.md` §24).
- **Data:** `better-sqlite3` per-site `content.db` behind `SiteStorePort`; the
  rule-of-two second adapter (ADR-006) is Supabase/Postgres later. **Zod** at every
  boundary (single source of truth for types over SQLite JSON-text).
- **Renderer:** React (ADR-002).
- **Server:** Express baseline (`development/todos.md` §10), transport-agnostic handler shape.
- **Workspace layout:** start with **4–6 packages, not 20** (v2-design call):
  `core/`, `features/`, `server/`, `themes/`, `admin/`, `sdk/`. Split further only
  when a module gains a second consumer or its own release cadence.
- **Method:** spec-first / test-first (`tovu-architecture.md` §14); a contract test
  per core port (ADR-006).

> **Don't rebuild what exists.** Tovu-Runner's `web/src` already contains
> server + content-model code written to these ADRs (`core/ports.ts`,
> `server/app.ts`, `features/post|presentation|workspace`, in-memory repos, and the
> planned `SiteStorePort`). **Evaluate porting that here** rather than starting the
> runtime from scratch — it was built for this product before the repos split.

## What is NOT in this repo (it's in Tovu-Runner)

Desktop host, multi-site manager, media/video generation, agent detection, the
**operator** chat profile, the rail-page operator shell. The assistant *engine* is
shared (ADR-013/014): Tovu ships the **consumer** + **admin** profiles; Runner
ships **operator**.

## Housekeeping — done since this was written

- `AGENTS.md` / `CLAUDE.md` are tailored to Tovu (done; no Runner-terms leftover).
- Git is initialized and active (done; see repo history above).

## Housekeeping still to do

- `docs/design/admin-sections-ui-brief.md` (the per-site admin UI brief) was still in
  Runner as of this writing; it's really a Tovu doc and can be pulled over if it
  hasn't been already — verify before acting on this line.
