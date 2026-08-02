# Architecture Measurement & Refactor Plan — Tovu `src/`

**Date:** 2026-08-02
**Branch:** `refactor/jini-admin-extraction`
**Method:** `dependency-cruiser@18` full graph (`--ts-pre-compilation-deps`), 1352 modules / 5893 dependencies; git co-change over 263 commits; `codebase-memory-mcp` for AST-level complexity.
**Module unit:** `src/<dir>`, with `src/features/<dir>` split out separately. Collapsing `features` into one node is what caused the previous session's undercount.

---

## Verdict

**The repo is well-constructed.** Four independent measurements agree the decomposition is sound. There is **one localized defect**: 53 back-edges into the composition root. Plus one gap: no module has an enforced public API.

This is a repair on a good design, not a rescue.

---

## 1. Evidence the structure is sound

### Propagation cost — 11.0%

Fraction of the system reachable from a random production file (667 files). Reference points from MacCormack/Baldwin's DSM work (approximate, and measured with a slightly different method — treat as directional): Mozilla ~17% before its re-architecture, ~2.8% after; Linux ~0.3%; typical commercial systems 5–20%.

11% is mid-range and healthy. Core size (files both widely-reaching and widely-reached): **84 of 667, 12.6%**.

### Martin instability gradient — textbook-correct

`I = Ce/(Ca+Ce)`; 0 = maximally stable (only depended-on), 1 = maximally unstable.

```
I=0.02  Ca=238 Ce=  6   core            ← stable kernel, heavily depended-on
I=0.21  Ca= 73 Ce= 19   db
I=0.19–0.49              most domains
I=0.62  Ca= 33 Ce= 54   widgets
I=0.68  Ca= 21 Ce= 45   assistant
I=0.70  Ca= 12 Ce= 28   seo
I=0.90  Ca= 52 Ce=480   server          ← unstable composition layer
I=1.00  Ca=  0 Ce= 11   cli
I=1.00  Ca=  0 Ce= 10   index.ts        ← pure entry points
```

Exactly the desired shape. The declared architecture is holding.

### Git co-change — the boundaries are empirically real

The check that catches *fictional* boundaries: do modules declared separate actually change separately? Over 62 usable commits (2–8 modules touched; wholesale refactors excluded):

**No domain module meaningfully co-changes with another domain module.** Strongest domain↔domain pair is `features/entries + widgets` at 3 occurrences. Domains are genuinely independent in practice, not just on paper.

### Complexity — no production hotspots

Via cbm AST metrics: exactly one production function above threshold — `widgets/config-validation.walk` (cognitive 54, cyclomatic 19). Everything else flagged was a test helper. No pervasive complexity problem.

---

## 2. The defect: 53 back-edges into the composition root

`server` has **Ca=52**. A composition root should have Ca≈0 — nothing should import the thing that wires everything together.

The empirical consequence, from co-change: **you cannot change a module without changing `server`.**

```
71%  features/theme + server        46%  core + server
57%  features/plugins + server      45%  identity + server
48%  infra + server                 37%  features/settings + server
```

(% = share of the rarer module's commits that also touched `server`.)

Every back-edge, by target:

```
22 → src/server/routes/types.ts              (RouteDeps — the god type)
 5 → src/server/middleware/rate-limit.ts
 3 → src/server/runtime-mode.ts
 3 → src/server/http/site/page-head.ts
 3 → src/server/gated-mutations-composition.ts
 3 → src/server/app.ts       ┐ agent-daemon-server.ts — a composition
 3 → src/server/deps.ts      ┘ root living inside `assistant/`
 1 each → http/admin/plugins, http/admin/widgets,
          routes/admin/{users,members,newsletter}/deps,
          boot-lifecycle, boot/plugin-sdk-resolver, bootstrap,
          capability-inventory, production-readiness-gate, readiness-state
```

The refactor is not "fix 30 cycles." It is **"delete 53 back-edges into the composition root"** — the cycles fall out as a consequence.

### Why `RouteDeps` dominates

`src/server/routes/types.ts` — 454 lines, **45 imports**, line 1 is `import type { Express } from "express"`. It pulls in `identity`, `features/plugins/lipay`, `features/post`, `features/presentation`, `features/settings`, `features/theme`, `features/workspace`, `assistant`, `analytics`, `members`, `mail`, `navigation`, `integrations`, `media`.

22 `tool-registrations.ts` files import it. Distinct fields each actually uses:

```
 0 assistant          8 features/plugin-runtime    8 forms
10 comments           9 features/post              8 identity
 8 features/content-types  11 features/recovery    6 integrations
 8 features/database   8 features/settings         7 media
 7 features/entries   10 features/taxonomy         4 members
                       2 features/theme            6 navigation
                       3 features/workspace        7 newsletter
                                                   4 redirects
                                                   8 seo
                                                   9 widgets
```

Median 8, from a type with dozens. Aggregate distinct field names across all 22: ~12, dominated by `deps.workspaceId` (24 uses) and `deps.newsletterReady` (14).

**TypeScript is structurally typed**, so replacing the parameter type with a locally-declared narrow interface changes **zero call sites** — `server/routes/*` keeps passing the same object. Type-level change, not runtime.

This is also the concrete blocker on exposing the tool registry over MCP/stdio: every registration file transitively depends on Express's type surface.

---

## 3. The gap: no module has an enforced public API

Entry files through which outsiders reach each module:

```
18 entry files (18 bypass index.ts)  server
16 entry files (14 bypass index.ts)  core
13 entry files (13 bypass index.ts)  features/settings
13 entry files (13 bypass index.ts)  newsletter
13 entry files (12 bypass index.ts)  widgets
11 entry files (11 bypass index.ts)  db
10 entry files (10 bypass index.ts)  assistant, features/content-types, forms
```

Measured over the whole graph (the table above is a partial listing):

- **214 distinct private files are reachable from outside their own module.** This *is* the public API surface — it is what a package `exports` map would have to enumerate. This is the number to ratchet.
- **766 cross-module import edges bypass `index.ts`.** Informative for seeing where deep coupling concentrates, but the wrong thing to block CI on: adding a second import to an already-exposed file would fail the build without widening the surface at all. Exposing a *new* private file should fail.

Nothing enforces a surface today. At "reused by millions" scale this bites harder than folder names — a package's `exports` map enforces it for free; inside one `src/` tree, only a rule can.

> **Correction:** an earlier draft of this document cited "~140" here. That figure was a sum over the partial per-module table above, not a full-graph computation, and should not be reproduced. Caught by the `metrics` agent during implementation.

---

## 4. Cycles (the symptom)

| metric | value |
|---|---|
| **file**-level circular dependencies | **2** — the file graph is essentially clean |
| **module**-level mutual cycles (production) | **50** at session start → **30** after step 1 |
| largest strongly-connected component | **33 of 38 modules** |

The SCC is the extractability metric: 33 modules are mutually inseparable — none can be lifted into a package without dragging 32 others.

dependency-cruiser's built-in `no-circular` only sees the file level, which is precisely why the module-level cycles accumulated unobserved. Hence a dedicated ratchet (§6).

Boundary gate before this work: 53 violations, **0 errors** — every rule `severity: "warn"`, per a header comment whose premise ("no CI pipeline exists yet") has since expired. 25 of the 53 are `core → db` from `__tests__/repo.contract.test.ts` — port/adapter contract tests, a *legitimate* pattern needing a carve-out before severity is raised.

---

## 5. The plan

| phase | work | back-edges | cycles | status |
|---|---|---|---|---|
| **A** | `check:module-cycles` ratchet + baseline, blocking in CI | — | 50 baseline | **done** |
| **1** | `assistant/tool-registration-kit.ts` → `src/core/tools/registration-kit.ts`. Pure leaf (imports only `@jini-ai/core` + `core/commands`); it was the tool-registry contract sitting in the wrong folder. Cashes in `tovu-v2-design.md` §3's "tools registry". | −21 | 50 → **30** | **done, typecheck clean** |
| **2** | 22 `tool-registrations.ts`: replace `RouteDeps` with per-file narrow interfaces. | −22 | 30 → ~14 | next |
| **3** | Six relocations: `server/middleware/rate-limit.ts` → `core/` (policy primitive, not transport); `server/http/site/page-head.ts` → `seo/`; `server/runtime-mode.ts` → `core/`; `assistant/agent-daemon-server.ts` → `server/`; `db/sqlite/database-journal-repo.ts` invert; `core/entry-refs/repo.sqlite.ts` → `db/sqlite/`. | −14 | ~14 → ~4 | |
| **4** | `core/commands/appliers.ts` → applier registry (kernel imports `features/post` + `features/settings` by name). Flip boundary rules to `error`. | −3 | ~4 → 0 | |
| **5** | *Separate decision, after the graph is clean:* enforce module public APIs; `apps/admin` workspace status; optional taxonomy rename. | | | |

### Target folder shape

Deliberately small. No mass rename.

```
src/
  core/
    tools/          ← NEW (tool contract; was assistant/)   [done]
    rate-limit/     ← NEW (was server/middleware/)
    commands/       ← appliers.ts inverted to a registry
    entry-refs/     ← minus repo.sqlite.ts
  db/sqlite/        ← gains the adapters that were inside core/
  seo/              ← gains page-head.ts
  server/           ← loses rate-limit, page-head, runtime-mode; gains agent-daemon-server
  <every other module unchanged>
```

### Why *not* the `kernel/ modules/ adapters/ runtime/` rename

Proposed in the prior session as step 1. It is ~1,200 files of import churn and removes **zero** cycles and **zero** back-edges — renaming `server/` to `runtime/` doesn't stop `seo` and `server` importing each other. It makes rules *expressible*, not the graph *separable*. Worth revisiting after the graph is acyclic, as its own decision, on a graph that can validate it.

---

## 6. Metrics tracked permanently

The durable answer to "how would we know if it's getting better." Ratcheted in CI like `check:module-cycles` already is.

| metric | today | target | protects |
|---|---|---|---|
| propagation cost | 11.0% | ≤11% | change amplification |
| back-edges into composition root | 53 | 0 | the actual defect |
| module cycles / largest SCC | 30 / 33 | 0 / 1 | extractability |
| module API surface (distinct private files exposed) | 214 | 0 | API surface — **ratcheted** |
| deep-import edges bypassing `index.ts` | 766 | ↓ | where coupling concentrates — informational |
| core size | 12.6% | ≤12.6% | churn blast radius |
| domain↔domain co-change | ~0 | stays ~0 | boundaries stay real |

**Not yet done, and worth doing:** the same propagation-cost and instability measurement across `directus`, `payload`, `strapi`, `ghost`, `medusa`, `wordpress` (all indexed locally) — turning "11% is mid-range" from a literature comparison into a direct one against the competition.

---

## 7. Corrections to the previous session's analysis

| previous claim | corrected |
|---|---|
| "25 module cycles" | **50** production (55 including tests) — `features/*` was collapsed to one node |
| "14 `tool-registrations.ts` files" | **22** |
| Express coupling framed as a secondary cleanup | It is the dominant edge source: 22 of 53 back-edges, 17.4% of cross-module file edges |
| Taxonomy rename as step 1 | Removes zero cycles and zero back-edges; wrong first spend |
| "Tovu 34.4% vs Directus 14% vs Payload 16.7% cross-module coupling" | Not decision-grade — relative-import ratios aren't comparable across differently-shaped repos. Propagation cost and the instability gradient are the defensible metrics. |
| Implied the structure was in poor shape | Four independent measurements say it is sound; the defect is localized |

## 8. Unrelated finding — `AGENTS.md` "Always Consult" paths are broken

| declared | reality |
|---|---|
| `tovu-architecture.md` | actually `ADS-memory/docs/architecture/tovu-architecture.md` (§13 at line 957, §14 at 1019 — they exist) |
| `tovu/PROJECT_MEMORY.md` | does not exist |
| `tovu/src/INFO.md` | does not exist — `INFO.md` is per-module (`src/media/INFO.md`, …) |

Every agent booting in this repo is told to read three paths, two gone and one moved.
