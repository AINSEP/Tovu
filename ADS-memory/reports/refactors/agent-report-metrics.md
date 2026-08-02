# Agent report — architecture metrics ratchet

**Date:** 2026-08-02 · **Branch:** `refactor/jini-admin-extraction`
Work by the `metrics` Sonnet subagent; API-surface metric split and verification completed by the coordinator.

Context: `2026-08-02-module-graph-analysis.md` (evidence + plan), `RESUME-architecture-refactor.md` (live state).

---

## What shipped

`npm run check:architecture` → `development/scripts/check-architecture.ts`, ratcheted against
`check-architecture.baseline.json`, **blocking** in `.github/workflows/ci.yml`.

Supersedes the short-lived `check:module-cycles` (created and wired earlier the same session but
never committed, so it was removed with a plain `rm`).

### Metrics

| # | metric | value | ratcheted? |
|---|---|---|---|
| 1 | propagation cost | 10.77% | yes |
| 2 | back-edges into composition root | 44 | yes |
| 3 | module cycles (mutual pairs) | 23 | yes |
| 3b | largest strongly-connected component | 33 of 38 | yes |
| 4 | module API surface (distinct files exposed) | 213 | **yes** |
| 4b | deep-import edges bypassing `index.ts` | 766 | no — informational |
| 5 | core size | 12.59% (84/667) | yes |
| 6 | Martin instability per module | gradient table | no — informational (`--list`) |

Metrics 2 and 3 are trending down live as the concurrent `tool-registrations` refactor lands
(53→44 back-edges, 30→23 cycles during this session).

### Why 4 and 4b are split

The agent's original implementation ratcheted the **edge** count (766). That was changed to ratchet
**distinct exposed files** (213) instead:

- 213 is the actual public API surface — precisely what a package `exports` map would have to enumerate. It is the number being driven toward zero.
- Ratcheting edges would fail CI when a legitimate refactor adds a second import to an *already-exposed* file, which widens nothing. Exposing a *previously private* file is what must fail.

766 is still computed, printed, and stored in the baseline — it is the better signal for *locating*
where coupling concentrates, just the wrong thing to block on.

An earlier draft of the analysis doc cited "~140" here. That was a sum over a partial per-module
table, not a full-graph computation. Do not try to reproduce it. Corrected in commit `99d9f04`.

---

## Bug found and fixed before the numbers were locked

`@jini-ai/*` dependencies resolve via `file:../Jini/packages/*`, so they are **not** under a
`node_modules` path segment — `--do-not-follow node_modules` does not exclude them. Combined with
`--ts-pre-compilation-deps` (which records every resolved file as a "module"), dependency-cruiser
was pulling **the sibling Jini repo's compiled `dist/*.js` output** into Tovu's graph, along with
Node builtins.

Effect: file graph inflated to 980 nodes instead of 667, silently corrupting both BFS-based
metrics — propagation cost read 7.65% and core size 13.16%, both wrong.

Fixed by scoping `buildFileGraph` to `src/**` on both the source and resolved-target side.
Documented inline so it is not reintroduced. Post-fix values converge with the independent one-off
measurement from the original analysis (11.0% propagation, 84/667 core) — two separate
implementations agreeing.

**Anything that measures this repo must scope to `src/**` explicitly.** Path-prefix filtering is
not optional here.

---

## Ratchet-bites proof

A gate that cannot fail is worse than none, so this was verified rather than assumed.

Baseline perturbed to better-than-actual values (`propagationCostPct` 5, `backEdgesIntoServer` 10,
`deepImportsBypassingIndex` 100, `coreSize.pct` 5, `largestScc` 10, one real pair removed from
`moduleCycles.pairs` to simulate a new cycle). Plain run output:

```
module cycles — 1 new pair(s) introduced:
    + seo <-> server
largest strongly-connected component grew: 10 → 33
propagation cost regressed: 5 → 10.97
back-edges into composition root regressed: 10 → 51
deep imports bypassing index.ts regressed: 100 → 766
core size regressed: 5 → 12.59
check:architecture — FAILED: 5 metric(s) regressed against the baseline.
```

Re-verified after the API-surface split, including that the informational metric does **not** gate:
with `moduleApiSurfaceFiles` set to 150 **and** `deepImportsBypassingIndex` set to 100, only the
former was reported:

```
module API surface (files exposed) regressed: 150 → 213
check:architecture — FAILED: 1 metric(s) regressed against the baseline.
```

True exit codes confirmed without a pipe swallowing them:

```
exit code on regression: 1
exit code at baseline:   0
```

Baseline restored from backup and regenerated afterward.

---

## Verification

- `--list` — six metrics, back-edges grouped by target file, cycle/SCC list, deep imports grouped by target module, Martin gradient sorted stable→unstable
- `--update` — writes baseline
- plain run — exit 0 at baseline, exit 1 on regression
- `npm run check:architecture` — exit 0
- `npm run typecheck` — clean. Note `tsconfig.json` only includes `src/**/*.ts`, so it does **not** cover `development/scripts/*.ts` (same gap the previous script had); a standalone `tsc --noEmit` with matching options was run against the new file separately and is clean.

Nothing under `src/` was modified. `check:boundaries` and `check:inventory` remain non-blocking.

---

## Process note

Two `SendMessage` deliveries to this agent (the API-surface decision, and instructions to write
this report and commit) never arrived — it re-raised a question already answered and finished
without committing. The coordinator completed both directly. Treat subagent mailbox delivery as
unreliable: put everything essential in the original dispatch prompt.
