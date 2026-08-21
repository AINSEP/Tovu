# Repo-wide combined coverage map — RETRACTED, and what replaces it

Generated 2026-08-21 · Branch `general-work` · Coordinator (Claude Opus 5)

> # ⛔ RETRACTION — the headline of this report was WRONG
>
> This report originally claimed that `src/analytics` + `src/export` + `src/media` measured
> **89.16 line / 86.30 branch** against a handoff claim of **99.59 / 87.73 / 98.61**, and concluded the
> prior session had overstated the area.
>
> **That conclusion is retracted. The prior handoff's numbers were defensible; mine were the corrupt
> ones.** The `cov-aem` agent challenged the finding with a mechanism rather than an assertion, and on
> direct test it was right.
>
> Do not cite the area table below as coverage truth. It is retained only as evidence of the artifact.

## The decisive test

`src/media/provider-credential-store.ts` — **untouched by any agent this session**, so both runs measure
identical source. Same file, same line denominator:

```
scoped run (now)      LH 357/357 = 100.0%     esbuild shim markers in SF block: 0
combined full run     LH 294/357 =  82.4%     esbuild shim markers in SF block: 6
                      FNF 43 / FNH 29         (scoped: FNF 20 / FNH 20)
```

**A combined run executes a strict superset of a scoped run's tests. It cannot legitimately hit fewer
lines.** The combined run undercounts this file by 63 lines. That is not a coverage gap; it is a broken
measurement.

## The mechanism

In a full-repo run, an affected source file is instantiated **twice under two module formats** — once as
native ESM (real, exercised) and once through a CJS `require()`/interop path (never exercised) — and
both are merged into a **single `SF:` block**. The tell is esbuild's CJS-interop runtime helpers
appearing inside the block: `__toCommonJS`, `__copyProps`, `__toESM`, `__export`.

The two axes corrupt differently, which is why this was hard to see:

| axis | how the reporter merges | effect |
|---|---|---|
| `FN:`/`FNDA:` | **concatenates** — same name appears 2–8× | `FNF` inflated, ratio deflated |
| `DA:` (lines) | **merges by line number** (487 entries, 487 unique — no duplicates) | denominator correct, but zero-hit shadow entries win, so **`LH` is deflated** |
| `BRDA:` | keyed by line+block+branch | partially resistant, not proven clean |

`src/media/index.ts` is the clean smoking gun. It is a **pure re-export barrel** — `export { X } from
"@jini-ai/cms/media"`, zero function bodies. Its scoped lcov correctly reports `FNF:0`. The combined
lcov lists `__export`, `__copyProps`, `get`, `__toCommonJS`, then one synthetic getter per re-exported
symbol — which produced the "**38 missing functions**" I sent an agent to go fix. There was nothing
there to test.

### What it is NOT

Ruled out by direct test: the `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json` override (open question
§6 in the prior handoff) is **not** the cause. Re-running the scoped media suite with that variable
set reproduces the clean numbers exactly — `LH 357/357`, 0 shim markers. It was the obvious suspect,
since it forces `module: ESNext` onto tests that would otherwise resolve `nodenext`. It is innocent here.

The remaining suspect is a consumer elsewhere in the full-repo test set pulling Tovu source through a
CJS path — note the lcov's very first entry is `SF:../Jini/packages/agent-runtime/dist/acp-model-probe.js`,
i.e. **built Jini `dist/` output**. Not proven; do not repeat as fact.

## ✅ The decision rule this produces

The prior handoff's trap #2 said *"a scoped run understates coverage — trust the combined run."* That is
**true for some files and actively wrong for others.** Both failure modes are real and they point in
opposite directions:

```
Grep the file's SF: block in the combined lcov for
__toCommonJS | __copyProps | __toESM | __export

  markers PRESENT  -> the combined number for that file is CORRUPT.
                      Use the SCOPED number.
  markers ABSENT   -> combined is trustworthy. If the scoped number is
                      0% or implausibly low, the scoped run simply never
                      loaded it — trust combined. (seo/tool-registrations.ts:
                      0% scoped vs 99.62% combined.)
```

**Never quote an area aggregate from either run without applying this per file first.** Every per-area
figure in the table below predates this rule and none of it has been re-derived.

### Marker presence flags RISK, not MAGNITUDE

Do not short-circuit the rule by counting markers. On the line axis the corruption's severity is
file-dependent even at identical marker counts (found by `cov-aem`):

| file | shim markers | combined line | scoped line | delta |
|---|---:|---|---|---|
| `media/provider-credential-store.ts` | 6 | 294/357 | 357/357 | **−63** |
| `export/site-exporter.ts` | 6 | 762/764 | 762/764 | 0 |
| `export/route-manifest.ts` | 6 | 306/307 | 307/307 | −1 |

Same marker count, wildly different damage. The grep tells you *"cross-check this file against a scoped
run"* — it does not tell you how wrong the number is, and it cannot be used to estimate a correction.

### A third, separate misreport: empty-body error classes

Found by `cov-core-db`. `class X extends Error {}` with **no explicit constructor** gets **no `FN:`
entry at all** in some transpilation contexts, while a class *with* a constructor does. Consequence: a
scoped lcov omits such a class entirely while a combined lcov lists it at zero — so it reads as
"nonexistent" in one run and "never covered" in the other. Three of four checked
(`PlanStaleError`, `TokenAlreadyRedeemedError`, `TokenExpiredError`) were being constructed and thrown
by passing tests the whole time. The fourth, `UnauthenticatedError`, has **zero throw sites anywhere**
and its doc comment reserves it for a future caller — leave it: unreachable here is a property of
today's callers, not of the class.

That makes **three distinct misreport mechanisms** in this one tool: `FN:` concatenation,
dual-instantiation line deflation, and missing `FN:` entries for constructor-less error classes.

## How widespread: 89% of the repo

The marker rule was applied to every source file in the combined lcov:

```
769 source files
   88 CLEAN  (11%) — combined number trustworthy
  681 SHIM-MARKED (89%) — combined number suspect
```

Share of files suspect, by area:

| 100% suspect | high | clean |
|---|---|---|
| `widgets`, `newsletter`, `redirects`, `forms`, `members`, `seo`, `connectors`, `media`, `origin`, `export`, `identity`, `navigation`, `routing`, `mail`, `packages/sdk` | `server` 97%, `core` 95%, `comments` 93%, `webhooks` 92%, `features` 84%, `analytics` 83%, `db` 82%, `assistant` 78% | `cli` 0/13, `apps/site-chat` 0/6, `http` 0/2 |

### ⇒ A full-repo `test:cov` run is not a usable per-file measurement tool for this repo

Not "needs a caveat" — **not usable**, for 89% of files, with a per-file error magnitude that cannot be
estimated from the marker count. **Scoped, per-area runs are the only trustworthy source.** They are also
the cheap, memory-safe ones (~2–3 min and a few hundred MB, vs 35 min and 2.7 GB).

The "one big run, share the results with every agent" strategy this session opened with was wrong on the
merits. Two agents caught it; the coordinator did not.

### The 88 clean files suggest the repo is in good shape

Their *worst* line coverage is 74.4% (`cli/commands/theme/generate-index.ts`, 11 missing) and nearly all
sit above 96%. Nothing in the clean set looks like a coverage emergency.

### Two corrupt claims this report made, now withdrawn

1. **"analytics/export/media is 10 points below the handoff's number."** Withdrawn — retracted above.
2. **"11 areas no handoff ever named, and `identity` (55.53% line) / `navigation` (51.55% func) are worse
   than anything currently queued."** Withdrawn. Both areas are **100% shim-marked**, so those figures are
   corrupt. The *observation* that 11 areas have never been named by any handoff still stands and is worth
   acting on — but their coverage must be measured with scoped runs before anyone ranks them.

## Corroborating agent findings

- `cov-aem`: all 14 AEM source files show **exactly 6 shim marker lines each** — a 100% hit rate,
  uniform across the run. Its own scoped lcov shows **0** for every file spot-checked. It verified
  `ingest.ts` has 27 functions total, all real, all tested — against my claim of 25 missing.
- `cov-core-db`: independently found the `FN:` duplication, and decomposed `src/db/schema.ts`'s 301 raw
  `FN` entries exactly: 79 esbuild `__export()` getters, 74 Drizzle FK-closures, 144 anonymous
  column/check/index builders, 3 CJS-interop helpers. **Zero behavioral functions.** It also deduped the
  ~20 sqlite repos and found **17 of 20 are already 92–100% covered**; only 3 are genuinely untested
  (`composio-connector-credential-repo`, `custom-credential-repo`, `external-mcp-repo`).

Both agents challenged the coordinator's numbers with reproducible mechanism. Both were right.

## What still stands from the original run

- **Only 2 tests failed** repo-wide. One is real and confirmed in isolation: the
  `readTemplate('starter').seed` byte-equivalence drift (see below). The other is a `tovu serve` cwd
  test that took 69.7 s under four-way CPU contention — probably load flake, unclassified.
- `development/scripts/repo-test-failure-baseline.json` is referenced by the `check:test-baseline` npm
  script but **does not exist on disk**, so that gate cannot currently pass.
- `npm run test:cov` begins with `rm -rf development/coverage`. A concurrent second invocation
  **destroys the first run's output**.
- Wall clock for a full `test:cov`: ~35 min. Peak RAM ~2.7 GB with three agents also running, at
  `TEST_CONCURRENCY=2`.
- Seed drift: `src/server/seed.ts` has a code block (`"static tier"`, 2 hits) that
  `src/templates/starter/seed-content.json` lacks (0 hits). Commit `8c7effea` (Aug 19) changed one and
  not the other — and `0f0de930`, *the same day*, was titled "resync stale theme/seed drift." Fixed,
  then re-broke within hours. There is no generator; both files are hand-maintained.

## Area table — RETAINED AS ARTIFACT EVIDENCE ONLY, NOT COVERAGE TRUTH

Every `func` figure here is inflated-downward by `FN:` concatenation. Every `line` figure is
deflated for any file carrying shim markers. Neither column has been re-derived under the decision
rule above.

| Area | src files | line | branch | func |
|---|---:|---:|---:|---:|
| `src/server` | 308 | 76.15 | 79.63 | 79.17 |
| `src/features` | 178 | 85.45 | 87.79 | 66.06 |
| `src/assistant` | 50 | 89.92 | 90.59 | 69.95 |
| `src/db` | 34 | 81.34 | 88.18 | 59.23 |
| `src/widgets` | 25 | 80.86 | 87.17 | 70.91 |
| `src/core` | 21 | 86.79 | 90.84 | 73.87 |
| `src/newsletter` | 16 | 63.74 | 87.25 | 65.86 |
| `src/comments` | 15 | 77.60 | 85.71 | 77.02 |
| `src/cli` | 13 | 97.21 | 75.89 | 92.65 |
| `src/redirects` | 12 | 74.57 | 83.86 | 70.42 |
| `src/webhooks` | 12 | 77.49 | 88.97 | 69.73 |
| `src/forms` | 11 | 69.32 | 90.12 | 72.43 |
| `src/members` | 11 | 69.60 | 87.32 | 66.31 |
| `src/seo` | 10 | 84.07 | 85.27 | 75.08 |
| `src/site-dir` | 10 | 95.30 | 93.62 | 77.46 |
| `apps/site-chat` | 6 | 100.00 | 99.45 | 100.00 |
| `src/analytics` | 6 | 83.79 | 86.36 | 69.29 |
| `src/connectors` | 6 | 84.48 | 87.44 | 70.83 |
| `src/media` | 5 | 81.43 | 94.30 | 59.87 |
| `src/origin` | 4 | 86.70 | 93.01 | 83.33 |
| `src/export` | 3 | 99.72 | 82.42 | 92.75 |
| `src/identity` | 3 | 55.53 | 89.17 | 60.51 |
| `src/navigation` | 3 | 58.55 | 88.06 | 51.55 |
| `src/http` | 2 | 89.87 | 86.08 | 77.78 |
| `src/routing` | 2 | 89.94 | 86.61 | 78.75 |
| `packages/sdk` | 1 | 99.26 | 90.00 | 100.00 |
| `src/mail` | 1 | 75.71 | 88.89 | 69.57 |

The one genuinely new thing this table contributed, which survives the retraction: **11 areas no prior
handoff had ever named** — `newsletter`, `identity`, `navigation`, `members`, `forms`, `comments`,
`redirects`, `webhooks`, `connectors`, `mail`, `http`. Their *relative* standing is suggestive, but every
number must be re-measured per the decision rule before anyone acts on it.

## Consequences for the unwired coverage floor gate

`development/scripts/check-area-coverage-floor.ts` is committed, unwired, and exits 1 unconfigured.
**Do not capture floors from a full-repo run.** The prior handoff's advice — "capture floors from a FULL
run, never a scoped one" — is now known to be unsafe on its own: a full run under-reports both line and
function coverage for any dual-instantiated file, so floors captured from it would be too low there
and the gate would fail to catch real regressions. Apply the shim-marker rule per file first.
