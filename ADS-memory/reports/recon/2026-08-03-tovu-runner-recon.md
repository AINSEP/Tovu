# Recon: Rebuilding Tovu-Runner as a Desktop App

**Date:** 2026-08-03
**Agent:** codebase-analyzer (dispatched, recon-only, no source modified)
**Skills loaded:** confirmed `AI-Dev-Shop/agents/codebase-analyzer/skills.md` before starting work.

**Status: COMPLETE.**

---

## Verdict (busy-reader summary)

A "project" in Tovu-Runner is a **separate OS process** — one install dir, one port, one `tovu serve` child — not a workspace row in a shared process (High confidence, verified in code). Nothing in the existing `/Users/la/Programming/Tovu-Runner` repo is fit to build on: it is the literal, frozen-mid-rename ancestor of today's Tovu (ADR-014 says so directly — "rename already begun: Tovu → Tovu-Runner"), its git history stops at CMS-competitor research (April 2026), and 389 files of never-committed working-tree changes show a second, later attempt that also stalled (July 2026) with a purely static UI mock and zero backend wiring. **Start over**, but not from zero context: Tovu's own ADR/SPEC corpus already names Tovu-Runner and has made real, binding decisions about it (ADR-011/012/014/021, SPEC-006), and Jini now has packages — `desktop-host`, `sidecar`'s port-allocation and daemon-registry, `platform`'s process/HTTP primitives — that look purpose-built for exactly this fleet-supervisor role and are sitting mostly unused. The admin HTTP API, authenticated per-project via an `api_key` principal, is the designed and correct control plane for editing (ADR-021/SPEC-006 name Runner as the reason it exists) — not the CLI (which has no content-editing commands) and not direct DB access. The one finding that most needs your input before any build starts: ADR-011 assigned the "multi-site desktop host" role to *reusing open-design's own Electron app directly*, but later documents (ADR-014, SPEC-006, and Jini's deliberately de-branded `desktop-host` extraction) read more like "Runner is its own separate app" — I could not find anything reconciling these, and picking wrong here changes the whole shape of the build (see Open Question 1).

---

## Method note

File counts (excluding node_modules/.git/AI-Dev-Shop/ADS-memory scaffolding):
- Tovu real source: ~5,689 files (`/Users/la/Programming/Tovu/src` already indexed in Codebase Memory MCP as `Users-la-Programming-Tovu-src`, 12,524 nodes, status `ready`)
- Jini packages source: ~2,667 files (indexed as `Users-la-Programming-Jini-packages`, 17,475 nodes, status `ready`)
- Tovu-Runner real source (ts/tsx/js/vue, excluding AI-Dev-Shop/ADS-project-knowledge/node_modules/dist): ~278 files — not indexed; small enough for direct exploration.

Used a mix of existing Codebase Memory MCP indexes (for Tovu and Jini architecture orientation) and direct `rg`/file reads (primary evidence, especially for Tovu-Runner and for every load-bearing claim). Every claim below is tagged with `file:line` where verified directly; anything not directly verified is marked "unverified."

---

## The Central Question

**Answer: a "project" in Tovu-Runner is a separate OS process — one install dir (folder) = one `tovu serve` child process = one port = exactly one workspace served for that process's whole lifetime. It is not a workspace row inside one shared Tovu process. Confidence: High** (directly verified in source, not inferred).

### Evidence chain

1. **One install dir = one process, one port, one content.db.** `tovu init <dir>` creates a self-contained folder: `config.json`, `content.db`, `uploads/`, `themes/`, `plugins/`, `overrides/`, `.site-meta.json` (`ADS-memory/specs/003-site-install-dir/feature.spec.md` REQ-01/REQ-03). `tovu serve <dir>` boots exactly that folder and binds one HTTP listener on one port (`src/cli/commands/serve.ts:79-118` — `port = resolveServePort(...)`, `app.listen(port)`). Port precedence is `--port` flag > `config.json.port` > `PORT` env > `3000` (`src/cli/commands/serve.ts:47-53`, confirms REQ-07). There is no multi-port, multi-dir mode inside one `tovu serve` invocation.

2. **The content.db CAN hold >1 workspace row, but one `tovu serve` process only ever serves ONE of them, chosen at boot.** `src/site-dir/resolve-workspace.ts:50-77` (`resolveWorkspace`) selects a single `WorkspaceRecord` at boot time: an explicit `--workspace <id>` if given, else the oldest row by `createdAt`. This resolved `workspaceId` is baked once into `deps` (`src/server/deps.ts:224` — `const workspaceId = overrides?.workspaceId ?? resolveWorkspace({ db }).id;`) and threaded into every route registration for the rest of that process's life (`src/server/app.ts`, `src/server/deps.ts` — dozens of call sites). Every route then defensively checks `req.params.workspaceId !== deps.workspaceId` and rejects mismatches (grep across `src/server/routes/**`, e.g. `src/server/routes/admin/pages/list.ts:15`, `src/server/routes/members/sign-in.ts:33`, 35+ more matches) — this is single-tenant-per-process request handling, not per-request tenant routing. `src/server/app.ts:796` makes the same point explicitly in a comment: `resolveWorkspaceForHost: async () => routeDeps.workspaceId, // single-workspace v1`.

3. **The >1-workspace-row capability is a deliberate, separate multi-tenancy primitive, not the mechanism for Runner's multi-project management.** ADR-007 (`ADS-memory/reports/architecture/ADR-007-structural-workspace-scoping.md:9-11`): "Tovu is multisite-native: workspaces are the tenancy primitive (WordPress multisite as a first-class concept, **plus the desktop multi-install manager later**)." SPEC-003's amendment (`ADS-memory/specs/003-site-install-dir/feature.spec.md`, "Amendment v1.1.0") states plainly that a >1-row `content.db` is not corruption — SPEC-044's admin `CREATE_WORKSPACE` route (`src/server/routes/admin/workspace/create.ts`, wired in `src/server/modules/workspace.ts`) can grow a second workspace row through ordinary, permission-gated admin use — but `tovu serve` still only ever activates one at a time. So today, "one content.db, many workspace rows" is a WordPress-multisite-style feature for **one running site to host more than one logical tenant it could switch between**, not a mechanism a supervisor would use to run N *independent* Runner projects concurrently from one process.

4. **This matches ADR-011/012's explicit topology, written for exactly this scenario.** ADR-011 (`ADS-memory/reports/architecture/ADR-011-deployment-topologies-open-design-host.md:36-43`): in the desktop-hosted topology, "users fork/create as many sites as they want; each site is a standard Tovu install dir... **The host embeds or spawns Tovu server instances per site**." ADR-012 (`ADS-memory/reports/architecture/ADR-012-site-template-and-instantiation.md:63-73`): "Create = copy the template's data/config into a new install-dir... The shared runtime then serves that dir" — one runtime binary, N install dirs, N server instances, not N workspaces inside one instance.

### Why this isn't a hybrid in practice (today)

A hybrid reading — "Runner points many of its 'projects' at workspace rows inside a small number of shared long-lived `tovu serve` processes, to save process/port overhead" — is technically *possible* given the schema (nothing stops >1 workspace row per db), but it is not what the code supports as a *serving* model: you cannot address two workspaces in the same content.db concurrently through one running process; you would have to restart that process with a different `--workspace` id to switch, defeating the point of running multiple projects live at once. Treat "one project = one process" as the real answer; the multi-workspace-per-db feature is orthogonal (WordPress-multisite-style tenant switching within a single deployment) and not currently exploitable for Runner's use case.

### What this requires of Runner (see also Part C)

Runner spawning N `tovu serve <dir>` processes needs, and does not get for free from Tovu: port allocation across N instances (Tovu's own default/precedence only resolves *one* port per invocation — nothing centrally tracks which ports are taken across sibling processes), per-process lifecycle/health/log management, and its own bookkeeping of "which install dir did I create for project X" (Tovu has no registry of install dirs anywhere — see Part C/E).

---

## A. Existing Tovu-Runner Assessment

**Verdict: start over.** Nothing in `/Users/la/Programming/Tovu-Runner` is fit to build the supervisor role on. The repo is not just outdated — it is the *literal abandoned ancestor* of what is now the mature `/Users/la/Programming/Tovu` codebase, frozen mid-rename, with 389 files of never-committed changes sitting in the working tree on top of a git history that stops at CMS-competitor research.

### The repo's real identity (this reframes everything)

`ADS-memory/reports/architecture/ADR-014-assistant-profiles-layered-capability-manifest.md:13-14` states directly: *"The codebase is separating into two repos (rename already begun: `Tovu` → `Tovu-Runner`)."* This matches the evidence exactly:
- `web/package.json:2` — `"name": "tovu"` (not `"tovu-runner"`).
- `web/PROJECT_MEMORY.md:44-48` — "Current implemented vertical slice: Feature: workspace creation... Sync path: validation + uniqueness check + repository insert... Async path: enqueue outbox event `workspace.created`" — this is the *same feature slice* as the real Tovu's `src/features/workspace/__specs__/create-workspace.spec.md` (read above), just an earlier, cruder, in-memory-only version (no Drizzle, no SQLite until the 2026-07-06 handoff, which notes `better-sqlite3` was "NOT installed yet").
- So: this repo *was* Tovu, until the product split into "Tovu the single-site product" (which got a fresh, disciplined ADR/SPEC-driven rebuild at `/Users/la/Programming/Tovu`) and "Tovu-Runner the desktop host" (which kept this repo's name and remaining scope, but development stopped here).

### Git history vs. working tree — two different stale states

- **Committed history** (`git log`, 6 commits, HEAD `fdaf214`, last commit **2026-04-22**): exactly what the dispatch brief predicted — WordPress/Shopify/Medusa research scaffolding (`wordpress_specs/` 53 files, Shopify/Medusa decomposition docs, competitor analysis).
- **Uncommitted working tree** (`git status --porcelain`: 320 deletions, 65 new/untracked, 4 modified — verified by direct count, never committed): a *later*, abandoned attempt, dated by `docs/handoffs/2026-07-06.md` (also uncommitted) to **2026-07-06** — the same week ADR-014 was written. It was deleting the old WordPress-parity `docs/architecture/appendices/*` doc set (26+ files) and adding the beginnings of an "operator shell": `web/src/websites/Websites.tsx`, `web/src/admin-shell/`, `docs/design/rail-pages-ui-brief.md`, `docs/design/admin-sections-ui-brief.md`, plus a root `scripts/dev.sh`.
- The 2026-07-06 handoff itself says work was blocked ("CopilotKit chat input is gated on Leon refactoring `ChatComposer.tsx`") and lists `better-sqlite3`/CopilotKit as "NOT installed yet." Nothing past this point was committed or (as far as file mtimes show) touched again. Meanwhile the real Tovu repo went on to ADR-015 (Drizzle, adopted 2026-07-06 — the very same day) through ADR-051, SPEC-driven development, and a full test suite. **The two repos diverged at this exact moment, and only one side kept going.**

### What's actually salvageable, verified by direct inspection

- **`web/src/websites/Websites.tsx`** (ADR-014's "current `web/src` operator shell... Websites, the FAB" reference) — read in full. It is a **static UI mock**: `SITES` is a hardcoded array in `data.ts`; the component's own comment says "adapted from screen-5-projects" (an open-design reference screen); `+ New website` calls `goHome()` and `Open backend →` calls `openAdmin(s.id)` — both are pure client-side nav-state changes with **no API call, no process spawn, no port logic anywhere**. Verdict: **design-reference only** (the IA — tabs for All/Running/Deployed/Drafts, a site-card grid — is a reasonable sketch), not usable code.
- **`web/apps/desktop/`** — a 3-file Electron stub (`main.cjs` 61 lines, `package.json` name `"tovu-desktop"`, its own `dev.sh`). Boots one embedded Express bundle, opens one `BrowserWindow` pointed at one admin URL. No multi-instance awareness at all. Superseded by Jini's now-mature `@jini-ai/desktop-host` (didn't exist when this was written). Verdict: **delete**.
- **Root `scripts/dev.sh`** — symlinks Tovu's `web/src` directly into an external "engine" checkout's `apps/web/src` (hardcoded default path `~/Desktop/Programming/OSS-Repos/Jini` — stale even for this machine; the real paths today are `/Users/la/Programming/Jini` and `/Users/la/Programming/OSS-Repos/open-design`), replacing that engine's own UI outright and running its daemon on port 7456. This is a **tighter, cruder coupling than ADR-011 ultimately chose** (ADR-011: HTTP-API boundary only, "Tovu never imports open-design source" — the opposite of symlinking sources together). Verdict: **do not repeat this pattern**.
- **`wordpress_specs/`, Shopify/Medusa/competitor-analysis docs** — real research effort (53 WP spec files, full Shopify/Medusa decomposition). Verdict: **reference-only**; largely redundant with the already-indexed Codebase Memory MCP projects for the same OSS repos (`Users-la-Programming-OSS-Repos-{wordpress,medusa,strapi,directus,payload,ghost}`, all `status: ready`).
- **`tmp/external-audit-dispatch/`** (15 dated packets, all 2026-03-25) — superseded process artifacts. Verdict: **delete**.
- **`.playwright-mcp/`** (dated 2026-04-23) — dev debugging snapshots. Verdict: **delete**.
- **`todos.md`** (35KB, last touched 2026-07-05) — the "Master Build Inventory" is a generic CMS parity checklist (WordPress/Payload/Directus/Ghost feature parity, AEO/GEO speculation) written before the product split and before most of Tovu's now-accepted ADRs existed. Verdict: **reference-only, low priority** — most of its structural decisions (ports/adapters, outbox, workspace scoping) are already superseded by real ADRs in the Tovu repo; re-reading it before starting Runner work risks reintroducing already-settled debates.

### What to actually carry forward

Not code — **decisions**. The Tovu repo's own ADR corpus already names "Tovu-Runner" as a first-class concept and has made several binding calls about it (ADR-011, ADR-012, ADR-014, ADR-021, SPEC-006's OQ-05) — see Parts C/D/E. Those documents, not this repository's code, are the real inheritance.

---

## B. Jini Reuse Map

Method: read every package's `package.json` description and top-level `src/index.ts` barrel exports; read deeper (source files, not just exports) for the five packages the brief specifically named — `desktop-host`, `sidecar`, `daemon`, `cli`, `platform` — plus `@jini-ai/desktop-host`'s `source-map.md` provenance doc. The rest are one level shallower (description + exports only); treat those judgments as informed hypotheses, not verified integration plans.

### The five named packages, assessed in depth

**`@jini-ai/desktop-host`** (v0.1.2) — "Shell-agnostic desktop-host ports: single-instance lock, window lifecycle, protocol handling, sidecar launch, paths, and config. Electron and Tauri assemblies live behind `./electron` and `./tauri`." Six ports: `singleInstance`, `windowLifecycle`, `protocolHandler`, `sidecarLauncher`, `renderService`, `shell`, plus the `window.__jini__` renderer-side host bridge, file logging, and Windows uninstall-registry sync. **No dependency on `electron` or `@tauri-apps/api`** — both assemblies take native surfaces as injected structural types, so the whole package installs/typechecks/tests without either framework present.
- **Electron assembly: complete.** All 6 ports implemented (`create-electron-desktop-host.ts` + 6 port files), each with tests, plus fakes for every injected surface (`electron/testing.ts`).
- **Tauri assembly: a real but narrow, explicitly partial spike.** Single-instance, window-lifecycle/URL-load, sidecar launch/discovery/shutdown, and open-path/open-external are implemented against structural Tauri types (no real `@tauri-apps/*` dependency). `RenderService` and `ProtocolHandlerPort` both **throw `NotImplementedError`** by design (`tauri-render-service.ts`, `tauri-protocol.ts`) — Tauri has no JS-reachable equivalent of Electron's `webContents.printToPDF`/custom-scheme registration; a real implementation needs Rust-side work not attempted here.
- **Verdict: Electron is the materially more complete assembly today.** If Runner needs custom protocol handling (a `tovu://` scheme, say) or the render-service's PDF/PNG export, Tauri is not currently viable without new Rust work; Electron is a drop-in.
- **Provenance is directly relevant to the central question and to Q1 below:** `source-map.md:3-4` — *"Built ahead of `extraction-plan.md` §3's stated deferral (`# deferred until a 2nd host exists`) per an explicit human decision, not because a second host consumer is confirmed yet."* Every port was de-branded from open-design's own `apps/packaged/`, `apps/desktop/`, and `packages/host/` source (full per-file provenance table in `source-map.md`), with OD-specific business logic (the updater, deck-capture/pdf-export, telemetry, branding) explicitly excluded. This package exists specifically so a *second, different* desktop product (i.e., Tovu-Runner) doesn't have to re-derive shell mechanics from scratch or depend on open-design's actual product code — see Open Question 1.

**`@jini-ai/sidecar`** — "Sidecar process runtime: JSON-IPC server and client, IPC path validation, namespace/runtime path resolution, port allocation, launch bootstrap, and a local daemon registry." Concretely: `allocatePort` (**port allocation already exists**), `bootstrapSidecarRuntime`/`createSidecarLaunchEnv` (launch bootstrap), `createJsonIpcServer`/`requestJsonIpc`, and — added 2026-07-21 — `daemon-registry.ts`: a `dataDir`-scoped **pointer file** recording a running daemon's `url`/`host`/`port`/`pid`, plus `readLiveDaemonRegistryRecord` (liveness-checked via `isProcessAlive`) and `removeDaemonRegistryRecordIfCurrent`.
- **This is the single closest existing primitive to what Runner needs for tracking N running Tovu instances.** Today it is scoped to **one record per dataDir** (one pointer file = one daemon) — generalizing it to N keyed records (one per Tovu project / install dir) is a small, well-understood extension of an existing, tested pattern, not a new mechanism to invent.
- Flagging per the brief's ask: this looks like infrastructure built for a different immediate purpose (a daemon locating its own one sidecar) that happens to be exactly shaped for Runner's fleet-tracking problem, and is not used that way anywhere today.

**`@jini-ai/platform`** — "Generic OS/platform primitives." The relevant modules: `process.ts` (spawn, process stamps/snapshots, stop-escalation, `isProcessAlive`, `matchesStampedProcess`, `collectProcessTreePids`), `http.ts` (HTTP readiness polling — exactly what's needed to confirm a freshly spawned `tovu serve` child is actually listening before treating it as up), `fs.ts` (containment, atomic copy/removal, **log tails**), `download.ts` (managed download engine with resume/checksum/lock — relevant if Runner ever needs to fetch/update the bundled Tovu runtime binary itself), `sandbox-env.ts`, `shell.ts`, `toolchain.ts`, `blob-storage.ts`.
- **Verdict:** Runner's process-supervision layer (spawn, wait-for-ready, monitor, stop) is largely *composable* from existing, tested primitives here rather than something to write from scratch — but nothing wires `process.ts` + `http.ts` + `sidecar`'s `allocatePort`/daemon-registry together into one "supervise a fleet of child HTTP servers" helper. That composition is a gap (see Part E).

**`@jini-ai/daemon`** — "The stateful agent daemon runtime: run lifecycle, durable event-log port, the tool-execution boundary, agent executor, terminal sessions, and routines." `RunLifecycle`, `EventLog` port, `ToolExecutor`, `AgentExecutor`, a `RoutineService` scheduler (DST-safe wall-clock schedule math, race-safe scheduled-slot persistence — a candidate for periodic fleet-wide health checks/backups across N Tovu instances, if Runner's own backend is built on this package), and an interactive terminal-session manager (node-pty backed).
- **Verdict:** this is Jini's own agent/daemon kernel — relevant to Runner only as the foundation *Runner's own backend* could be built on (if Runner is itself a Jini-daemon-based app), not as anything that knows about or manages Tovu processes directly. Useful for Runner's "operator" chat/agent surface (ADR-014) once that's built.

**`@jini-ai/cli`** — "CLI transport shell for driving a Jini daemon over HTTP: flag parsing, daemon-URL resolution, local daemon discovery, and a pluggable command registry." Its own module doc is explicit: *"a first generic slice, not the full `@jini-ai/cli` package — no pack has registered against `CommandRegistry` yet because no HTTP-client-mode pack exists in this repo to call."*
- **Verdict:** shape-compatible with "a CLI that drives a remote HTTP service," but it is built specifically to drive *a Jini daemon* (its own wire protocol), not a generic subprocess or an arbitrary HTTP admin API like Tovu's. Not a drop-in for "the tool Runner uses to talk to N `tovu` processes" — would need generalizing or a parallel client built alongside it, following the same pattern.

### Other plausibly relevant packages (description + exports only — not deeply read)

- **`admin`** — "Composable admin surface for Jini-hosted products: framework-free contracts, panel registry, and route model in `/core`; React shell and panels in `/react`." The natural base for Runner's *own* operator UI shell (rail nav + panel registry) instead of hand-rolling one, which is exactly what the abandoned `web/src/admin-shell/navigation.ts` in Tovu-Runner tried to do before this package existed.
- **`cms`** — "Content-model capability... framework-free contracts/ports/domain services... Node persistence adapters." Tovu itself just started consuming `@jini-ai/cms/settings` (repo history: `f958a3f refactor(cms): consume settings from @jini-ai/cms/settings`). Relevant to Runner only if Runner needs to understand a site's content model directly rather than through Tovu's HTTP API — not recommended (see Part D); Runner should stay a client of Tovu's admin API, not a second implementation reading its content model.
- **`agentic`** — page-capability vocabulary, AG-UI projection, generative-UI, `data-agent-*` markup. Relevant if/when Runner's own "operator" chat profile (ADR-014) needs the same AG-UI plumbing Tovu's admin/consumer chat already uses.
- **`capability-providers`** — swappable ports for auth/storage/payments/db/realtime with adapters behind `./adapters/*`. Plausibly relevant to Runner's *own* persistence/auth needs (tracking N projects, operator users, billing later) — not to controlling Tovu.
- **`http-kit`** — composable Express route packs for a `@jini-ai/core` daemon composition. Relevant if Runner's own backend is built Jini-native.
- **`server` (`@jini-ai/server`)** — package.json had no description string (only `"domain": "server", "kind": "host", "runtime": "node", "admission": "locked"`); not read deeper this pass. Flagged as needing a follow-up look before relying on any characterization of it.
- **`sqlite`** — better-sqlite3-backed adapters for `@jini-ai/daemon`'s ports (event log, schema migration, db inspection). Runner's own DB, not a replacement for Tovu's per-site Drizzle/SQLite.
- **`ui`** — product-neutral React UI primitives (framework-free `/core`, plus a sketch editor and a rich-text editor). Complements `admin` for Runner's own UI.
- **Not obviously relevant to the spawn/manage/edit role, present for completeness**: `artifacts` (generic artifact store — relevant later for Runner-generated assets/videos per ADR-014's "generation" scope, not to process management), `chat-core` (framework-free chat vocabulary — underlies any chat surface Runner builds), `deploy` (static-site deploy adapters — relevant to a future "deploy this site" action, not local spawning), `diagnostics` (support-bundle export/redaction — plausibly useful for fleet-wide troubleshooting bundles), `mcp` (MCP server/client adapters), `media` (multi-provider image/video generation gateway — matches ADR-014's "generate_video" operator tool directly), `memory` (daemon-side notes/memory), `protocol` (the Jini wire contract — underlies `daemon`/`cli`), `registry` (pluggable content-registry backends — unrelated to this problem as far as read).

### Summary judgment

The pieces that look **built for this exact use case and sitting unused** are `desktop-host` (explicitly built ahead of a confirmed second consumer) and `sidecar`'s port-allocation + daemon-registry primitives (built for one-daemon-per-app, trivially generalizable to N). Together with `platform`'s process/http primitives, roughly 70-80% of the low-level "spawn and supervise a fleet of local HTTP server processes" mechanics already exist in Jini — what's missing is the Tovu-specific glue (Part C/E), not the underlying OS-primitive layer.

---

## C. Spawning/Coordinating Requirements

### The real path today, for one instance (verified end to end in source)

1. `tovu init <dir> [--name]` (`src/cli/commands/init.ts` → `src/site-dir/init-site.ts`): validates the target dir, creates the install-dir layout, writes `config.json`, creates `content.db`, runs migrations, seeds the starter template content, writes `.site-meta.json` last as the commit marker (SPEC-003 REQ-03). Prints `created site '<name>' at <dir>` / `next: tovu serve <dir>`.
2. **No admin user is seeded.** Verified: `src/templates/starter/seed-content.json` has exactly three top-level keys — `workspace`, `entries`, `presentation` — **no `users` key**. SPEC-006's feature spec (`ADS-memory/specs/006-identity-and-authorization/feature.spec.md:67-68`) narrates "`tovu init` seeds a `system` principal and an `owner` user (**or** first-boot creates the owner)" as the intended journey, but no `firstBoot`/first-boot-owner code path exists in `src/` today (targeted search for `firstBoot`/`first_boot`/`seedOwner`/`createOwner` found nothing beyond an unrelated file named `list.ts` under `users/`). **This is a real, currently-unimplemented gap**, independent of Runner: today, a freshly `tovu init`'d site has content but no way to log into `/admin`.
3. `tovu serve <dir> [--port] [--workspace <id>]` (`src/cli/commands/serve.ts`): validates the dir, runs the schema-compatibility guard (forward-migrates if the runtime is newer; refuses if the site is newer), resolves one workspace (Part: Central Question), binds one HTTP listener on one port (precedence: `--port` > `config.json.port` > `PORT` env > `3000`), logs exactly one boot line, and installs graceful SIGINT/SIGTERM shutdown (drains in-flight requests, closes the db handle, exits 0; a 500ms force-close safety net).

### What a supervisor of N of these needs, and the concrete gap for each

| Need | Exists today? | Where |
|---|---|---|
| Spawn a child process running `tovu serve <dir>` | No (Tovu is a single-process CLI by design) | Compose `@jini-ai/platform`'s `process.ts` + `@jini-ai/desktop-host`'s `sidecarLauncher` port — both already shaped for exactly this |
| Confirm a spawned instance is actually listening | No health endpoint found in Tovu's admin routes (not exhaustively searched — flagged as unverified, see Confidence section); today's only readiness signal is the one stdout boot line | `@jini-ai/platform`'s `http.ts` readiness poller is ready to use once a target URL is known |
| Allocate a free port per instance | No — Tovu resolves exactly one port per invocation with zero awareness of sibling processes | `@jini-ai/sidecar`'s `allocatePort` already exists |
| A registry of "install dir ↔ port ↔ pid ↔ project identity" across N instances | No — nothing in Tovu or Jini tracks *multiple* Tovu processes today | Closest primitive: `@jini-ai/sidecar`'s daemon-registry, currently 1-record-per-dataDir; needs generalizing to N keyed records |
| Log capture (file, rotation) per instance | No — `tovu serve` writes to stdout/stderr only | `@jini-ai/platform`'s `fs.ts` has log-tail primitives; no end-to-end "capture child stdout to a log file" helper wired up |
| Fleet-wide upgrade/migration coordination | No — SPEC-003's schema guard makes any *one* `tovu serve` self-migrate safely, but nothing coordinates, staggers, or reports schema-version drift **across** N projects | Nothing existing; genuinely new, and correctly so — ADR-007/012 keep Tovu itself single-instance-scoped on purpose |
| First-boot admin credential | No (see above) | Belongs in Tovu, not Runner — blocks any scripted "spin up + log in" flow regardless of who builds Runner |
| Shared vs. per-instance secrets (LLM/BYOK keys) | Not evidenced either way | Open question — see below |

### Framing

None of this is a criticism of Tovu — ADR-007/011/012 *deliberately* keep each Tovu process single-site-scoped (per-process `workspaceId`, per-process port, per-process db handle) so that the multi-instance problem is entirely a Runner-side concern, never smuggled into the site runtime as global/singleton state. That discipline is exactly what makes N-instance supervision tractable from the outside — there is no hidden global state in Tovu's own process to fight (verified: no module-level singletons or hardcoded ports found in `server/deps.ts`/`server/app.ts`; every dependency is threaded through the `deps` object built once per `createSqliteRouteDeps` call).

---

## D. Editing Multiple Tovu Projects — Control Plane

### The candidates

1. **CLI (`tovu` binary).** Today it has exactly three commands: `init`, `serve`, `introspect` (`src/cli/commands/`). **No content-editing commands exist at the CLI level at all** — no `tovu post create`, no `tovu page update`, nothing. `tovu introspect --format mcp` (SPEC-003 REQ-11) exists specifically so an agent driving `tovu` as a subprocess (the spec names Tovu-Runner explicitly) can read the CLI's live command schema instead of a hand-maintained doc — but as of today that schema only describes site *lifecycle* (init/serve/introspect itself), not content. **Not currently a content-editing surface.**
2. **Admin HTTP API.** The real, mature, rich surface: dozens of `workspaceId`-scoped, permission-gated routes already exist under `src/server/routes/admin/` — workspace CRUD, pages, posts, media (upload/list/update/delete/trash/original), forms (create/list/get/submissions), comments (moderate/settings/queue), redirects, widgets, change-sets (list/get/revert), analytics, users/roles, settings. Every route validates `req.params.workspaceId === deps.workspaceId` (35+ call sites grepped). **This is the right control plane** — it's where all real editing already happens for a single site, including from Tovu's own admin UI and its assistant tools.
3. **Identity for headless callers.** ADR-021 (`ADS-memory/reports/architecture/ADR-021-identity-and-authorization.md:104`, `:123`) and SPEC-006 (`ADS-memory/specs/006-identity-and-authorization/feature.spec.md:49,68,78`) are explicit and directly on point: `api_keys` (a `kind='api_key'` principal, hashed at rest) are in v1 **"because Tovu-Runner needs [headless auth]"**; the user journey literally reads *"An operator issues an API key (bound to a principal + policy); Tovu-Runner uses it to serve and mutate headlessly; the key is later revoked and immediately stops working."* This is not an inference — the project has already designed this control plane with Runner as the named consumer.
4. **Jini's tool/agent layer.** Tovu's own assistant (ADR-013/014) calls through this same admin/domain layer to let an LLM edit content within one site. ADR-014 is explicit that Runner's "operator" tools (`create_site`, `generate_video`, `queue_task`) are **layered above** the site tool registry, never merged into it — "Tovu never imports Runner tools; Runner composes site tools + its own." So Runner's own agent surface and Tovu's site-tool registry compose (one-way arrow), they don't unify into a single cross-project registry.
5. **Direct DB access.** Wrong by design and should stay off the table: ADR-022 established a single write chokepoint plus an append-only change-set audit trail specifically so nothing bypasses it; a Runner that wrote `content.db` directly would silently break every audit/versioning/permission guarantee Tovu's core provides.

### Verdict

**The admin HTTP API, authenticated per-project via an `api_key` principal, is the designed and correct control plane** — this is not a recommendation made fresh by this recon, it is what ADR-021/SPEC-006 already committed to, naming Runner as the consumer. What's missing is everything *above* that per-project API:

### The gap: cross-project federation

Nothing today lets Runner make one call that fans out across N sites (bulk-publish, a single cross-project content dashboard, etc.) — each project's admin API is independent, separately addressed (by whatever port it was allocated), and separately authenticated (its own api_key). **This is not a gap this recon is discovering — the project has already named it**: SPEC-006 lists, as an explicit open question, *"OQ-05: Cross-site identity federation in Tovu-Runner (the shell owns operator auth) — Owner: Leon Aburime — Resolve by: 2026-11-30"* (`ADS-memory/specs/006-identity-and-authorization/feature.spec.md:129,750`). Any Runner rebuild plan should treat OQ-05 as a known, dated, owned blocker rather than a fresh discovery.

---

## E. Gaps List

**Belongs in Jini** (generic, reusable, not Tovu- or Runner-specific):
- Generalize `@jini-ai/sidecar`'s daemon-registry from one pointer-file record per `dataDir` to N keyed records — reusable by any product supervising a fleet of child processes, not Tovu-specific. Today it hard-assumes one daemon per app.
- A composed "spawn subprocess → poll HTTP readiness → capture stdout to a log file" helper gluing `platform`'s `process.ts` + `http.ts` + `fs.ts` together. Each primitive exists; the composition doesn't, and every future fleet-manager product would otherwise reinvent it.
- A generic HTTP client for driving a fleet of independently-versioned, independently-authenticated peer services (today `@jini-ai/cli` only knows how to drive "a Jini daemon" specifically, per its own module doc). Flagged as a *possible* extraction, not confirmed — only one consumer (Runner) is known right now, and the extraction-plan's own precedent (`source-map.md`) is to defer generalizing something until a second consumer is confirmed, then reconsider.

**Belongs in Runner** (Tovu/product-specific, not reusable infra):
- The actual project registry + lifecycle supervisor (which install dirs exist, their ports/pids/health, start/stop/restart policy) — composes the Jini primitives above, but "this is a Tovu-Runner project" is a Runner-owned concept.
- Fleet-wide upgrade/migration orchestration across N Tovu instances (staggering, drift reporting) — correctly does not belong in Tovu (ADR-007/012 keep Tovu single-instance-scoped on purpose).
- The real "Websites" UI + admin-shell, rebuilt against `@jini-ai/admin`/`@jini-ai/ui` rather than extended from the abandoned static mock in the old repo.
- api_key provisioning/rotation workflow per spawned project (the mechanism exists per-project in Tovu; the fleet-wide management of many keys is Runner's job).
- Cross-project federation (SPEC-006 OQ-05) — already explicitly named and owned by the project; not a fresh finding.

**Belongs in Tovu** (single-site concern; blocks Runner automation regardless of who builds Runner):
- First-boot admin credential / owner seeding. `tovu init` currently seeds zero users. This blocks any scripted "create a site, then log into its admin" flow end-to-end.
- Confirm whether a health/readiness HTTP endpoint exists anywhere in the ~40 admin routes (not found in this pass's sampling, but not exhaustively searched — see Confidence section). If absent, Runner would otherwise have to depend on parsing the one stdout boot line as its only signal, which is fragile.

**Unresolved / not evidenced either way:**
- Shared vs. per-instance LLM/BYOK secret model across N Runner-hosted sites — ADR-011 describes the *mechanism* (daemon-backed adapter vs. direct provider adapter) but not whether secrets are pooled or isolated per site under Runner.
- Whether Electron or Tauri has actually been *decided* for Runner's own shell anywhere — the only evidence found is a strong technical nudge (Electron's `desktop-host` assembly is complete; Tauri's is a narrow, partial spike with two `NotImplementedError` ports), not a recorded decision.

---

## Open Questions for the User

1. **The biggest one — a real tension in the ADR record I could not reconcile, flagged rather than guessed at.** ADR-011 (2026-07-01) decided the multi-site desktop host would be **open-design's own existing Electron app, reused directly**: *"open-design is that product... Tovu does not build its own Electron manager"* — the dependency arrow points open-design → Tovu, integration is at the daemon's HTTP API boundary, and Tovu never imports open-design source (or vice versa). But ADR-014 (2026-07-06, five days later) and SPEC-006 talk about **"Tovu-Runner"** as its own separate repo/product, with its own operator UI (rail pages, "Websites," a FAB), its own api-key-driven headless auth to Tovu, and its own operator tool registry layered above Tovu's site tools. Separately, Jini's `@jini-ai/desktop-host` package was extracted from open-design's source specifically to be *shell-agnostic and de-branded* — usable by a *different* product — built "ahead of schedule... not because a second host consumer is confirmed" (almost certainly with Runner in mind, per its own provenance doc). I verified open-design's actual current source has essentially no Tovu-awareness (one hit, in a doc, not runtime code) — so ADR-011's plan is **not implemented** there today. **Is the current intent (a) Runner = open-design's actual Electron app, repurposed/relabeled, or (b) Runner = a new, separate Electron/Tauri app built on `@jini-ai/desktop-host`, independent of open-design entirely?** These are meaningfully different builds (reuse one existing large product's shell vs. build a new small one on a shared primitive), and I found no document that resolves ADR-011's original decision against the later Runner-as-separate-thing framing.
2. Should a rebuild treat `/Users/la/Programming/Tovu-Runner`'s existing git repo as the literal continuation point (same repo, same history), or start a fresh repo — given Part A's finding that essentially none of the current code is reusable? My read is a fresh repo (or at minimum a hard reset past all the abandoned scaffolding), but the name/identity continuity may matter to you in ways I can't judge.
3. The first-boot admin credential gap (Parts C/E) — is this already tracked somewhere in Tovu's own backlog that I didn't surface, or is it a genuine, currently-unaddressed gap worth its own follow-up session (in Tovu, not Runner)?
4. SPEC-006's OQ-05 (cross-site identity federation, resolve-by 2026-11-30, already owned by you) — do you want this recon's Part E folded into that existing open question, or kept as a separate Runner-side framing of the same problem?

---

## Confidence and What I Could Not Verify

**High confidence** (directly verified in source, multiple independent citations, no material contradicting evidence found):
- Central question answer: one OS process per project, one workspace served per process for its lifetime; the multi-workspace-per-`content.db` capability is a separate, orthogonal feature. Verified via `resolve-workspace.ts`, `server/deps.ts`, `server/app.ts`, 35+ per-route `workspaceId` guard call sites, and cross-checked against ADR-007/011/012's stated intent.
- Tovu-Runner's existing code is not reusable for the supervisor role, and the repo is the literal pre-split ancestor of the current Tovu repo (ADR-014's own words), frozen mid-rename. Verified via git log, `git status --porcelain` (389 uncommitted changes), direct reads of `PROJECT_MEMORY.md`, `Websites.tsx`, `main.cjs`, `dev.sh`, and the 2026-07-06 handoff doc.
- The admin HTTP API + `api_key` principal is the designed control plane, with Runner named as the reason it exists in v1. Verified via ADR-021 and SPEC-006's feature spec, three separate citations.

**Medium confidence:**
- Part B's Jini reuse map — every package's description/exports were read; only the five named packages (`desktop-host`, `sidecar`, `platform`, `daemon`, `cli`) got a deeper source read. Judgments for the other ~15 packages are inferred from descriptions and top-level exports, not from call-site verification — treat those as a starting hypothesis for a real integration pass, not a finished plan.
- Part E's gap list is likely incomplete. In particular, I did not exhaustively search all ~40 admin routes for a health/readiness endpoint — I searched for it, found none in what I sampled, but did not read every route file.

**Low confidence / genuinely unresolved (flagged, not guessed at):**
- Open Question 1 (ADR-011's open-design-reuse decision vs. the later Runner-as-separate-product framing in ADR-014/SPEC-006) — I could not find a document reconciling these, and given how much it changes any rebuild plan, I chose to surface the tension rather than pick a reading.
- Shared-vs-per-instance secrets model across a Runner-hosted fleet — no evidence found either way.
- Whether open-design's actual current source has *any* Tovu-spawning code — grepped for "tovu" across its daemon source and found one hit, in a doc (`docs/jini-extraction-plan.md`), not runtime code. So ADR-011's "the host embeds or spawns Tovu server instances" appears to be **an accepted decision that is not yet implemented** anywhere, as of this recon.

**Not sampled this pass (explicitly out of scope, flagged rather than silently skipped):**
- Jini's `foundry/` directory (44M — the extraction-planning workspace referenced repeatedly in provenance docs).
- Full read of all ~40 Tovu admin routes (sampled the workspace/pages/posts/media/forms/comments set; did not read redirects/widgets/analytics/settings routes in full).
- open-design's `apps/desktop/src/main/updater.ts` and the rest of `apps/packaged/` beyond what `desktop-host/source-map.md` already documented about them.
- Jini's `agent-runtime`, `artifacts`, `chat-core`, `mcp`, `media`, `memory`, `protocol`, `registry`, `renderers-react`, `sqlite`, `http-kit`, `capability-providers`, `deploy` packages beyond their `package.json` descriptions and top-level exports.
- Codebase Memory MCP / Graphify were available (both `enabled`) but not used for this pass beyond `list_projects`/`index_status` — all findings above come from direct `rg`/file reads per the brief's stated preference for direct verification of load-bearing claims; given the actual source (Tovu ~5.7K files, Jini packages ~2.7K, Tovu-Runner ~278 real source files) was small enough, and the questions were mostly "what does this specific file say" rather than "map this whole graph," direct reading was faster and more reliable than standing up graph queries for a repo I hadn't indexed (Tovu-Runner) or re-verifying an existing index's freshness (Tovu/Jini) that I ended up not needing for anything but orientation.

---

## Coordinator verification pass — 2026-08-03

Spot-checked the two findings that would most change what gets built. Recorded here rather than
edited inline, so the original reading and the correction both stay visible.

### CONFIRMED — one OS process per project (the central question)

`src/site-dir/resolve-workspace.ts` states it directly in its own file header: a content.db **can**
hold more than one workspace row (ADR-007 tenancy, SPEC-044 admin CRUD), and the boot/serve path
resolves exactly **one** of them — oldest by `createdAt` by default, or `tovu serve --workspace <id>`.
Reached from both `server/deps.ts` and `site-dir/boot-site-dir.ts`. The report's answer stands, and
the reasoning for it is stronger than the report claims: this isn't an incidental limitation, it's a
documented design where multi-row support exists so an install that *grew* a second workspace still
boots, explicitly not so one process can serve two concurrently.

### CORRECTED — "no admin user is seeded / no way to log into `/admin`" is WRONG

Report lines 133, 146, 190, 203 state that a freshly `tovu init`'d site has no way to log into
`/admin`, called "a real, currently-unimplemented gap." It is not.

The owner **is** seeded — on the **serve** path, not the init path:
`src/server/deps.ts:237` → `createSqliteIdentityRouteDeps` → `buildIdentityRouteDeps`
(`src/identity/wiring.ts:87-97`) calls `seedIdentity({… ownerUsername: process.env.TOVU_ADMIN_USER
?? "admin", ownerPassword: process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev" })`, idempotently.

The search that missed it looked for `firstBoot` / `first_boot` / `seedOwner` / `createOwner`. The
symbol is `seedIdentity`, and it lives in the identity wiring, not the init/site-dir path. The
report's narrower observation — that `src/templates/starter/seed-content.json` has no `users` key —
is true, but that file is the **content** seed; identity seeding is a separate mechanism. Method
lesson: a targeted symbol-name search that comes back empty is evidence about the *names*, not about
the *capability*; confirm by tracing the composition root before declaring a gap.

### The real issue this uncovers, which is sharper and genuinely Runner-shaped

`@jini-ai/cms` deliberately requires `ownerPassword` with **no default**, and the comment at
`identity/wiring.ts:91-96` says why in as many words: "a library fallback would mean every host that
forgot to pass one shipped the same owner credential." Tovu-the-host then supplies exactly such a
fallback — `"tovu-dev"` — which is entirely reasonable for one local dev install.

**It stops being reasonable the moment Runner spawns N instances.** Unless Runner sets
`TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD` per spawned instance, every site in the fleet boots with
identical owner credentials `admin` / `tovu-dev` — and any of them that is network-reachable, or
later published, carries a known-by-construction owner login. The package-level protection was
designed for precisely this and is defeated one layer up.

So the gap is real but is **not** "build first-boot seeding." It is: **per-instance credential
provisioning is Runner's responsibility, and it must be settled before the first spawn path is
written, not after.** Tagged `belongs in Runner` (the provisioning + custody), with a possible
`belongs in Tovu` sub-item: make the `"tovu-dev"` fallback refuse to apply when the instance is
bound to a non-loopback interface.

This supersedes Part E's "First-boot admin credential | belongs in Tovu" row and Open Question 3.

### CONFIRMED, and sharpened — "70-80% of fleet supervision already exists"

This is the claim that decides whether Runner is an assembly job or a construction job, so it was
checked directly rather than taken on report.

| primitive | verified | note |
|---|---|---|
| Port allocation | `sidecar/src/port.ts:105` — `allocatePort({host, label, port, reserved})` | **Understated in the report.** The `reserved: Set<number>` parameter means allocating N mutually non-colliding ports is already a supported call shape, not a modification. |
| Daemon discovery | `sidecar/src/daemon-registry.ts` — atomic JSON pointer (url/host/port/pid), `isProcessAlive` liveness probe, `removeDaemonRegistryRecordIfCurrent` | **Also understated.** `resolveDaemonRegistryPath(dataDir, fileName)` is parameterized by *both*, so N instances is N calls with distinct `dataDir`s — no module change. It is crash-safe by design (a stale record from a daemon that died rather than exiting cleanly is detected, not trusted). |
| Process lifecycle + readiness | `platform` (process exec/lifecycle, HTTP readiness polling) | per package description; not deep-read this pass |
| Desktop shell | `desktop-host/src/electron/` — 8 implementation files, each with a matching test file | Electron is a complete assembly. |
| Desktop shell (Tauri) | `NotImplementedError` present in 5 of the `tauri/` files (`tauri-render-service` ×4, `tauri-shell` ×3, `tauri-protocol` ×2, `create-tauri-desktop-host` ×1) vs **1** hit anywhere under `electron/` | Confirms the report: **Tauri is a spike, Electron is the real path.** Shell choice is effectively already made unless someone wants to fund the Tauri work. |

**Refinement to the report's framing.** The per-instance mechanics are not merely "generalizable" —
they are already parameterized for N. What genuinely does not exist is the layer *above* them: the
**fleet supervisor** that owns the list of projects, allocates their ports as a coordinated set,
starts/stops/health-checks each child, and surfaces the fleet in a UI.

So the answer to "assembly or construction?" is **assembly, plus one real new component.** That new
component is Runner's actual reason to exist, and it is orchestration over solid, tested primitives
rather than primitive-building. That is a materially better starting position than the state of the
existing Tovu-Runner repo would suggest.
