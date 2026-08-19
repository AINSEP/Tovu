# Handoff — CI/CD stabilization on `general-work`

**Date:** 2026-08-19 · **Branch:** `general-work` · **HEAD:** `91cd2669` (pushed; local == remote)
**Target:** Claude Code · **Focus:** unblock GitHub billing, confirm CI green, then cut CI cost.

---

## ⛔ READ THIS FIRST — CI is blocked, and NOT by code

The last run (`32295669622`, commit `91cd2669`) failed with:

```
The job was not started because recent account payments have failed
or your spending limit needs to be increased.
```

**Zero steps executed. Both jobs died in 3–4 seconds.** This is a GitHub billing block, not a
test failure. The repo is **private** (`gh api repos/leonaburime-ucla/Tovu-AI-CMS --jq .private`
→ `true`), so Actions minutes are metered; public repos would be free.

**The tell, so you don't misdiagnose it:** `gh run list` reports plain `failure`, identical to a
real failure. Distinguish by **0 steps executed and seconds, not minutes**.

**Do NOT dispatch a fixer agent for this.** There is nothing in the codebase to fix. The owner
must raise the spending limit / fix payment in GitHub → Settings → Billing & plans. GitHub
defaults the limit to $0 on many accounts, which stops Actions the moment free minutes run out.

Usage measured today: **~426 runner-minutes across 15 runs on this branch ≈ $3.41** at
$0.008/min. Small in dollars, ~21% of a 2,000-min monthly allowance in one session.

---

## Where the code actually stands

Last **real** CI signal, run `32292815327` (commit `a4331961`):

| Job | Result |
|---|---|
| `route-coverage` | ✅ **PASSED** — all 3 gates, incl. the test-failure baseline that was red all session |
| `build-and-test` | ❌ one real failure — a deep import — **fixed in `327e6278`, verified locally** |

**All 8 gates pass locally at HEAD:** `typecheck`, `check:boundaries`, `check:architecture`,
`check:inventory`, `check:src-complexity-drift`, `complexity`, admin `typecheck`, `admin:build`.

The open question is only whether they pass on a clean checkout. We never got an uninterrupted
run to confirm — first because this session kept superseding runs with new pushes, then billing.

---

## Commits this session (all pushed)

| SHA | What |
|---|---|
| `8f65d911` | ARCH-001: exclude `.tovu-migrate-staging-*` from theme discovery **and asset serving** |
| `9b51f1a1` | `TEST_CONCURRENCY` cap, dropped a theme→server coupling edge, rebaselined architecture |
| `d98ddf8c` | Terra round-2 audit report |
| `ebbe91e6` | Fixed the 2 REAL route-coverage failures; stopped gating on file-level TAP roll-ups |
| `ba774c77` | Removed the `mui-marketing` test theme |
| `a4331961` | CI reports every gate in one run; retiered architecture metrics |
| `327e6278` | Fixed a deep import; stopped non-gate steps halting the job |
| `91cd2669` | Repo-wide failing-test visibility + `--capture` baseline seeding |

---

## Key findings worth not re-deriving

1. **Only 2 of the 10 "new" CI failures were ever real.** The other 8 were bare **file paths**, not
   test descriptions — Node's file-level TAP roll-ups. The baseline is keyed on descriptions, so a
   roll-up can **never** match and is guaranteed to report as new forever.
   `check-test-baseline.ts` had already documented this ("Known limitation: CI-runner file-level
   crashes...") and told a human to eyeball it; `isFileLevelRollup` now automates that.

2. **Both real failures were stale tests, not product bugs.**
   - Lineage test asserted lineage lives in `theme.json`; the product moved it to a
     `.tovu-lineage.json` sidecar on 2026-08-18 (a v2 manifest is `additionalProperties:false`).
   - Themes-list test's exact id list never got `mui-marketing` added.

3. **The handoff's "restricted path" warnings were wrong twice.** The duplicate-`basic` theme
   symptom and `mui-marketing` both came from **commit `39096e15` (the owner's own ESM flip)**
   sweeping scratch dirs in via a broad `git add` — not another session's live work.

4. **`ERR_WORKER_OUT_OF_MEMORY` was a red herring.** It's real in the log, but it is the *content
   of an assertion* inside `liquid-sandbox.test.ts` (which expects `/memory alloc limit exceeded/`
   and gets Node's wording), **not** a sibling-worker killer. `TEST_CONCURRENCY=2` was kept because
   it measurably helped (10→8 failures) but it is **not** load-bearing.

5. **Architecture metric tiers were inverted.** `module API surface` (count-based) caught the one
   real coupling bug; `propagation cost` / `core size` (percentage-based) produced 2 false alarms
   each — they move whenever file count moves, so **deleting dead files reads as a regression**.
   Now: count-based metrics BLOCK, ratio-based ones WARN. To restore, move labels from
   `RATCHET_METRICS` to `HARD_CONSTRAINT_METRICS` in `development/scripts/check-architecture.ts`.

6. **Local full-suite runs are a memory bomb.** `test:cov:server` fans out one worker per CPU;
   measured **5.4 GB across 13 workers**, had to be killed, and orphaned 9 children that survived
   killing the parent. **Run scoped single files locally; let CI run the full suite.**

---

## Next steps, in order

1. **Owner: fix GitHub billing.** Nothing else can proceed. To get exact usage numbers, the owner
   runs `gh auth refresh -h github.com -s user`, then
   `gh api users/leonaburime-ucla/settings/billing/actions`.

2. **Confirm CI green** on `91cd2669` once unblocked. Expect `build-and-test` to pass all 8 gates
   (all pass locally) and `route-coverage` to stay green.

3. **Read the repo-wide failing-test list.** `91cd2669` added a non-blocking
   "Repo-wide test failure report" step that prints the exact JSON to copy into
   `development/scripts/repo-test-failure-baseline.json`. That list has never been seen.

4. **Turn on the repo-wide test gate.** Commit that baseline, then add
   `npm run check:test-baseline` beside the other gates. Scripts already exist
   (`capture:test-baseline`, `check:test-baseline`) — it is a one-line workflow edit.
   `npm test` stays non-blocking; the *baseline check* is the gate.

5. **Cut CI cost (owner already approved).** ~39 → ~12 runner-minutes/run:
   - Cut or gate the `Test` step (~13 min/run — currently non-blocking and gates nothing)
   - Cache the Jini build (~7 min/run; ~210s duplicated in **both** jobs)
   - Merge `route-coverage`'s two passes (~7 min/run) — needs an lcov merge **and** TAP plumbing,
     because the combined run produces both `lcov.info` *and* `test-results.tap`
   - **Narrow the push trigger.** It is `branches: ["**"]`; every intermediate commit costs a full
     run. 5 of today's 15 runs were `cancelled` (superseded) and still billed.

---

## Constraints that bit this session — carry them forward

- **~41 uncommitted files belong to other concurrent sessions** (admin plugins, vite/vitest
  configs, ADS-memory docs). Stage explicit paths only. **Never `git add -A`.**
- **`.claude/worktrees/agent-*` is a live worktree of this repo** on another branch. `eslint .`
  recursed into it and produced a wall of phantom failures; now ignored in `eslint.config.mjs`.
- **Never bare `git stash pop`** — concurrent sessions share one stash stack.
- **Subagent corrections arrive at turn boundaries.** A stand-down message sent after dispatch
  prevented nothing; the agent had already started and collided with this session's own test run.
  Put constraints in the spawn prompt, or use `TaskStop`.
- **The 5-minute CI loop was session-only and is gone on restart.** Re-arm with `/loop`.

---

## Open judgment calls for the owner

1. **`.gitignore` now carries another session's uncommitted mkcert line**, committed by the
   ARCH-001 fixer inside `8f65d911` to avoid dropping their work. Harmless, but it's in this
   session's commit rather than theirs. Left alone deliberately.
2. **No `npm test` glob covers `development/**`** — the 8 tests there, including the new
   `check-test-baseline-rollups.test.ts`, never run in CI. Flagged, not silently widened.
3. **Making the repo public** would make Actions free entirely. Owner's call.

---

## Next-agent opening prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/reports/continuity/2026-08-19-ci-green-push-handoff.md`.
>
> CI on `general-work` is blocked by a **GitHub billing/spending-limit** issue, not by code —
> verify that first with `gh run view <latest> 2>&1 | grep -i payment`; if jobs show **0 steps
> executed in seconds**, it is still billing and there is nothing in the repo to fix. Do not
> dispatch a fixer for it.
>
> Once unblocked: confirm CI is green on `91cd2669`, then read the "Repo-wide test failure report"
> step's printed JSON, commit it as `development/scripts/repo-test-failure-baseline.json`, and add
> `npm run check:test-baseline` as a real gate. Then do the approved CI cost cuts (Jini build
> cache, merge `route-coverage`'s two passes, narrow the `push` trigger).
>
> Stage explicit paths only — ~41 uncommitted files belong to other sessions. Run scoped single
> test files locally, never the full suite (5.4 GB memory blowup).
