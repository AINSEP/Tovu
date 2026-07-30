# Progress Ledger

- workstream: tovu-v1-architecture
- scope_type: design + scaffold + targeted code fixes
- owner: Claude Fable 5 (Claude Code session) / Leon Aburime
- started_at: 2026-07-01T00:00:00Z
- last_updated_at: 2026-07-02T00:00:00Z
- related_state_file: `tovu-v1-design.md` (repo root — the v1 blueprint)
- decisions_file: `ADS-memory/reports/architecture/ADR-INDEX.md`
- evaluator_mode: not-needed

## Current Objective

Turn the three competitor-findings docs into a buildable v1 architecture for
Tovu (WordPress-like TS CMS, AI-native), decide the project-killer questions
via ADRs, scaffold the target structure, and stage Phase 0 (workspace
extraction) as the next implementation step.

## Read This First (next session boot packet)

1. `tovu-v1-design.md` — the blueprint: thesis (§2), 7 kernel registries (§3),
   full WordPress→Tovu capability map in 5 tiers (§3.5), package layout (§4),
   build order Phases 0–5 (§6), honest weaknesses review (§8).
2. `ADS-memory/reports/architecture/ADR-INDEX.md` — ADR-001
   (pre-existing, commerce) + ADR-002…011 (this session, all Accepted).
3. `tovu/packages/INFO.md` — scaffold + Phase 0 migration map (old `src/` → new homes).
4. `tovu/AGENTS.md` — read before touching `tovu/` code (param-object
   convention, INFO.md/index.ts, __tests__/__specs__).

## Decisions Made (ADR-002…011, one line each)

- 002: React = blessed v1 rendering target; contracts renderer-agnostic; Vue shell demoted to contract test. (Amended by 010.)
- 003: Plugins NEVER run DDL; plugin fields = namespaced JSON (`ext.{pluginId}.*`) with queryable/searchable → core-generated indexes; uninstall retains data.
- 004: Plugin artifact = `.tovu-plugin` tarball: prebuilt ESM + manifest w/ sdkRange, capabilities, integrity, provenance; versioned side-by-side installs; NOT a security sandbox.
- 005: SDK compatibility promise: public API = `@tovu/sdk` exports only; semver; deprecation ladder; API snapshot tests in CI.
- 006: Ports rule-of-two: no port without two plausible adapters, one being built. §13 friction "ports" are features on the event spine.
- 007: `workspaceId` structural everywhere (events, repos, jobs, cache keys). IMPLEMENTED in code this session.
- 008: Change sets: vocabulary now (actorId/changeSetId on event envelope — implemented; `change_sets` tables land with Phase 1 schema); propose/preview/apply/revert workflow later. Storage = first-class rows in the site SQLite DB, not state manager, not temp entries.
- 009: Decoupling is four lanes: direct typed calls (sync), outbox events (async side effects), typed hooks (extension), compensation workflow (multi-step rollback). No broker.
- 010: Themes DECLARATIVE by default (block templates + tokens + sanitized CSS, zero code; interactivity via registered components only) because a third-party theme library is a core goal; full-TSX "code themes" = trusted-mode escape hatch.
- 011: Two topologies: standalone single binary (primary, CI-enforced) + open-design Electron desktop as multi-site AI host (its `apps/daemon` provides LLM/BYOK/local-CLI detection, MCP mgmt, Composio connectors). Dependency arrow: open-design → Tovu ONLY. Tovu's own `desktop/` package cancelled. Install dir = compatibility contract between modes.

## Code Changes (in `tovu/src`, all tests green)

- `core/ports.ts`: `DomainEvent.workspaceId` now REQUIRED; reserved optional
  `actorId`/`changeSetId`; `OutboxRecord` now stores the FULL event envelope
  (was dropping workspaceId/aggregateId/metadata and re-fabricating occurredAt).
- `core/events/memory-bus.ts` + `outbox-worker.ts`: enqueue/publish full envelope.
- `features/post/post.ts` + `repo.memory.ts`: `PostRepoPort.findById/findBySlug`
  take `{ workspaceId, id|slug }`; inputs carry workspaceId; in-memory repo filters.
- Routes (`admin/posts/get-by-id`, `admin/posts/update`, `content/posts/get-by-slug`)
  pass `deps.workspaceId`; `workspace/create.ts` event carries workspaceId.
- Tests updated (`post.test.ts`, `outbox-worker.test.ts`, `create.test.ts`).

## Last Verified Good State

- `tovu`: `npm run typecheck` PASS, `npm test` 16/16 PASS (2026-07-01).
- **NOTHING COMMITTED to git this session** — all of the above (design doc,
  ADRs, scaffold, code fixes, todos, PROJECT_MEMORY) is uncommitted working
  tree. First action next session may be reviewing + committing.

## Artifacts Created

- `tovu-v1-design.md` (root) — v1 blueprint incl. §3.5 capability map + §8 weaknesses.
- `ADS-memory/reports/architecture/ADR-002…011 + ADR-INDEX.md`.
- Scaffold: `tovu/{packages,apps,plugins,themes,tooling}` — ~50 INFO.md
  placeholders; live code still runs from `tovu/src` (tsconfig only compiles src/).
- `tovu/apps/admin/sections/` — 13-section admin IA placeholders (WordPress-derived,
  screenshot at repo root `wordpress-admin-dashboard.png`); DRAFT pending research.
- `todos.md` — new "Backlog: Admin IA Research" (study Directus/Ghost/Payload/
  Strapi/WP admin structures + extension patterns before building admin).
- `tovu/PROJECT_MEMORY.md` — updated with target structure + decisions summary.

## Open / Next Steps (in order)

1. Review + commit the working tree (user's call on grouping).
2. **Phase 0 execution**: move `src/core/events` → `packages/core/src/kernel/events`,
   split `core/ports.ts` into `packages/core/src/ports/*`, relocate feature
   slices per `tovu/packages/INFO.md` migration map, move `nextjs/`→`apps/admin`,
   `vue/`→`apps/contract-vue`, wire pnpm workspaces + `tooling/eslint-boundaries`
   CI gate. Exit: behavior unchanged, boundary violations fail CI.
3. Admin IA research task (todos.md) — can run parallel to Phase 0; CBM indexes
   exist for all five reference CMSs.
4. Phase 1: SQLite adapter set (repos, outbox w/ retries, `change_sets` tables,
   migration engine — the only DDL author, ADR-003).
5. Watch items from design §8: hook-soup pressure (declared hook points only),
   theme authors demanding JS in declarative themes (grow component vocabulary
   instead, ADR-010), SDK stays small (ADR-005).

## Session Context Worth Keeping

- The three findings docs (root: `claude-4.8-`, `codex-5.5-`, `gemini-3.1-tovu-competitor-findings.md`)
  were adjudicated: Claude's = reference (evidence-grounded); Codex directional;
  Gemini right on physical packages, wrong on scope (4–6 workspaces, not 20).
- A coordinator-LLM review validated the weaknesses list and found the tenancy
  drift that was fixed this session; its additions (JSON indexing policy,
  provenance-from-day-one, change-set vocabulary in v1) are folded into ADR-003/004/008.
- CBM MCP projects available for all reference repos (wordpress, directus,
  payload, strapi, ghost, open-saas, medusa, open-design) — prefer CBM +
  Graphify over grep for structural questions.
