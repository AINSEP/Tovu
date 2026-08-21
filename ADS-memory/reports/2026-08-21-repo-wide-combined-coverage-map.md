# Repo-wide combined coverage map — first full measurement

Generated 2026-08-21 · Branch `general-work` · Coordinator (Claude Opus 5)

Source: a single full-repo `npm run test:cov` run (`TEST_CONCURRENCY=2`), started 19:47, finished
20:22 local. lcov snapshot: 5.5 MB, 1823 `SF:` entries. This is the **combined** number — every
suite in the repo loaded together — which is the only trustworthy basis for an area coverage claim.

## Why this document exists

The 2026-08-20 handoff reported `src/analytics` + `src/export` + `src/media` at
**99.59 line / 87.73 branch / 98.61 func** and marked the area ✅ done.

The owner said that was wrong. It is.

```
                          LINE     BRANCH     FUNC
handoff claim            99.59      87.73    98.61
combined truth           89.16      86.30    73.49    (14 source files)
```

**Function coverage is 73.49%, not 98.61% — a 25-point gap.** Branch is roughly as advertised;
line and function are not.

Recomputing the same aggregate *including* test files as covered units gives 94.42 / 89.46 / 82.30 —
still not the handoff's number, so "they counted test files" does not explain it either.

### The likely mechanism — and the trap to record

A scoped run's lcov **omits files it never loaded**. Averaging over only the files that appear
therefore *inflates* the aggregate: a file with zero coverage is not counted as 0%, it is not
counted at all.

This is the **mirror image** of the trap already recorded in the handoff:

| Trap | Effect on a single file | Effect on an area aggregate |
|---|---|---|
| Known: "a scoped run understates coverage" | a well-covered file reads low | — |
| **New: a scoped run omits unloaded files** | file is absent entirely | **aggregate reads too high** |

Both are true at once, which is why scoped runs are untrustworthy in *both* directions. A full-repo
run loads strictly more code than any scoped run, so where the two disagree, prefer the full run.

Caveat, stated plainly: the prior session's lcov artifacts were not available, so the mechanism above
is the best-supported explanation, not a proven one. What is proven is the disagreement and which
side to trust.

## Area map — source files only (excludes `__tests__` and `*.test.ts`)

| Area | src files | line | branch | func | missing L/B/F |
|---|---:|---:|---:|---:|---|
| `src/server` | 308 | 76.15 | 79.63 | 79.17 | 8353/1820/1200 |
| `src/features` | 178 | 85.45 | 87.79 | 66.06 | 5619/891/1609 |
| `src/assistant` | 50 | 89.92 | 90.59 | 69.95 | 1142/182/354 |
| `src/db` | 34 | 81.34 | 88.18 | **59.23** | 1736/146/506 |
| `src/widgets` | 25 | 80.86 | 87.17 | 70.91 | 942/125/192 |
| `src/core` | 21 | 86.79 | 90.84 | 73.87 | 378/59/121 |
| `src/newsletter` | 16 | **63.74** | 87.25 | 65.86 | 1282/96/226 |
| `src/comments` | 15 | 77.60 | 85.71 | 77.02 | 487/66/71 |
| `src/cli` | 13 | 97.21 | 75.89 | 92.65 | 30/27/5 |
| `src/redirects` | 12 | 74.57 | 83.86 | 70.42 | 573/82/113 |
| `src/webhooks` | 12 | 77.49 | 88.97 | 69.73 | 476/43/89 |
| `src/forms` | 11 | 69.32 | 90.12 | 72.43 | 559/41/83 |
| `src/members` | 11 | 69.60 | 87.32 | 66.31 | 858/70/158 |
| `src/seo` | 10 | 84.07 | 85.27 | 75.08 | 281/75/77 |
| `src/site-dir` | 10 | 95.30 | 93.62 | 77.46 | 38/9/16 |
| `apps/site-chat` | 6 | 100.00 | 99.45 | 100.00 | 0/1/0 |
| `src/analytics` | 6 | 83.79 | 86.36 | 69.29 | 188/30/43 |
| `src/connectors` | 6 | 84.48 | 87.44 | 70.83 | 154/27/49 |
| `src/media` | 5 | 81.43 | 94.30 | **59.87** | 127/9/61 |
| `src/origin` | 4 | 86.70 | 93.01 | 83.33 | 50/10/15 |
| `src/export` | 3 | 99.72 | 82.42 | 92.75 | 3/58/10 |
| `src/identity` | 3 | **55.53** | 89.17 | 60.51 | 354/17/77 |
| `src/navigation` | 3 | 58.55 | 88.06 | **51.55** | 172/8/47 |
| `src/http` | 2 | 89.87 | 86.08 | 77.78 | 32/11/4 |
| `src/routing` | 2 | 89.94 | 86.61 | 78.75 | 47/15/17 |
| `packages/sdk` | 1 | 99.26 | 90.00 | 100.00 | 1/2/0 |
| `src/index.ts` | 1 | 93.50 | **40.00** | 71.43 | 24/9/2 |
| `src/mail` | 1 | 75.71 | 88.89 | 69.57 | 17/3/7 |

**Function coverage is the repo's weakest axis almost everywhere**, and it is the axis the prior
handoff most overstated. `src/features` alone is missing 1609 functions.

### Areas the prior handoffs never named at all

`src/newsletter`, `src/identity`, `src/navigation`, `src/members`, `src/forms`, `src/comments`,
`src/redirects`, `src/webhooks`, `src/connectors`, `src/mail`, `src/http`. Several are worse than
areas already queued for work — `src/identity` at 55.53% line and `src/navigation` at 51.55% func
are both below anything currently being worked on.

## Two test failures in the full run

Only 2 of the whole suite failed. Neither is baselined: `development/scripts/repo-test-failure-baseline.json`
is referenced by the `check:test-baseline` npm script but **does not exist on disk** — so there is no
known-failure list to compare against, and `check:test-baseline` cannot currently pass.

1. `readTemplate('starter').seed is byte-equivalent to server/seed.ts's current live output`
   — a seed-drift guard. Commit `0f0de930` ("resync stale theme/seed drift") shows this has drifted
   before. **Probably a real regression, not a flake.** Needs isolated confirmation.
2. `CR-R04/CR-R01 (systemic gap): tovu serve spawned from a DIFFERENT cwd ...` — took **69.7 s**.
   Spawns a real `tovu serve`. Ran while three agents plus this coverage run competed for CPU.
   **Probably CPU-starvation flake**, matching the ~20 admin files previously confirmed as such.
   Needs an isolated re-run to classify.

## Artifacts

- lcov snapshot: `<scratchpad>/full-repo.lcov` (session-local, not committed — regenerate with
  `TEST_CONCURRENCY=2 npm run test:cov`)
- Run log: `<scratchpad>/full-cov.log`

## Rules confirmed by this run

- `npm run test:cov` begins with `rm -rf development/coverage`. A second concurrent invocation
  **destroys the first run's output**. Only one full run at a time, owned by the coordinator.
- Peak memory with the full run plus three agents doing scoped work: **2.7 GB**. The documented OOM
  threshold is ~5.4 GB (unbounded concurrency). `TEST_CONCURRENCY=2` held it comfortably.
- Wall clock for a full `test:cov`: **~35 minutes**.
