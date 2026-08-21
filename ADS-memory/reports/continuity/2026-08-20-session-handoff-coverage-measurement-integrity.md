# Handoff: coverage + measurement-integrity campaign (Tovu, 2026-08-20 evening)

Generated: 2026-08-21T02:12Z
Source: Claude Code (Sonnet 5), Coordinator — Review Mode, primary interactive session
Target: claude (fresh Claude Code session, same repo)

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then this handoff.
>
> **Do not re-litigate the architecture/barrel work.** It is decided and committed — see §Decisions.
>
> Continue the coverage campaign. `src/features` is the largest untouched area. One agent
> (`cov-assistant-2`) may still be live on `src/assistant` + `apps/site-chat`; check before
> dispatching there. Read §Traps before writing any test — four separate measurement failures were
> found today and each one will waste an hour if rediscovered.

## Current State

- Branch `general-work`. HEAD `082cbfc4`. **53 commits unpushed** (`origin/general-work` = `76a65282`).
- **106 commits this session.**
- `npm run check:architecture` → **OK: at baseline** (green).
- CI is **deliberately off** — owner turned it off to push, nobody is using the product yet. It comes
  back later. Do not escalate it. See §Decisions.
- Three Claude sessions have been live in this tree concurrently. Some dirty files are **not ours**
  (see §Risks).

## Completed Work

**Architecture gate — the metric was lying, now fixed**
- `3d989a5f` — freeze hub-count medians in the baseline instead of recomputing per run. Root cause:
  it was the only count-based metric whose *threshold* floated. Two measured inversions: splitting
  `server/routes/types.ts` scored −28 floating vs +22 frozen; barrel-routing scored +106 floating
  (looks great) vs −120 frozen (correctly bad). Rebaselined in the same commit.
- `4c5d1eeb`, `e8a88e15` — hub decomposition investigation + verdict.
- `f27fa494`, `27765b58` — mini-barrel rejected by two independent peers; A/B of the two survivors.

**Type-honesty refactor (owner-driven)**
- `df815685` — split `getWidgetTypeRegistration` into a **total** accessor (narrowed keys) and
  `findWidgetTypeRegistration` (untrusted strings). Verification overturned the original design:
  3 of 4 callers pass values that were **cast, not validated**, so their `undefined` is real.
- `76b70fc6` — `satisfies` + generic accessor so each registration keeps its literal type.
  `recent-entries.ts` now `BRF:9 / BRH:9` — the uncoverable branch is **gone, not suppressed**.
- `d5bf9fa4` — sweep report: every `): T | undefined {` in `src/` checked, **13 rejected with
  reasons, exactly one was dishonest**. Question closed.

**Coverage — landed**
- `src/widgets` + `src/seo`: 8 commits. `create-core-resolvers` 83.87→100, `config-validation`
  88.67→100, `contact-form` 98.68→100.
- `src/analytics` + `src/export` + `src/media`: 9 commits. Aggregate 98.25/84.23/90.71 →
  99.59/87.73/98.61. `analytics/config.settings.ts` had **no real test at all** → 100/100/100.
- `apps/admin`: 14 commits. Full suite **250/250 files, 3578/3578 tests, zero failures** on a quiet
  machine. line 83.85→88.14, branch 77.34→80.76, func 77.96→83.77. `panels.tsx` 4/45 → 45/45.
  `security/` + `settings/` clusters 8/191 → 190/191 funcs.
- `src/assistant`: 9 files closed incl. `byok-provider-turn.ts` (`runOpenAiTurn`/`runAzureTurn` were
  **entirely uncalled**), all 4 `mcp-federation/` files, `external-mcp-store.ts` (branch 79.57→95.10).
- `33dfe327` — **`apps/site-chat` wired into the test gate.** 63 tests existed and were run by
  **nothing**. Explicit `"apps/site-chat/src/**/*.test.ts"` term, NOT the `apps/*` wildcard.
- `23134fe1` — first genuine dead-code deletion: `highlight.ts`'s `textContent ?? ""` (tsc passed
  without it).

**Admin bug fixes**
- `ad411490` — `execution-settings.ts`: 4 unguarded `.data` reads. **3 of 4 silently resolved to
  `undefined`** rather than throwing. Root cause is `lib/api.ts`'s `request<T>()` validating shape
  only on the failure path. TDD-proven, exact-message assertions.
- `308c86c7` — per-test timeout bumps on 2 tests that only fail under `--coverage`, with measured
  rationale inline.

## Active Files And Artifacts

- `development/scripts/check-architecture.ts` + `.baseline.json` — the frozen-median fix.
- `ADS-memory/reports/architecture/2026-08-20-hub-decomposition-hypotheses.md` — hub verdict. **Note:
  currently modified in the working tree; confirm whether that edit is ours before committing.**
- `ADS-memory/reports/architecture/2026-08-20-mini-barrel-proposal-rejected.md` — two-peer rejection.
- `ADS-memory/reports/architecture/2026-08-20-barrel-approach-ab-measurement.md` — A/B, with a
  coordinator addendum flagging its worktree was 226 commits stale.
- `ADS-memory/reports/refactor/REFACTOR-widget-type-registry-total-lookup-2026-08-20.md` — the sweep.
- `development/scripts/check-area-coverage-floor.ts` — committed, **unwired**, exits 1 unconfigured.

## Decisions And Constraints

1. **Hub count / barrels: DO NOTHING.** 10 of the 12-hub rise was the median moving, not coupling.
   Barrels are correct here. The mini-barrel was rejected by two peers. A/B measured; owner's words
   on the winning option: *"A feels like cheating."* Do not re-propose. Do not `--update` the
   architecture baseline without asking.
2. **`RouteDeps` is 100% type-only — zero runtime cost.** Runtime graph is all zeros. The 8
   decomposition slices DID happen; they split the *type*, not the *file*. Don't tell the owner it
   was never split.
3. **Propagation cost is a RATCHET, not a hard constraint.** Only `module API surface`, `back-edges`,
   and `module cycles/SCC` block. An earlier claim otherwise was wrong.
4. **Coverage bar:** 100% unit (or a named "damn good reason"), ≥95% integration, no dead branches,
   cyc AND cog complexity < 10.
5. **Unreachable ≠ dead.** Three candidates today; only one was deletable. `.find()` and lookups
   returning `| undefined` make guards **type-required**. Check before proposing a deletion.
6. **Never duplicate a test to move a scoped number.** That is coverage-gaming and is banned.
7. **CI is off deliberately, returns later.** Its 8 gates run zero tests. Don't escalate.

## Risks And Open Questions

- **OPEN, owner's call:** `apps/admin/src/features/security/hooks/use-other-credentials.hooks.ts:372`
  — a genuinely-dead defensive `throw`. Documented invariant assertion. Delete or keep?
- **53 unpushed commits.** Nothing is on GitHub. A cloud agent clones from GitHub.
- **Cloud dispatch: smoke test 4 FAILED, and it kills the leading hypothesis.** Fired 2026-08-20
  ~19:07 PT (`trig_01Dt7mMjEefbqRgjMpJxDnSH`, session `cse_01Wbsj5Nizi4kprbDiXxmhqC`) — the first
  run ever attempted outside US business hours. Nothing landed on `origin/general-work` or the
  `cloud/smoke-test-4` fallback branch after 300s of polling.

  **The peak-capacity-throttling theory should now be considered refuted, not untested.** Evidence:
  `origin/cloud/adr-052-reconcile` (`3ba78875`, **2026-08-03 14:07 PT**) is a real substantive
  commit — *"docs(adr-052): ground the @jini-ai/admin override in code, surface recon OQ-4"* — sitting
  on a `cloud/`-prefixed fallback branch, which is exactly the naming convention our cloud briefs
  instruct agents to use when a push to the working branch is rejected. That is almost certainly the
  "off-peak counterexample whose session is no longer retrievable" referenced in the prior handoff,
  and it is **not** off-peak: 2:07pm Pacific is squarely inside business hours.

  So the pattern is the inverse of what throttling predicts — a success during business hours, a
  failure at 7pm. **Something changed between 2026-08-03 and now.** That, not the hour, is where the
  next investigation should start. Caveat: every commit in this repo is authored by the owner, so
  the `cloud/` branch prefix plus a substantive ADR commit is strong evidence but not proof that a
  cloud agent produced it.
- **NOT OURS — do not touch or commit:** `apps/admin/src/features/plugins/**` (4 files, concurrent
  session), `src/server/routes/admin/plugins/uninstall.ts` (2 remaining complexity violations),
  and several untracked `ADS-memory/reports/2026-08-1x-*.md`.
- `src/features` is the largest untouched coverage area.
- ~20 admin files showed one failure each under load; **confirmed CPU-starvation flake** by a clean
  quiet-machine run. Do not reclassify as regressions.

## Traps — read before writing any test

1. **Coverage LINE NUMBERS from `node --import tsx --test` are WRONG.** tsx/esbuild strips comments
   before instrumentation. Proven twice, including an in-process contradiction (a test that could
   only pass by executing lines 108-109 passed while the same run called them uncovered).
   **Read `FN`/`FNDA` names from lcov; `BRDA` for branches.** `apps/admin` (vitest+v8) is unaffected.
2. **A scoped run UNDERSTATES coverage.** `seo/tool-registrations.ts` = 0% scoped, 99.62% combined.
   Capture any coverage floor from a FULL run or the gate will fail on well-tested code.
3. **A grep miss is not a gap.** One near-duplicate was avoided only by reading the call site — the
   value was passed positionally (`instance("w-1", 5)`), so the property name never appeared.
4. **Don't correlate a BRDA id back to source.** Read the function, enumerate its conditions, write
   the test, confirm the zero-hit *count* dropped.
5. `TEST_CONCURRENCY=2` is load-bearing (unbounded → 5.4GB → OOM). vitest is NOT at the repo root.
   `tsc` does not typecheck test files.
6. **Shared tree, 3 sessions:** `git commit -F <msg> -- <exact paths>` is the ONLY protection.
   Never `git add .`, `git reset`, or `git stash` in any form.

## Suggested Skills

- `AI-Dev-Shop/agents/tdd/skills.md` — for any coverage dispatch.
- `AI-Dev-Shop/agents/refactor/skills.md` — propose-only by default.

## Next Steps

1. Check whether `cov-assistant-2` is still live before dispatching to `src/assistant`/`site-chat`.
2. Resolve the owner's open call on the dead `throw` (line 372).
3. **`src/features` coverage** — largest untouched area, needs a fresh measurement first.
4. Decide whether to push the 53 commits.
5. Read the cloud smoke-test-4 result; if it succeeded, cloud dispatch is finally usable.
6. Optional: wire `check-area-coverage-floor.ts` — floors from a FULL run only.

## Handoff Contract

- **Inputs used:** live `git log`/`status`/`rev-list`, `npm run check:architecture`, parsed
  `apps/admin/coverage/lcov.info`, 6 subagent final reports, 2 independent peer reviews.
- **Output summary:** enables a fresh session to continue coverage without redoing the architecture
  investigation or rediscovering four measurement failures.
- **Risks:** 53 unpushed commits; one owner decision open; concurrent sessions' files in the tree.
- **Suggested next assignee:** Coordinator → TDD agents per area, Sonnet 5.
