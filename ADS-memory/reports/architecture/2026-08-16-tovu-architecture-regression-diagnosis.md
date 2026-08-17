# Architecture Regression Diagnosis — `check:architecture` FAIL, 2026-08-16

**Author:** Software Architect agent (diagnose-only dispatch)
**Scope:** Why `npm run check:architecture` is failing right now on `general-work`, and whether today's session caused it.

## TL;DR

**No, this session did not cause the failure.** All three metrics that are blocking the gate — propagation cost (7.6% → ~29%), the 6 new/6 removed module-cycle pairs, and the largest-SCC growth (33 → 35) — were **already present, byte-for-byte identical, at `0261491e`**, the commit that was `HEAD` before this session's first commit. I proved this by running the check in an isolated worktree at `0261491e` and diffing it against a worktree at current `HEAD` (`ae404ba6`).

The baseline itself is **767 commits / 6 days stale** (last moved 2026-08-10, commit `e8688e15`; 748 of those 767 commits predate this session). The regression is accumulated drift from that gap, not something introduced today.

This session's own measured contribution is small, isolated to one metric, and defensible:
- `back-edges into composition root`: **+2** (27 → 29), both from wiring the same shared process-error guard into two entry points (`src/index.ts` and `src/assistant/agent-daemon-server.ts`) — a legitimate shared-module pattern, not a coupling smell.
- `module API surface`: **+1** file exposed (the guard module itself).
- Propagation cost and core size actually **improved slightly** this session (new near-isolated files dilute the mean).
- The new `features/vendor-credentials` module landed with **zero** cross-module edges (`Ca=0, Ce=0`) — its author's claim that none of its files import `assistant`, `server`, or `export` is **verified true**, at both file grep and module-graph level.

## 1. Did this session cause it? — **No** (Partly, on one sub-metric only)

**Method:** `HEAD` at session start was `0261491e`. I created two throwaway `git worktree`s (not checkouts in the shared main tree, which other agents are actively committing to) — one detached at `0261491e`, one at current `HEAD` `ae404ba6` — symlinked `node_modules` into each (no `npm ci`, no `--update`, no edits to production source), and ran `npx tsx development/scripts/check-architecture.ts --list` in both.

| Metric | `0261491e` (pre-session) | `ae404ba6` (now) | Session delta |
|---|---|---|---|
| propagation cost | 29.26% | 29.05% | **−0.21 pts (improved)** |
| back-edges into composition root | 27 | 29 | **+2 (regressed)** |
| module cycles (mutual pairs) | 13 | 13 | 0 |
| new cycle pairs vs. baseline | 6 (see below) | same 6 | **0 — identical set** |
| removed cycle pairs vs. baseline | 6 (see below) | same 6 | 0 |
| largest SCC | 35 | 35 | 0 |
| module API surface | 201 | 202 | **+1 (regressed)** |
| deep-import edges | 529 | 531 | +2 |
| core size | 7.99% | 7.96% | −0.03 pts (~flat) |
| files / modules | 826 / 47 | 829 / 48 | +3 files, +1 module |

A full `diff` of the two `--list` runs (kept at `/Users/la/.claude/harness-tmp/.../scratchpad/check-session-start.txt` and `check-head.txt` for this run) shows **every single line that changed** and each is fully explained below. Nothing else moved.

The +3 files are exactly: `src/features/vendor-credentials/aad.ts`, `src/features/vendor-credentials/types.ts`, and `src/server/boot/process-error-guards.ts` (test files are excluded from the metric by design). The +1 module is `features/vendor-credentials` itself, appearing with `I=0.00, Ca=0, Ce=0` — no edges in or out at the module level at all.

The +2 back-edges and +1 API-surface file are both explained by one new entry that appears only in the `HEAD` run: `2 → src/server/boot/process-error-guards.ts`. That file is imported from `src/index.ts` (module `index.ts`, `Ce` 11→12) and from `src/assistant/agent-daemon-server.ts` (module `assistant`, `Ce` 49→50) — the two process entry points that both needed the same crash guard installed, per commits `650b92f6` and `6fbaab16`. That's a legitimate "shared module, two callers" pattern, not a new architectural smell — the alternative (duplicating the guard logic in both entry points) would be worse.

## 2. The 6 new cycle pairs: import edges and introducing commits

All 6 are **identical** between `0261491e` and `HEAD` — none were created or removed this session. I extracted the specific file→file edges for each pair from the `dependency-cruiser` JSON graph (both directions, to show the actual cycle), then found the commit that introduced the cycle-creating edge (the "wrong direction" one — features reaching back into `assistant`/`db`/`server` instead of the other way around) via `git log -S` on the exact import target, and confirmed each with `git merge-base --is-ancestor <commit> 0261491e`. All ten are confirmed ancestors of the session-start commit:

| Cycle pair | Cycle-creating edge | Commit | Date | Ancestor of `0261491e`? |
|---|---|---|---|---|
| `assistant <-> features/deployments` | `features/deployments/publish-agent-tools.ts` → `assistant/surface-exchanges.ts` | `f96da9dc` / `b3e73f96` | 2026-08-15 | ✅ |
| `assistant <-> features/source-control` | `features/source-control/tool-registrations.ts` → `assistant/surface-exchanges.ts` | `2acf8436` | 2026-08-16 13:46 | ✅ |
| `db <-> features/deployments` | `db/sqlite/publish-credential-repo.sqlite.ts` → `features/deployments/publish-credentials/types.ts` (+ `publish-history-repo.sqlite.ts` → `static-publish/{publish-history,types}.ts`) | `33cc64b2` | 2026-08-15 | ✅ |
| `export <-> server` | `export/site-exporter.ts` → `server/app.ts`; `export/route-manifest.ts` → `server/routes/*` | `ab258d0c` / `0c67fbf6` / `9b1800da` (and `065cc79d`, a fix for a related cycle) | 2026-08-15 | ✅ |
| `features/deployments <-> server` | `features/deployments/{static-publish/adapter.ts, publish-agent-tools.ts, tool-registrations.ts}` → `server/routes/types.ts` | `a4bddce3` | 2026-08-15 | ✅ |
| `features/source-control <-> server` | `features/source-control/{tool-registrations.ts, commit-site.ts}` → `server/routes/types.ts` | `29437620` | 2026-08-16 13:41 | ✅ |

All ten commits land 2026-08-15 through 2026-08-16 13:46 — i.e. the prior session ("session 7", whose handoff doc is `0261491e` itself), not this session (which starts at `0261491e` → 17:31 onward). The pattern across all six is the same shape: new agent-tool / export / publish features reach directly into `assistant/surface-exchanges.ts` or `server/routes/types.ts` for a concrete type, instead of the module depending on a narrower contract that `assistant`/`server` implement. That's a real, nameable coupling smell — but it's prior-session work, already merged, already in the graph before today's dispatch began.

**Baseline staleness (item 5):** last moved by `e8688e15` (`chore(architecture): move check:architecture baseline after this session's work`, 2026-08-10 08:43:09 -0700). 767 commits separate that commit from current `HEAD`; 748 of those predate this session's start (`0261491e`). The baseline is not "slightly behind" — it predates six of the eight most recent working days on this branch.

## 3. Severity — honestly

**Nothing runtime-breaks.** This is a static import-graph ratchet, not a correctness or CI-deployment gate outside of itself. No user-facing behavior, no test failure, no data-integrity issue traces back to these numbers.

**It is, however, a real CI gate, and it's genuinely red:** `.github/workflows/ci.yml:96` runs `check:architecture` as a **blocking** step (unlike `check:boundaries` and `check:capability-inventory`, which are explicitly `severity:"warn"`/report-only by the workflow's own comments). Given 748 pre-session commits of drift with the baseline never moved, this step has very likely been failing in CI on this branch for multiple days already — this diagnosis just happens to be the first time someone looked closely at *why*.

**On the propagation-cost number specifically — do not read 29% as "4x the damage" of 7.6%.** The script's own header warns propagation cost is "famously nonlinear," and the baseline data proves it: at the 2026-08-10 baseline, the largest SCC was *already* 33 of 42 modules (79%) — nearly the same proportion as today's 35 of 47-48 (73-75%) — yet propagation cost was only 7.6%. Two more modules joining an already-giant strongly-connected component pushed file-level transitive reachability past a threshold where it saturates most of the graph — a step function, not a linear cost. The SCC didn't get proportionally bigger; a couple of edges connecting two large components made the *file-level* closure much larger. That's the mechanism, not "282% more coupling was written."

**There is also a genuine, non-trivial improvement sitting right next to the regression**, which a skim of "3 metrics regressed" misses: module API surface dropped 220 → 202 files (**−8.6%**, real encapsulation work) and core size dropped from 15.21% to 7.96% of files (**−47.7%**, the churn-blast-radius core roughly halved). The script itself calls this out as a "TRADE DETECTED" in its own output. Whoever did that work (likely the RouteDeps-narrowing and module-boundary passes visible in git log) bought a real reduction in blast radius while, separately, six new feature areas wired themselves into the big SCC. Both are true at once.

**What actually breaks, for whom:** nobody today. The cost is paid gradually by whoever next tries to extract `assistant`, `export`, `features/deployments`, `features/source-control`, or `server` into a separately-testable or separately-packaged unit (the explicit motivation cited in the script's own header, referencing `ADS-memory/reports/refactors/2026-08-02-module-graph-analysis.md`) — that work gets harder every time one of these six pairs stays uncut. It is a coupling smell with a real, if deferred, cost — not a fire.

## 4. Recommendation

**Move the baseline, with this report as the written justification — do not leave the gate red as a silent/ignored TODO, and don't revert anything.**

Reasoning:
- Reverting is not viable: the regression is baked into 748 commits of real, already-shipped feature work spanning six days (deployments, source-control, export, publish-credentials). There is nothing from *today's* session to revert — today's own contribution (+2 back-edges) is a defensible shared-guard wiring, not a mistake.
- Leaving the gate red is worse than moving it: a blocking CI check that's been silently red for days trains people to ignore CI status entirely, which is a bigger risk than the coupling itself. Every PR from every branch will now show this failure regardless of what it touches, burying real regressions under an unrelated wall of red.
- This is exactly the situation the script's own comment anticipates ("if genuinely intended, run with `--update` to move the baseline") — but "genuinely intended" requires someone to have actually looked, which is what this report is. I did **not** run `--update` myself (out of scope for a diagnose-only dispatch); whoever owns the baseline should run it and cite this report's commit as the reason in the commit message, the same way `e8688e15`'s predecessor commits did.

**Paired action, not optional:** moving the baseline should not happen without opening a tracked cleanup item for the six cycle-creating edges in §2 — they share one fixable shape (reach into a narrower port/contract instead of the concrete `assistant/surface-exchanges.ts` or `server/routes/types.ts`), and paying them down is exactly what would let the *next* baseline move be a real improvement instead of another ratchet-down. I did not scope that fix here per the diagnose-only mandate; recommend routing it to a follow-up architecture task.

## Method notes / what I actually ran

- Two `git worktree add --detach` checkouts (`.../scratchpad/wt-session-start` at `0261491e`, `.../scratchpad/wt-head` at `ae404ba6`) — never touched the shared main working tree, which other agents were actively committing to throughout this session.
- Symlinked `node_modules` from the main tree into each worktree (no install needed, `tsx`/`depcruise` resolved fine).
- Ran `npx tsx development/scripts/check-architecture.ts --list` in each, captured full output, diffed.
- Ran `npx depcruise src --no-config --ts-pre-compilation-deps --ts-config tsconfig.json --do-not-follow node_modules --output-type json` at `HEAD` and wrote a small throwaway Node script (mirroring the check script's own `moduleOf()`/test-file filters) to extract the specific file→file edges for each of the 6 cycle pairs.
- Attributed each cycle-creating edge to a commit via `git log -S <import target> -- <file>`, then verified pre-session status via `git merge-base --is-ancestor <commit> 0261491e`.
- Verified the `vendor-credentials` author's claim (`grep -rn "assistant\|/server/\|/export/" src/features/vendor-credentials`) directly — zero matches, consistent with the module graph's `Ca=0, Ce=0`.
- No production source was edited. No `--update` was run. No process was killed. Worktrees are left in place at `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/3e1851ba-14bf-415c-aed1-851bfb225825/scratchpad/{wt-session-start,wt-head}` for anyone who wants to re-verify before I clean them up.

**Labeled measured vs. inferred:** every number in §1 and the table in §2 is measured (worktree runs, `git log`/`merge-base`, direct grep). The severity read in §3 (propagation-cost nonlinearity mechanism, "likely been failing in CI for days") is inferred from the measured baseline/SCC numbers and the CI YAML, not directly observed (I did not query GitHub Actions run history).
