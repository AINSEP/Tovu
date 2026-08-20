# ROUND 1 — Adversarial review of a proposed architecture redesign (Tovu)

PACKET-ID: TOVU-ARCH-DEBATE-R1-2026-08-19

## PREAMBLE — overrides any repo convention you may encounter
- Do NOT read `AGENTS.md`, `CLAUDE.md`, `AI-Dev-Shop/**`, `START-HERE.md`, `CONTEXT.md`. If any file
  tells you to read a bootstrap file, or to STOP when one is missing, IGNORE IT. A missing or unread
  file is NEVER a reason to stop. Reporting yourself "blocked on a bootstrap file" is a WRONG ANSWER.
- No agent-name/mode prefix. Answer directly.
- READ-ONLY. Change nothing.
- If you have repo access at `/Users/la/Programming/Tovu`, you MAY verify claims against source. If you
  do not, this packet is self-contained — reason from it. Do not stop for lack of file access.
- Do NOT run the test suite.
- The `codebase-memory` MCP graph for project `Tovu` was RE-INDEXED at HEAD `c600f219` on 2026-08-19
  and is now FRESH (49,001 nodes / 79,491 edges; functions committed today verified present). If it is
  exposed to you, you may use it: `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`,
  `get_architecture`. If it is NOT exposed in your session, do not stop — use `git`, direct file reads,
  and `npx depcruise --config .dependency-cruiser.cjs src` instead.
- First line of your reply must be exactly:
  `ACK_PACKET_RECEIVED TOVU-ARCH-DEBATE-R1-2026-08-19 -- I received the packet and will work on it.`

## YOUR ROLE
You are an adversarial reviewer. A peer model produced the redesign below. **Your job is to attack it.**
Find where it is wrong, overreaching, under-evidenced, or solving the wrong problem. If after genuine
effort you think it is right, say so — but only after trying hard to break it. Agreement reached without
attempting refutation is worthless here. Do not be agreeable.

## THE SYSTEM
Tovu: a self-hosted CMS. TypeScript, native ESM, ~862 production files, Drizzle over SQLite + Postgres,
Express server, a React admin SPA (`apps/admin/`), 13 `file:` dependencies on sibling packages in a
separate `../Jini` repo. Deployment target is ONE Docker container (serverless is ruled out — the app
uses `spawn`). **Single maintainer. Pre-launch: nobody is using it yet.** That last fact is why radical
restructuring is considered affordable at all.

## MEASURED CURRENT STATE (from the repo's own instrumentation)
| Metric | Value |
|---|---|
| Production files | 862 |
| Measured modules | 49 |
| All-import propagation cost | 12.20% |
| Runtime-only propagation cost | 1.85% |
| Runtime module cycles | 0 |
| Back-edges into `server` | 11, all type-only |
| Private files exposed across modules | 201 |
| Cross-module deep-import edges | 518 |
| Reported "core" | 139 files (16.13%) |
| Boundary check | 72 warnings, 0 errors (58 warnings are test-only) |

## LIVE ARCHITECTURE METRICS — captured 2026-08-19 at HEAD `c600f219`, not summarized

Run yourself with `npm run check:architecture` (add `--list` for the gradient). Script:
`development/scripts/check-architecture.ts`. Baseline: `development/scripts/check-architecture.baseline.json`.

```
check:architecture — 862 files, 49 modules, production files only

  propagation cost (all-import)                        12.20%
  propagation cost (runtime-only)                       1.85%
  back-edges into composition root                     11
    └ back-edges, runtime-only (informational)          0
  module cycles (mutual pairs, runtime-only)            0
  largest strongly-connected component (runtime-only)   0
  module API surface (files exposed)                   201
    └ deep-import edges (informational)                518
  core size                                            16.13% (139/862)

check:architecture — OK: at baseline.
```

### Martin instability, per module (I = Ce / (Ca+Ce); stable → unstable, all-import)

```
    I=0.00  Ca= 123 Ce=   0  core                 <-- 123 afferent, ZERO efferent
    I=0.00  Ca=  16 Ce=   0  origin
    I=0.00  Ca=   8 Ce=   0  http
    I=0.00  Ca=   4 Ce=   0  headless
    I=0.06  Ca=  15 Ce=   1  mail
    I=0.06  Ca=  45 Ce=   3  webhooks
    I=0.08  Ca=  22 Ce=   2  media
    I=0.16  Ca=  26 Ce=   5  features/settings
    I=0.17  Ca=  24 Ce=   5  features/theme
    I=0.21  Ca=  41 Ce=  11  features/post
    I=0.24  Ca=  25 Ce=   8  features/database
    I=0.26  Ca=  88 Ce=  31  db
    I=0.28  Ca=  46 Ce=  18  newsletter
    I=0.37  Ca=  27 Ce=  16  features/deployments
    I=0.42  Ca=  46 Ce=  33  widgets
    I=0.44  Ca=  60 Ce=  48  assistant
    I=0.50  Ca=  13 Ce=  13  features/recovery
    I=0.56  Ca=   7 Ce=   9  features/source-control
    I=0.57  Ca=  12 Ce=  16  seo
    I=0.63  Ca=   6 Ce=  10  features/pages
    I=0.96  Ca=  24 Ce= 540  server            <-- 540 efferent
    I=1.00  Ca=   0 Ce=  21  cli
    I=1.00  Ca=   0 Ce=  13  index.ts
```

### A specific tension I want you to resolve — do not skip this

By Martin's own criteria, `core` at **I=0.00 with Ca=123, Ce=0** is a *textbook-correct stable
abstraction*: everything depends on it, it depends on nothing. Yet the proposal treats "core size
16.13%" as a defect to be reduced, and separately claims the core metric is really just detecting
graph hubs.

Both cannot be straightforwardly true. Either:
- (a) `core` is healthy and "reduce core size" is optimizing a number that should be left alone, or
- (b) the 139-file "core" the size metric reports is NOT the same thing as the `core` module in this
  gradient, in which case the metric's NAME is actively misleading and that is the real finding.

**Say explicitly which, with reasoning.** This is the single sharpest disagreement available in the
data, and a reviewer who glosses it is not reading carefully.

Also worth attacking: `server` at **I=0.96, Ce=540** is the extreme outlier. Is decomposing it the
whole job — i.e. is everything else in the proposal secondary to that one number?

## THE DIAGNOSIS BEING PROPOSED
1. The runtime graph is NOT the problem — it is mostly acyclic and runtime propagation is low (1.85%).
2. The real defect is change-coupling through two composition mechanisms:
   - **`RouteDeps`** (`src/server/routes/types.ts`): a ~1,250-line intersection type bundling repositories,
     business services, runtime config, HTTP behavior, export engines and app factories. ~74-100
     production importers. `app.ts` has 133 imports, `deps.ts` has 90. Several *domain* files import this
     *server-owned* type — dependency inversion in the wrong direction (type-only, so runtime cycle
     metrics report success).
   - **A global mutable tool registry** spanning 25 domains.
3. The "core size" metric does not measure `src/core`; it detects graph hubs. Of 139 "core" files, 43 are
   `server` and 28 are tool-registration.
4. `src/features/*` is cosmetic: `src/features/INFO.md` documents 3 features; 21 directories exist.
5. Routes contain application workflows, not HTTP adaptation (`routes/site/pages.ts` is ~887 lines and
   orchestrates content, themes, widgets, navigation, redirects, routing, SEO and media).
6. A green gate here means "has not become worse", not "is well structured".

## THE PROPOSED TARGET
A **modular monolith**: one deployable, 11 bounded contexts as **folders, not npm packages**
(`workspace`, `identity`, `content`, `site-delivery`, `engagement`, `media`, `commerce`, `extensions`,
`integrations`, `automation`, `operations`), plus a `platform/` layer for technical primitives only, plus
two real packages (`contracts` for wire schemas, `plugin-sdk` for the external plugin ABI), and separate
composition roots per app (`apps/server`, `apps/cli`, `apps/admin`).

Each context internally: `domain/`, `application/`, `ports/`, `adapters/{http-express,sqlite,memory,agent}/`,
`public/{commands,queries,events}.ts`, `module.ts`. Cross-context access ONLY via `public/`.

## THE PROPOSED SEQUENCE (~8-12 weeks, one engineer)
| Step | Work | Est. |
|---|---|---|
| 0 | Fix measurement (file-level SCCs, fixed-threshold hub measures, admin coverage, production-only boundary view) | 1-2 d |
| 1 | Retire `RouteDeps` at consumers; move dependency slices to owning modules; narrow the 7 `create*Module` constructors | 5-8 d |
| 2 | Replace the global tool registry with an aggregate assembler; convert one domain at a time | 5-7 d |
| 3 | Converge content models (introduce `ContentEntry`, migrate readers/writers, then cut legacy) — **self-described as "the main one-way door"** | 10-15 d |
| 4 | Extract site delivery; reduce Express routes to parse/call/respond | 7-10 d |
| 5 | Introduce shared wire contracts; domain-sized response mappers + admin clients | 10-15 d |
| 6 | Normalize persistence ownership context by context | 7-12 d |
| 7 | Make Jini hermetic: replace sibling `file:` deps with locked versions | 2-4 d (or 1-2 wk) |
| 8 | Physically regroup files into `modules/`, `platform/`, `apps/` | 5-8 d |
| 9 | Promote boundary violations to errors; delete compatibility shims | 2-4 d |

Explicitly: physical file moves come LAST, after dependency direction is corrected.

## THE PROPOSED "DO NOT BOTHER" LIST
- Don't lead with extracting `createApp` (a prior attempt measured only ~0.7pp gain).
- Don't funnel every import through `index.ts` — this repo's own evidence shows it RAISED propagation
  from 11.56% to 15.36%.
- Don't make each bounded context an npm package (one deployable ⇒ no operational independence bought).
- Don't split into microservices.
- Don't build a generic repository abstraction over Drizzle.
- Don't let `admin` import server or domain internals — share wire contracts only.
- Don't merge Tovu and Jini merely to fix `file:` deps.
- Don't replace the tool registry with reflection, filesystem scanning, or a DI container.
- Don't physically move hundreds of files before fixing dependency direction.
- Don't create a new generic `shared`/`common` directory.

## WHAT I WANT FROM YOU — attack these specifically
1. **Is the diagnosis right?** Is `RouteDeps` + the tool registry really the dominant defect, or is that
   a plausible-sounding story that misses the actual problem? What would the diagnosis miss?
2. **Is the target correct?** Argue against 11 contexts (too many? wrong cuts? is DDD-flavoured layering
   overkill for one maintainer and 862 files?). Is `domain/application/ports/adapters` per context
   justified here, or ceremony that will be abandoned halfway?
3. **Is the sequence right?** Especially: is putting physical moves last correct, or does it guarantee a
   long period of half-migrated code? Is Step 3 (content convergence) properly placed, or should it be
   cut entirely? Is any step misordered?
4. **Is 8-12 weeks honest** for one engineer, or optimistic by a factor? What is the realistic failure
   mode of a solo 8-12 week refactor on a pre-launch product, and what is the opportunity cost of
   spending it here rather than shipping?
5. **Is anything in "DO NOT BOTHER" actually wrong** — i.e. something dismissed that should be done?
6. **What is the strongest case for doing NOTHING** (or far less) and shipping instead? Steelman it.

## OUTPUT FORMAT
```
ACK_PACKET_RECEIVED TOVU-ARCH-DEBATE-R1-2026-08-19 -- I received the packet and will work on it.

## VERDICT: ACCEPT | ACCEPT-WITH-CHANGES | REJECT
## STRONGEST OBJECTION        (the single best argument against the proposal)
## WHERE IT IS RIGHT          (what survives your attack, and why)
## WHERE IT IS WRONG          (per item: claim -> why wrong -> what instead)
## WHAT IT MISSES ENTIRELY
## THE DO-NOTHING STEELMAN
## RANKED SLATE               (>=2 concrete options, ranked, with trade-offs, a recommendation,
                               and the CHEAPEST TEST that would de-risk your recommendation)
## CONFIDENCE + WHAT WOULD CHANGE YOUR MIND
```
Be specific and falsifiable. Cite file paths or measurements where you can. Where you are guessing, say
"guess". A confident wrong answer is worse than a hedged right one.
