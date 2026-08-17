# `src/server/routes` complexity gate — 2026-08-17

**Status: COMPLETE.** Gate + debt list built, wired into `npm`, unit-tested, verified green. CI
wiring is NOT done by this agent — see the exact YAML step for `ci-pipeline` at the bottom.

Dispatched as `src-complexity-gate` in response to item 9 of the 2026-08-16 session-8 handoff and
§1 of `ADS-memory/reports/2026-08-16-server-routes-coverage-complexity-audit.md` (70/234 route
files, 113 functions, violated a ≤9 cognitive/cyclomatic bar; no gate existed on `src/` at all).

## What was built

| File | Purpose |
|---|---|
| `development/scripts/check-src-complexity-drift.ts` | The drift checker (exported pure functions + guarded `main()`) |
| `development/scripts/src-complexity-debt.json` | The baseline — 115 violations across 72 files, structured JSON |
| `development/scripts/__tests__/check-src-complexity-drift.test.ts` | 9 unit tests on the multiset diff logic |
| `package.json` | Added `"check:src-complexity-drift": "tsx development/scripts/check-src-complexity-drift.ts"` |

Run it: `npx tsx development/scripts/check-src-complexity-drift.ts` or `npm run check:src-complexity-drift`.
Exit 0 = clean (verified at time of writing). Exit 1 = a violation exists outside the baseline.

## Scope decision — `src/server/routes/**` only, not all of `src/`

The brief's title says "gate on `src/`," but every number in it (70/234, 113 functions, the ≤9 and
≤15 breakdowns, the worst-offender list) comes from the 2026-08-16 audit, which only measured
`src/server/routes/**` (234 route files). There is no fresh measurement of `src/` as a whole. I
scoped the gate to exactly what was measured rather than guess at a broader number — extending to
the rest of `src/` is a real, separate follow-up (it would need its own baseline capture first, the
same way this one did) and is called out as such in the checker's own header. This mirrors
`apps/admin`'s existing gate, which is also scoped to `apps/admin/src`, not the whole admin app.

## Design — same tool as `apps/admin`, different diff strategy

**Tool and threshold**: identical to `apps/admin`'s hard gate — plain ESLint `complexity`
(cyclomatic) and `sonarjs/cognitive-complexity`, both hard-overridden to `error`/9 via `--rule`,
ignoring `eslint.config.mjs`'s repo-wide `warn`/15. Per-function, no custom AST folding, no
nesting-fold — same "two complexity metrics on `apps/admin`" trap flagged in the brief does not
apply here because there is only ever one tool measuring `src/server/routes`. Documented explicitly
in the baseline JSON's own `_comment` so a future reader doesn't have to reverse-engineer it.

**Diff strategy**: `apps/admin`'s precedent (`check-admin-complexity-drift.ts`) tracks debt as a
**file-level `Set`** — "does this file have any complexity violation." I did NOT copy that; the
brief's design constraint (mirroring Jini's `scripts/check-guard-drift.ts`) called for a
**multiset keyed on `(rule, file, reason)`**, and this repo's own data proves why that matters, not
just Jini's: `src/server/routes/admin/widgets/agent-tools.ts` genuinely carries **two**
textually-identical `complexity` violations right now — two different anonymous async arrow
functions, both "Async arrow function has a complexity of 10. Maximum allowed is 9." A Set collapses
those to one membership bit; `check-src-complexity-drift.ts`'s `diffAgainstBaseline` counts
occurrences per key and only flags a violation as new once the current count for that key exceeds
what the baseline allows, in both directions (`added` fails the gate, `removed` is reported as a
prompt to shrink the baseline, never fails).

**Baseline provenance**: captured from the checker's own `findViolations()` — structured JSON
straight from `eslint -f json`, never scraped from human-readable stdout — not typed by hand, not
copied from the audit's prose counts.

## Proof the multiset design constraint is load-bearing, not decorative

`development/scripts/__tests__/check-src-complexity-drift.test.ts` has 9 tests. The first two are
the load-bearing ones:

1. **RED-first, verified by hand**: I temporarily swapped `diffAgainstBaseline`'s body for a naive
   `Set`-based version (presence-only), reran the suite, and got 3 real failures — including the
   exact "3rd identical `agent-tools.ts` violation slips through as already-known" case. Then I
   restored the real multiset implementation from a backup and reran: 9/9 green. I did not just
   assert this would happen — I watched it fail, then watched it pass.
2. `agentToolsViolation()` in the test file is not an invented fixture — it's the literal
   `(rule, file, reason)` triple from the real, current `agent-tools.ts` duplicate, confirmed by a
   live scan.
3. Remaining tests cover: exact-match no-drift, fewer-in-current → `removed` not `added`, entirely
   absent from either side, and that `rule` and `file` are both real parts of the identity (two
   violations sharing a `reason` string but differing only in `rule`, or only in `file`, must not
   collide).
4. A final smoke test diffs the real `src-complexity-debt.json` against itself and asserts zero
   drift either direction — the same invariant `main()` depends on.

Command used throughout (scoped, not the full suite, per standing policy):
`node --import tsx --test development/scripts/__tests__/check-src-complexity-drift.test.ts`

## The baseline moved TWICE while this was being built — expected, not a bug

Per the brief's own warning ("expect the numbers to move under you"): the audit's original count
(2026-08-16) was 113 violations / 70 files. My first fresh scan (2026-08-17, HEAD `af5af566`) found
115 / 71. By the time I captured the **final** baseline actually shipped in this commit (HEAD
`f23f2d3b`), `route-quality` had refactored `test-agent.ts` — pulling `resolveTestAgentOutcome` out
into a new file `resolve-test-agent-outcome.ts` — landing at 115 / **72**. I re-captured from a
fresh run each time rather than patch the numbers by hand, and the final capture is the one
committed. **This baseline should be assumed stale again by the time anyone reads this** — the
`_comment` in `src-complexity-debt.json` says so explicitly and gives the re-run command.

## `npm run complexity` — verified, and it is currently RED, for reasons unrelated to this task

The brief asked me to verify this stays green. I ran it twice (the first run hit a transient
`ENOENT: .../process.served.js` — a race from a concurrent agent's process, gone on retry). The
**second run is real and reproducible**: exit 1, "2 errors, 229 warnings." Neither error is caused
by this task or touches a file I own:

1. `apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts:37` —
   `createFakeOtherCredentialsPort` has complexity 17, over `apps/admin`'s existing ≤9/9 gate, and
   is **not** listed in `admin-complexity-debt.json`. Committed at `b440a007` ("feat(security): one
   list, all 8 credential stores + category filter"). This is `apps/admin`'s OWN pre-existing gate
   catching a real, already-committed violation that was never added to its debt list — nothing to
   do with `src/server/routes`. Owned by `source-control-ui`/`assistant-selfheal` per this session's
   file-ownership map; I did not touch it.
2. `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts:208` — a genuine
   TypeScript **syntax error**, not a lint nitpick: `for (const config: StaticPublishConfig of
   [...])`. A `for...of` loop variable has never been allowed to carry a type annotation in
   TypeScript; this would also fail `tsc`. Committed at `7aa04821` ("fix(deployments): make
   publishStaticSite's 'Never throws' contract actually true"). Owned by `routedeps-vendor`; I did
   not touch it.

**I am flagging both to the Coordinator as pre-existing, out-of-scope defects — not fixing them
myself.** Fixing either would mean editing files explicitly on my DO-NOT-TOUCH list. If the
Coordinator wants `npm run complexity` green again, route #1 to whoever owns
`admin-complexity-debt.json` right now and #2 to `routedeps-vendor`.

**Important scoping note**: my new gate (`check:src-complexity-drift`) is a SEPARATE script from
`npm run complexity` — it is not wired into that script, and neither of the two errors above is a
`src/server/routes` complexity finding. `check:src-complexity-drift` itself is green (verified
above). The two are independent gates; only `npm run complexity`'s exit code is affected by the
findings in this section.

## Requested CI step — for `ci-pipeline` to add

I do not own `.github/workflows/**`. Requesting this step be added, ideally right after (or
alongside) the existing `check:admin-complexity-drift` step if one exists in the workflow already:

```yaml
      - name: Check src/server/routes complexity drift
        run: npm run check:src-complexity-drift
```

No new setup needed — it's plain Node/tsx, same runtime as every other `check:*` step already in
the pipeline, and it does not depend on `test:cov` or any other step's output (unlike the route
coverage gates, it runs a fresh ESLint scan itself). Safe to run in parallel with other `check:*`
steps if the workflow parallelizes them.

## What I did NOT do (scope boundary, as instructed)

- Did not fix any of the 115 violations. Not one file in `src-complexity-debt.json` was touched.
- Did not touch `apps/admin/src/features/security/hooks/other-credentials-dependencies.hooks.ts` or
  `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts` (both out of scope, both
  reported above instead).
- Did not edit `.github/workflows/**` — the YAML above is a request, not a commit.
- Did not touch `check-architecture.ts` or its baseline, `src/server/modules/assistant.ts`,
  `src/assistant/daemon-*.ts`, `src/integrations/repo.sqlite.ts`,
  `src/features/database/adapter.sqlite.ts`, `src/features/*/tool-registrations.ts`,
  `src/features/vendor-credentials/**`, `src/features/deployments/**` (beyond reading the one file
  above), `src/server/routes/**` (read-only — scanned, never edited), `src/core/embeds/marker.ts`,
  `apps/admin/**` (beyond reading the one file above), or anything under `/Users/la/Programming/Jini`
  (beyond reading `check-guard-drift.ts` and `guard-baseline.json` as the explicitly-named
  reference pattern).
- `package.json`: only added the one script line. No other script was touched or reordered.

## Verification log

- `npx tsx development/scripts/check-src-complexity-drift.ts` → exit 0, "0 new complexity
  violations (115 total, 115 in baseline)."
- `npm run check:src-complexity-drift` → same, confirms the npm wiring works.
- `node --import tsx --test development/scripts/__tests__/check-src-complexity-drift.test.ts` →
  9/9 pass, after an observed RED run against a deliberately-broken (naive Set) implementation.
- `npm run complexity` → exit 1, two pre-existing findings unrelated to this task, both reported
  above with exact file/line/commit.
