# Zana-readiness measurement — which Tovu modules can be ported to `@jini-ai/cms` today

**Measured 2026-08-02** on branch `refactor/jini-admin-extraction`, after Phase 1 + Phase 2 of the
back-edge refactor. Probe script: `scratchpad/portability.ts` (dependency-cruiser file graph,
tests excluded, `src/**` on both ends).

## The metric

Cycles are the wrong metric for the Zana goal. `features/post` and `features/taxonomy` importing
each other is a cycle, but it does not stop a second host using them — you just take both.

What actually blocks a second host is an import into **a host** (`server`, `cli`, `site-dir`,
`headless`, `public`) or into **the AI consumer** (`assistant`), because Zana brings its own of
each. That is the metric below.

`origin` is *not* a host — it is a domain library (ADR-040 canonical-origin registry / redirect +
egress oracle) that imports only `core`. Classifying it as a host is what produced an earlier
undercount.

## Result: 21 portable, 11 blocked

**Portable today — zero host imports, zero AI imports (21):**

```
analytics   core   db   http   identity   integrations   media   members
navigation  newsletter  origin  redirects  routing
features/content-types  features/entries  features/index.ts  features/presentation
features/settings  features/theme  features/tool-audit  features/workspace
```

**Blocked (11 modules + `src/index.ts`, which is legitimately a host entry point):**

| module | edges | blocked by |
|---|---|---|
| `features/database` | 1 | `server/gated-mutations-composition.ts` |
| `features/recovery` | 1 | `server/gated-mutations-composition.ts` |
| `features/taxonomy` | 1 | `server/gated-mutations-composition.ts` |
| `features/plugin-runtime` | 1 | `server/http/admin/plugins.ts` |
| `widgets` | 1 | `server/http/admin/widgets.ts` |
| `mail` | 1 | `server/runtime-mode.ts` |
| `forms` | 2 | `server/middleware/rate-limit.ts` |
| `comments` | 3 | `server/middleware/rate-limit.ts` |
| `seo` | 3 | `server/http/site/page-head.ts` |
| `features/post` | 3 | `assistant/mcp-ui.ts`, `assistant/pending-confirmations.ts` |
| `features/plugins` | 2 | `assistant/mcp-federation/{config,presets}.ts` |

## The finding that changes the plan

**7 of the 11 blocked modules are blocked *only* by their own `tool-registrations.ts`** —
`features/database`, `features/recovery`, `features/taxonomy`, `features/plugin-runtime`,
`widgets`, `features/post` (2 of 3 edges), and `integrations` (via `origin`, now reclassified).

The domain code in those modules is already host-free. It is the AI-tool *handler* layer that
reaches into the composition root, and it does so for one of two reasons:

1. It needs the host-composed gated-mutation wiring (`gated-mutations-composition.ts`, 3 modules).
2. It reuses logic that happens to live in an HTTP admin route file
   (`server/http/admin/{plugins,widgets}.ts`, 2 modules).

Both are misplacements, not design defects. Neither requires touching domain logic.

The 4 remaining blocked modules are blocked by non-registration files:
`comments`/`forms` (rate-limit policy primitive filed under `middleware/`), `mail`
(`runtime-mode`), `seo` (`page-head` — note `seo/types.ts` and `seo/ports.ts` import the
composition root, which is inverted), and `features/plugins` (MCP federation config).

## Blocking targets, ranked

```
3 modules   src/server/gated-mutations-composition.ts
2 modules   src/server/middleware/rate-limit.ts
1 module    src/server/runtime-mode.ts
1 module    src/server/http/site/page-head.ts
1 module    src/server/http/admin/plugins.ts
1 module    src/server/http/admin/widgets.ts
1 module    src/assistant/mcp-ui.ts + pending-confirmations.ts
1 module    src/assistant/mcp-federation/{config,presets}.ts
```

Eight targets, nine files. Four of them (`rate-limit`, `runtime-mode`, `page-head`,
`gated-mutations-composition`) are already named in Phase 3 of
`RESUME-architecture-refactor.md` — the portability goal and the back-edge goal want the same
moves, which is the useful part: one refactor serves both.

## Sizes (non-test files / lines)

```
core                     23 / 2889      identity     19 / 5162
features/content-types   13 / 2041      members      12 / 3058
features/entries         10 / 1348      media        19 / 2836
                                        navigation   12 / 2509
```

`src/core` is small (23 files) and is the CMS kernel — event bus, outbox, clock, id ports,
`commands/`, `gated-mutations/`, `entry-refs/`, `tools/`, `operation-lock`. It is distinct from
`@jini-ai/core` (Jini's daemon kernel: DI tokens, pack composition, run-level tool registry).
Everything else imports it, so it ports first or nothing ports.

## CORRECTION — "21 portable" is not "21 extractable"

The 21-module count measures **direct** host imports. That is the wrong test for packaging. A
module with no direct host import still cannot be extracted if something in its **transitive
closure** reaches the host, because the package would have to ship that too.

Measured closure of the chosen first slice (`identity`, `members`, `media`, `features/settings`,
`features/workspace`, `features/database`): **35 modules — the entire repo, including `server`,
`assistant`, `site-dir`, and `headless`.** Removing `features/database` from the slice does not
help; the closure is still 35 via a different path. This is the SCC=33 metric restated in
packaging terms.

So the earlier framing — "7 of 11 blocked modules are blocked only by `tool-registrations.ts`" —
is true but not load-bearing. Cutting every tool-registration edge leaves the closure at 35.

## The actual minimum cut: 6 module edges, 6 files

Greedy min-cut over shortest slice→host paths (`scratchpad/mincut.ts`). Every one is a **single
file edge**:

| # | edge | file |
|---|---|---|
| 1 | `features/database → server` | `features/database/tool-registrations.ts → server/gated-mutations-composition.ts` |
| 2 | `mail → server` | `mail/purpose-scoped-mailer.ts → server/runtime-mode.ts` |
| 3 | `features/database → features/recovery` | `features/database/repo.memory.ts → features/recovery/restore-points.ts` |
| 4 | `core → features/post` | `core/commands/appliers.ts → features/post/index.ts` |
| 5 | `db → features/recovery` | `db/sqlite/database-journal-repo.ts → features/recovery/restore-points.ts` |
| 6 | `members → newsletter` | `members/subscriber-directory.ts → newsletter/ports.ts` |

Only **one** of the six is a tool-registration file. The load-bearing one is **#4**: the kernel's
command applier names `features/post` by name, and every module imports the kernel, so that single
edge welds the whole graph. It is Phase 4 of `RESUME-architecture-refactor.md` and the one item
there flagged as needing real design (a registration-based applier lookup) rather than a move.

Four of the six (#2, #3, #4, #5) are already planned Phase 3/4 work. #1 and #6 are new.

**Resulting package after the six cuts — 12 modules, transitively host-free:**

```
analytics  core  db  identity  mail  media  members  origin
features/database  features/presentation  features/settings  features/workspace
```

`analytics`, `db`, `mail`, `origin`, and `features/presentation` are pulled in by the requested
six rather than requested directly, but all are CMS-adjacent infrastructure and none are
Tovu-specific.

## Note on package homes

The 21 portable modules are not all content-model. `@jini-ai/cms` is the right home for the
content ones; `identity`/`members`, `analytics`, `mail`/`newsletter`, and `integrations` are not
CMS and should not land there just because they were measured in the same sweep. `@jini-ai/media`
already exists and is an **AI generation gateway**, not an asset library — Tovu's `src/media`
(uploads, derivatives, blob store) does not belong in it and is a genuine CMS concern.
