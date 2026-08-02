# RESUME — architecture refactor (back-edge elimination)

**Read `2026-08-02-module-graph-analysis.md` in this folder first.** It has the evidence, the
plan, and the target folder shape. This file is only live state.

**Framing that matters:** Tovu's `src/` is structurally SOUND (propagation cost 11%, textbook
Martin gradient, domains don't co-change). The defect is **53 back-edges into the composition
root** (`server` has Ca=52). Cycles are the symptom. Do not re-diagnose this as "the repo is badly
structured," and do not propose the `kernel/modules/adapters/runtime` rename — it removes zero
back-edges.

---

## Done

- **Phase A** — `development/scripts/check-module-cycles.ts` + `check-module-cycles.baseline.json`,
  wired as `npm run check:module-cycles`, **blocking** step in `.github/workflows/ci.yml`.
  Measures MODULE-level cycles; depcruise's `no-circular` only sees FILE-level (repo has 2).
- **Phase 1** — `git mv src/assistant/tool-registration-kit.ts src/core/tools/registration-kit.ts`,
  all 23 importers rewritten, internal `../core/commands` → `../commands` fixed.
  **Result: 50 → 30 module cycles. `npm run typecheck` clean.**

- **Phase A′** — `check:module-cycles` superseded by `npm run check:architecture`
  (`development/scripts/check-architecture.ts` + `.baseline.json`), six metrics, five ratcheted,
  blocking in CI. Ratchet verified to actually fail (exit 1 on regression, 0 at baseline).
  Report: `agent-report-metrics.md`.
- **Phase 2** — all 22 `tool-registrations.ts` narrowed from `RouteDeps` to local
  `<Domain>ToolDeps` interfaces. Typecheck clean, 601 + 105 scoped tests pass.
  **Also fixed a latent crash the old cast was hiding** — see below.

### Current metrics (baseline locked here)

```
propagation cost                       10.34%   (was 11.00%)
back-edges into composition root       28       (was 53)
module cycles (mutual pairs)           17       (was 50)
largest strongly-connected component   33       (unchanged — needs phase 3)
module API surface (files exposed)     210
core size                              12.59%
```

The SCC is still 33 and will stay there until phase 3: a single remaining back-edge is enough to
keep the component welded, so it drops in one step rather than gradually.

### The latent crash phase 2 surfaced (fixed)

`createRouteDeps()`/`createSqliteRouteDeps()` never construct `magicLinkPerEmailLimiter` —
`server/app.ts` builds it per-boot inside `registerAdminRoutes` and spreads it into a local
`membersDeps`, never onto the returned object. `agent-daemon-server.ts` passed that bare
`routeDeps` into `buildAssistantToolRegistrations`, and `buildMembersRegistrations` cast past the
gap with `routeDeps as MembersRouteDeps`. In the daemon the field was simply `undefined`, so
`members_request_magic_link` would have thrown `Cannot read properties of undefined (reading
'check')` on first invocation. The daemon now builds its own per-boot limiter, correct under
ADR-PIPE-013 §2-3 C-015 since it is a separate boot.

**This is the strongest argument for the whole refactor: the type narrowing did not just move
edges around, it exposed a real crash that a cast had been hiding.**

## Next — Phase 3 (six relocations, ~14 → ~4 cycles)

Each kills a cycle; the thin side of each is named so the direction is unambiguous.

| move | why | kills |
|---|---|---|
| `server/middleware/rate-limit.ts` → `src/core/rate-limit/` | policy primitive, not transport; `forms` + `comments` reach into `server/` solely for it | `forms<->server`, `comments<->server` |
| `server/http/site/page-head.ts` → `src/seo/` | `seo/types.ts` and `seo/ports.ts` import it — a types file importing the composition root is inverted | `seo<->server` |
| `server/runtime-mode.ts` → `src/core/` | `mail/purpose-scoped-mailer.ts` is the only outside consumer | `mail<->server` |
| `assistant/agent-daemon-server.ts` → `src/server/` | it imports `server/{app,deps,runtime-mode}` — it IS a composition root, living in a domain module | `assistant<->server`, `assistant<->features/plugins` |
| `db/sqlite/database-journal-repo.ts` — invert | an adapter importing `features/database/{boot/…,timeline}` logic | `db<->features/database` |
| `core/entry-refs/repo.sqlite.ts` → `src/db/sqlite/` | a concrete SQLite adapter living inside the kernel | part of `core<->db` |

Also: `features/database/repo.memory.ts` → `features/recovery/restore-points.ts` is a single edge
(`features/database<->features/recovery`).

## Then — Phase 4 (~4 → 0)

`core/commands/appliers.ts` imports `features/post/index.ts` and `features/settings/ports.ts` by
name — the kernel knows two specific features. Invert to a registration-based applier lookup. This
is the only phase needing real design work; everything before it is moves and type narrowing.

Then flip `.dependency-cruiser.cjs` rules from `severity: "warn"` to `"error"`. **First add a
test-file carve-out** — 25 of the 53 current violations are `core → db` from
`__tests__/repo.contract.test.ts`, which are legitimate port/adapter contract tests.

## Phase 5 — separate decisions, after the graph is acyclic

1. Enforce module public APIs — **214 distinct private files are reachable from outside their own
   module** (766 deep-import edges). `server` is entered through 18 different files, `core` through
   16. The 214 is the ratcheted metric; it is what a package `exports` map would have to enumerate.
2. `apps/admin` workspace status — it has its own `package-lock.json`, sits outside
   `workspaces: ["packages/*"]`, and no boundary rule points at it.
3. Optional taxonomy rename — only now, and only if the metrics say it buys something.

## Loose ends

- Stale prose references to `assistant/tool-registration-kit.ts` remain in ~10 comments/docstrings
  across `src/` (the code all moved; only the prose is stale). Deferred to avoid colliding with the
  `routedeps` agent.
- `AGENTS.md` "Always Consult" names three paths, two of which do not exist
  (`tovu/PROJECT_MEMORY.md`, `tovu/src/INFO.md`) and one that moved
  (`tovu-architecture.md` → `ADS-memory/docs/architecture/tovu-architecture.md`). Unrelated to this
  refactor but affects every agent booting here.
- Not done, worth doing: run the same propagation-cost/instability measurement across the locally
  indexed `directus`, `payload`, `strapi`, `ghost`, `medusa`, `wordpress` to benchmark 11%
  against the actual competition rather than against literature.
