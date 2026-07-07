# Feature Spec: Site Install Dir — Instantiate a Template, Serve the Folder

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-003 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:c2547dc39b9e12bc7fb199d3c32e472804a3fea9690014a8000f421db1846142 |
| feature_name | FEAT-003-site-install-dir |
| last_edited | 2026-07-07T02:20:00Z |
| owner | Leon Aburime |
| spec_agent | Spec Agent |
| spec_mode | brownfield |

---

## Overview

ADR-012's create→serve flow, made real: `tovu init <dir>` instantiates the built-in **starter template** into a self-contained install dir (`config.json`, `content.db`, `uploads/`, `themes/`, `plugins/`, `overrides/`, `.site-meta.json`), and `tovu serve <dir>` boots that folder — resolving the site's workspace from its own database and serving the public site + admin exactly as today's dev server does. This turns "site is a folder" (ADR-011's portability contract) from an ADR sentence into a testable artifact, and gives the walking skeleton its first-boot story.

**Design call — what lives in `config.json` vs `content.db`:** ADR-012's sketch lists "active theme id, enabled plugins" in `config.json`. This spec deliberately keeps **runtime-mutable settings in `content.db`** (active theme already lives in `presentation_settings`, versioned and audited through the SPEC-001 gateway) and reserves `config.json` for **static site identity** (name, optional domain/port). Rationale: a second mutable store outside the database would fork the mutation path around the gateway and change-set audit trail. Enabled plugins will follow the same rule when plugins land (SPEC-005). This is a refinement of ADR-012's illustrative sketch, not a contradiction of its decision.

---

## Problem Statement

**Current state:** The server boots from a bare SQLite path (`TOVU_CONTENT_DB`, default `./content.db`) with the workspace id hardcoded to the seeded demo workspace (`server/deps.ts`). There is no install-dir concept, no `config.json`, no template, no CLI — a "site" cannot be created, moved, or handed to someone.

**Desired state:** `tovu init my-site && tovu serve my-site` produces a running website from nothing, with all site state inside `my-site/`. The folder can be zipped, moved, and served elsewhere unchanged.

**Why now:** This is step 1 and step 5 of the v1 first slice (START-HERE.md): site-as-folder instantiation and the serve flow are what every later capability (themes dir, plugin artifacts, uploads, binary export) hangs off. The install-dir layout is a compatibility contract with the desktop host (ADR-011) — freezing it early is the point.

**Success signal:** From a clean checkout: `tovu init demo && tovu serve demo` serves the seeded site (welcome post + about page from SPEC-002) on the configured port; moving `demo/` to another path and serving again works identically; integration tests cover init→serve→edit→restart round-trips.

---

## User Journey

1. **Trigger:** A user (or the desktop host, or CI) runs `tovu init my-site --name "My Site"`.
2. **Steps:**
   1. The CLI validates the target (must not be an existing non-empty directory), creates the layout, writes `config.json`, creates `content.db`, runs migrations, seeds the starter template content, and writes `.site-meta.json` last as the commit marker.
   2. The user runs `tovu serve my-site`. The CLI validates the dir (config + meta + db present), checks schema compatibility, migrates forward if needed, resolves the site's workspace from the db, and starts the HTTP server.
   3. The user logs into `/admin`, edits content (SPEC-002 flows), and sees it on the site.
   4. The user stops the server, moves the folder, and serves it from the new location — everything is intact.
3. **Outcome:** One folder holds the whole site; the runtime is shared and never copied (ADR-012).
4. **Alternate paths:** `init` into a non-empty dir fails cleanly with nothing written. `serve` against a folder produced by a *newer* runtime refuses with a clear "upgrade tovu" error instead of corrupting data. A crashed `init` leaves no `.site-meta.json`, so `serve` refuses the incomplete dir.

---

## Scope

**In scope:**
- Install-dir layout contract and file schemas (`config.json`, `.site-meta.json`) — REQ-01
- Built-in starter template as data (`templates/starter/`: `template.json` + declarative seed) — REQ-02
- `tovu init <dir>` instantiation flow with commit-marker ordering — REQ-03
- `tovu serve <dir>` boot flow: validation, schema guard + forward migration, workspace resolution, HTTP serve — REQ-04, REQ-05, REQ-06
- Port/name precedence rules — REQ-07
- Portability guarantee (no absolute paths persisted) — REQ-08
- CLI executable wiring (`bin` entry; dev via tsx) — REQ-09
- Legacy dev/test boot preserved (`TOVU_DB=memory`, `TOVU_CONTENT_DB`) — REQ-10

**Out of scope:**
- `tovu build` binary export (ADR-012 export flow — own spec) — OQ-01
- Multi-template gallery / template marketplace (v1 ships exactly `starter`) — ADR-012 deferred
- Uploads pipeline and media serving (dir is created; serving/writing media is the media spec) — OQ-02
- Themes/plugins dir *contents* (SPEC-004 / SPEC-005 define what goes inside; this spec only creates the dirs)
- Desktop-host integration (`packages/host-open-design/` adapters, ADR-011 topology 2)
- Site rename/domain management UI; `config.json` editing surfaces
- Template *upgrade* flow (re-instantiating a newer template over an existing site) — OQ-03
- Authentication (Art. VI exception carries over)

---

## Requirements

- REQ-01: An install dir consists of exactly: `config.json` (static identity: required `name`, optional `domain`, optional `port`), `content.db` (SQLite, existing schema), `uploads/`, `themes/`, `plugins/`, `overrides/` (all created empty), and `.site-meta.json` (`templateId`, `templateVersion`, `schemaVersion`, `schemaTag`, `createdAt`, `siteId`). No other files are required or created.
- REQ-02: The starter template is versioned data in the repo at `templates/starter/`: `template.json` (`id "starter"`, semver `version`, `name`, `defaultConfig`) plus a declarative seed file (`seed-content.json`: one workspace, entries, presentation settings) whose content equals today's seed module output (including the SPEC-002 `about` page). Template instantiation reads this data — no template code executes.
- REQ-03: `tovu init <dir> [--name <name>]` performs, in order: (1) target validation (EC-01/EC-02), (2) directory creation, (3) `config.json` write, (4) `content.db` creation + migrations, (5) seed insertion from the template (repo-level writes; no change sets — seeds predate the site's audit trail, matching SPEC-002 INV-03's seed exemption), (6) `.site-meta.json` write **last** (commit marker). On any failure before (6), the CLI removes everything it created (no partial install dir).
- REQ-04: `tovu serve <dir> [--port <n>]` validates before listening: `config.json` parseable with a non-empty `name`; `.site-meta.json` present and parseable; `content.db` present. Any miss aborts with `SITE_DIR_INVALID` (exit 3) and serves nothing.
- REQ-05: Schema compatibility guard. The runtime identifies its schema by the latest Drizzle migration it bundles under `drizzle/` (read from `drizzle/meta/_journal.json`): `schemaVersion` = that migration's integer index (ordering), `schemaTag` = its tag/hash identity. The guard compares the site's `.site-meta.json` stamp to the runtime: (a) site `schemaVersion` **greater than** the runtime's ⇒ `SITE_NEWER_THAN_RUNTIME` (exit 4); (b) **equal** index but a **different** `schemaTag` ⇒ also `SITE_NEWER_THAN_RUNTIME` (divergent migration lineage — a fork or a different runtime build at the same index; RT-005); (c) otherwise Drizzle's `migrate()` applies any pending generated migrations (idempotent via the db's `__drizzle_migrations` journal), and both `schemaVersion` and `schemaTag` are set to the runtime's before listening. (Drizzle's journal tracks *which* migrations a given db has applied; the `.site-meta.json` stamp is the portability guard answering *"is this site newer than, or divergent from, this runtime?"* — complementary, not redundant. Comparing the tag, not just the count, is what makes divergent lineages detectable.)
- REQ-06: The serving workspace id is resolved from `content.db`: exactly one workspace row is required; zero or multiple rows abort with `SITE_CORRUPT` (exit 5). The hardcoded seeded-workspace id in `server/deps.ts` is removed from the install-dir path.
- REQ-07: Precedence rules: port = `--port` flag > `config.json.port` > `PORT` env > 3000; site name at init = `--name` flag > directory basename. Both are deterministic (BR-02/BR-03).
- REQ-08: Neither `init` nor `serve` persists absolute paths in any install-dir file; a moved/renamed dir serves identically (AC-10).
- REQ-09: The package exposes a `tovu` executable (`bin` in package.json → built CLI; `npm run dev` continues to work for the repo checkout). `tovu --help` and unknown commands exit 2 with usage.
- REQ-10: The legacy boot paths remain: `TOVU_DB=memory` (hermetic tests) and `TOVU_CONTENT_DB=<path>` (flat dev db without an install dir) behave exactly as today when no install dir is given.

---

## Acceptance Criteria

- AC-01 (REQ-03) [P1]: Given a clean path, when `tovu init demo --name "Demo"` runs, then the dir contains exactly the REQ-01 layout, `config.json.name == "Demo"`, `.site-meta.json` records `templateId "starter"`, the current `templateVersion`, `schemaVersion` + `schemaTag` (the runtime's latest bundled migration), and a generated `siteId`.
- AC-02 (REQ-02) [P1]: Given a fresh init, when the site is served, then the seeded content equals the starter template's declarative seed (welcome post, glass-demo post, `about` page, presentation `paper`) — byte-equivalent to the pre-feature seed module output.
- AC-03 (REQ-03) [P1]: Given `init` fails at the seed step (fault injection), when it exits, then the target path does not exist (full cleanup) and the exit code is nonzero.
- AC-04 (REQ-03) [P1]: Given an existing non-empty directory, when `tovu init` targets it, then the CLI exits 3 with `INIT_DIR_NOT_EMPTY` and the directory is unmodified.
- AC-05 (REQ-04) [P1]: Given a dir missing `.site-meta.json` (crashed init), when `tovu serve` targets it, then the CLI exits 3 with `SITE_DIR_INVALID` and nothing listens.
- AC-06 (REQ-05) [P1]: Given `.site-meta.json.schemaVersion` greater than the runtime's — or equal index but a different `schemaTag` (divergent lineage) — when served, then the CLI exits 4 with `SITE_NEWER_THAN_RUNTIME` and `content.db` is not written.
- AC-07 (REQ-05) [P2]: Given a site with an older `schemaVersion`, when served, then migrations run, and afterward `.site-meta.json.schemaVersion` **and** `.site-meta.json.schemaTag` both equal the runtime's bundled-migration identity (index and tag written together), and the server starts. A follow-up serve of the now-migrated site with the same runtime must pass the guard cleanly (no false `SITE_NEWER_THAN_RUNTIME`), proving the tag was stamped, not just the index.
- AC-08 (REQ-06) [P1]: Given a served install dir, when content is edited via the admin API and the server restarts, then edits persist and the workspace id used by routes equals the one row in the site's `workspaces` table.
- AC-09 (REQ-06) [P1]: Given a `content.db` with zero workspace rows, when served, then the CLI exits 5 with `SITE_CORRUPT`.
- AC-10 (REQ-08) [P1]: Given an initialized, previously served dir, when it is moved to a different absolute path and served, then all content, settings, and behavior are identical.
- AC-11 (REQ-07) [P2]: Given `config.json.port 4000` and `--port 5000`, when served, then it listens on 5000; without the flag, 4000; without either and no `PORT` env, 3000.
- AC-12 (REQ-09) [P2]: Given the built package, when `tovu unknown-cmd` runs, then usage prints and the exit code is 2.
- AC-13 (REQ-10) [P1]: Given no install dir argument, when the server starts via `npm run dev` with `TOVU_DB=memory` or `TOVU_CONTENT_DB=/tmp/x.db`, then behavior matches the pre-feature dev server (hermetic tests unaffected).
- AC-14 (REQ-01) [P2]: Given a fresh init, when the dir is inspected, then `uploads/`, `themes/`, `plugins/`, `overrides/` exist and are empty, and no file outside the target dir was created.

---

## Invariants

- INV-01: `init` and `serve` must never write any file outside the target install dir (stdout/stderr excepted).
- INV-02: A failed `init` must never leave a partial install dir behind; `.site-meta.json` must only exist in dirs where every prior init step completed.
- INV-03: `serve` must never mutate template sources (`templates/starter/` is read-only at runtime).
- INV-04: `content.db` must be the only file inside the install dir that `serve` writes to (until the media spec adds `uploads/`), plus the `schemaVersion` and `schemaTag` fields of `.site-meta.json`, which are updated together atomically after a forward migration (a stamp that carries a bumped `schemaVersion` beside a stale `schemaTag` is an illegal state — it would trip a false divergent-lineage guard on the next serve; RT-005).
- INV-05: `.site-meta.json.schemaVersion` must never exceed the runtime's schema version after a successful `serve` start, and must never decrease.
- INV-06: The install-dir layout must be identical whether the site was created by standalone CLI or (later) the desktop host — it is the ADR-011 portability contract.

---

## Edge Cases

- EC-01: What happens when `tovu init` targets an existing non-empty directory?
  Expected behavior: exit 3 `INIT_DIR_NOT_EMPTY`; directory untouched (AC-04). An existing *empty* directory is allowed.
- EC-02: What happens when the target path exists as a regular file?
  Expected behavior: exit 3 `INIT_DIR_NOT_EMPTY` (same class); nothing written.
- EC-03: What happens when `config.json` contains invalid JSON at serve time?
  Expected behavior: exit 3 `SITE_DIR_INVALID` with the parse error in the message.
- EC-04: What happens when the configured port is already in use?
  Expected behavior: exit 1 `PORT_IN_USE` with the port number; no partial listener.
- EC-05: What happens when `content.db` is locked by another serving process?
  Expected behavior: SQLite busy error surfaces as exit 5 `SITE_CORRUPT`-class message naming the lock cause; no data written.
- EC-06: What happens when `--name` is provided but empty/whitespace?
  Expected behavior: exit 2 usage error (`VALIDATION`), nothing created.
- EC-07: What happens when `.site-meta.json` records an unknown `templateId`?
  Expected behavior: serve proceeds (template identity is provenance, not a runtime dependency); a warning is logged.
- EC-08: What happens when both an install-dir argument and legacy `TOVU_CONTENT_DB` are present?
  Expected behavior: the explicit install dir wins; the env var is ignored with a logged warning (BR-04).
- EC-09: What happens when `serve` crashes mid-migration?
  Expected behavior: the generated Drizzle migrations are idempotent via the `__drizzle_migrations` journal; the next serve re-applies any not-yet-recorded migration; the `.site-meta.json` `schemaVersion` and `schemaTag` stamp is only updated (both fields together) after `migrate()` completes.
- EC-10: What happens when an `init` filesystem write fails mid-flight (disk full `ENOSPC`, permission `EACCES`/`EROFS`)?
  Expected behavior: exit `INTERNAL` (1) after best-effort cleanup; if cleanup also fails, the message names the partial dir. The commit marker is never written, so `serve` refuses the partial dir regardless — INV-02 holds even under failed cleanup (RT-003).

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `src/infra/sqlite/content-db.ts` + `src/infra/db/schema.ts` + `drizzle/` | `openContentDb` (Drizzle `migrate()` over the generated `drizzle/` migrations), code-first schema, seed path | Migration becomes non-additive and breaks old sites | INV/AC pin additive behavior; Drizzle journal makes application idempotent; seed moves to template data (REQ-02) |
| `src/server/{app,deps}.ts`, `src/index.ts` | Existing composition + boot to reuse under the CLI | Hardcoded seeded workspace id defeats REQ-06 | Removed by this feature (REQ-06); legacy paths keep it only for memory mode |
| SPEC-002 (seeded `about` page, `kind` column) | Template seed content and schema | Seed drift between template and feature schema | Template seed generated from/validated against the seed module in tests (AC-02) |
| `package.json` | `bin` wiring, scripts | CLI unusable from a global install | AC-12 exercises the built binary path |
| Node runtime (`fs`, `path`, `net`) | Dir ops, port binding | none beyond mapped errors | error registry rows EC-01…EC-05 |

---

## Open Questions

- OQ-01: `tovu build <dir>` standalone-binary export (Node SEA vs Electron host packaging; ADR-012 flow 3) — Owner: Leon Aburime — Resolve by: binary-export spec kickoff (post walking-skeleton)
- OQ-02: Uploads serving + media pipeline (when does `uploads/` get read/written, signed URLs, transforms) — Owner: Leon Aburime — Resolve by: media feature spec
- OQ-03: Template upgrade flow (site created from starter v1.0 when starter v2.0 ships — migrate content or leave frozen?) — Owner: Leon Aburime — Resolve by: multi-template/second-template decision (ADR-012 deferred item)
- OQ-04: `siteId` vs workspace id relationship once the desktop host manages many sites (is `siteId` the host's key, the workspace id, or both?) — Owner: Leon Aburime — Resolve by: host-open-design adapter spec (ADR-011 topology 2)

---

## Constitution Compliance

Note: `ADS-project-knowledge/governance/constitution.md` is still not bootstrapped; toolkit default articles applied (same as SPEC-001/002). Flagged to Coordinator.

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | CLI uses Node built-ins (`fs`, `path`, arg parsing ≤ ~30 lines); no CLI framework dependency justified at two commands. |
| II — Test-First | COMPLIES | TDD Agent before Programmer; init→serve→restart round-trips are integration-testable with temp dirs. |
| III — Simplicity Gate | COMPLIES | New modules (`cli`, `site-dir`, template data) each trace to REQ-01…REQ-10. |
| IV — Anti-Abstraction Gate | COMPLIES | No new ports. The install dir is a file-format contract, not an abstraction; a `TemplatePort` is explicitly NOT introduced (one template exists — ADR-006 rule-of-two fails). |
| V — Integration-First Testing | COMPLIES | P1 ACs are CLI/process-level (spawn init/serve against temp dirs). |
| VI — Security-by-Default | EXCEPTION | Carried over: no auth layer; serve is local-dev/self-hosted. Path handling must still reject writes outside the target dir (INV-01). |
| VII — Spec Integrity | COMPLIES | Downstream stages reference SPEC-003 v1.0.0 + hash; SPEC-002 referenced as dependency. |
| VIII — Observability | COMPLIES | CLI errors are machine-readable (code + exit code registry); serve start logs dir, port, schema version. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (SPEC-003)
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file (config.json-vs-db split resolved by documented design call; remaining unknowns are scoped OQs)
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (init/serve ordering, precedence, commit marker)
- [x] traceability.spec.md complete (marked "pending implementation")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Planning Preflight
- [x] `spec_mode` is `brownfield`: evidence paths are recorded in `spec-manifest.md`

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Write `.site-meta.json` last during init and treat its presence as the only "init completed" signal.
- Keep the generated Drizzle migrations additive; rely on Drizzle's `__drizzle_migrations` journal for idempotency; update the recorded `.site-meta.json` `schemaVersion` and `schemaTag` (both together) only after `migrate()` completes.
- Resolve the workspace from the site's own db — never reintroduce a hardcoded workspace id on the install-dir path.

Ask before:
- Adding any field to `config.json` or `.site-meta.json` beyond REQ-01 (each is a compatibility-surface change per ADR-012).
- Introducing a CLI dependency (commander/yargs) — two commands don't justify it yet.

Never:
- Execute code from a template (templates are data — ADR-012/ADR-010 discipline).
- Store runtime-mutable settings in `config.json` (they belong in `content.db` behind the gateway).
- Write outside the target install dir.
