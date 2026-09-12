# apps/desktop gate harness — handoff

**Date:** 2026-09-12 · **Branch:** `restructure/apps-website-phased` · **Agent:** harness-survey (rotated out at ~75 min)
**Final commit:** `efc63652` · **All four gates enabled and seeded.**

Read the "Remaining worklist" and "Refactor rules" sections before touching anything. Everything
else is context.

---

## Status in one line

The harness is **built, wired, seeded, and enabled**. Three items of *product* work remain (two
complexity fixes and one test file). No harness work remains.

**Correction to any earlier brief you may have been handed:** the complexity baseline is NOT
pending — it was seeded and the gate enabled in `efc63652`. Do not re-seed it.

---

## What shipped, and where it lives

Ten commits, in order:

| SHA | What |
|---|---|
| `9e81258c` | Gate runner + manifest; the four anti-silence properties |
| `c5bce4ba` | Coverage floors, denominator = disk not lcov |
| `303ba537` | `eslint.config.mjs` desktop block |
| `58cf12dc` | 9/9 complexity gate (registered disabled at the time) |
| `89687fb1` | Packaging staleness guard; `warnIfDistIsStale` → `fail()` |
| `6b063184` | `desktop.yml` + pre-push hook + `ci-local.sh` comment fixes |
| `9f9773a7` | `isBundleInput`; enumeration-not-count tests |
| `efbb6fb0` | Repointed two grandfathered paths rename Commit 5 moved |
| `efc63652` | **Complexity baseline seeded (10 entries), gate enabled** |

### Files

| Path | Role |
|---|---|
| `apps/desktop/quality-gates.json` | **The only place a gate may be turned off.** Manifest. |
| `apps/desktop/scripts/check-gates.mjs` | Runner. Spawns gates, prints all of them, owns exit code. |
| `apps/desktop/src/quality-gates.js` | Runner *policy* as pure functions (tested). |
| `apps/desktop/coverage-floors.json` | Areas, floors, `knownUnmeasured`, `notMeasured`. |
| `apps/desktop/scripts/check-coverage.mjs` | Runs the suite under coverage, evaluates areas. |
| `apps/desktop/src/coverage-floors.js` | Coverage policy, pure (tested). |
| `apps/desktop/scripts/check-complexity.mjs` | 9/9 re-lint + debt diff. |
| `apps/desktop/src/complexity-debt.js` | Diff + exit-code guards, pure (tested). |
| `apps/desktop/complexity-debt.json` | 10 grandfathered violations, per-violation keyed. |
| `apps/desktop/src/shell-staleness.js` | `isBundleInput` + staleness predicate (tested). |
| `apps/desktop/scripts/hooks/pre-push` | Shipped, **NOT installed** — see below. |

**Three files outside `apps/desktop`,** all explicitly authorised, nothing else:
`eslint.config.mjs` (one additive desktop block), `development/scripts/ci-local.sh` (comments only),
`.github/workflows/desktop.yml` (new).

### Design in one paragraph

Pure policy lives in `src/*.js` so the repo's existing `npm test` glob picks up its tests; the
filesystem/spawn half lives in `scripts/*.mjs`. A top-level script cannot be tested, so the part
worth testing does not live in one. The runner has four properties, each matching a way *this
repo's existing harness actually rotted*: (1) every gate prints on every run including disabled
ones; (2) `enabled: false` requires `disabledReason` + `disabledOn` or the runner fails; (3) a
`scripts/check-*.mjs` no manifest entry runs fails the runner; (4) a disablement older than
`maxDisabledDays` (30) fails until re-confirmed.

---

## Remaining worklist

### 1. `workspace-chat-transport.ts` tests — highest value, do this first

`apps/desktop/src/renderer/workspace-chat-transport.ts`, 422 lines, **1 of 23 functions covered**.
It is at its final name; the renames are done and nothing will move under you.

The 22 uncovered functions are almost all **pure translation functions — no DOM, no React, no
Electron**, the most trivially unit-testable shape in the app:

```
mintSubscriptionId, toChatRunStatus, isMediaBlock, mediaBlocks, translateStatus,
translateTextDelta, translateThinkingDelta, translateThinkingStart, translateToolUse,
translateToolInputDelta, translateToolResult, translateUsage, translateRaw,
translateAgentPayload, settle, applyAgentEvent, applyRunEndEvent, applyRunEvent,
exitDescription, buildChatStartPayload, wireCancelSignal, createWorkspaceChatTransport
```

(`createRunnerChatTransport` was renamed to `createWorkspaceChatTransport` in Commit 5; the other
names survived.)

One new test file moves the `.ts` coverage area more than any threshold negotiation would.

**When it lands:** remove `src/renderer/workspace-chat-transport.ts` from `coverage-floors.json`'s
`knownUnmeasured`. The gate prints `NOW COVERED, remove from knownUnmeasured: …` to prompt you. It
does not fail for this — recovering is a prompt, not a failure, deliberately.

### 2. `folder-drop.ts:43` `folderPathsFromDataTransfer` (cyc 10) — **test before refactor**

It is in `knownUnmeasured`. **Zero coverage.** Refactoring it today is a blind refactor — nothing
would catch a behaviour change. Write the test, then cut, then delete both its debt entry and its
`knownUnmeasured` entry.

### 3. `tovu-server.js:304` `buildServeEnv` (cyc 11 + cog 10) — **measure before cutting**

In a file at 98.1% line coverage, so a refactor is actually safe here. But see the refactor rules
below: check how much of the 11 is dependency-injection seam cost before touching it. Cog 10
alongside cyc 11 suggests some is real logic, but that is a guess, not a measurement.

A Sonnet agent was triaging all 8 violating functions into REFACTOR / LEAVE / LEAVE-AND-BASELINE
with measured cognitive for each. **Check for its verdict before cutting either function.** I never
saw its output.

### 4. Confirm the full harness green in one invocation

The last full `npm run gates` run was **interrupted by the owner before it completed**, so the
four-gates-all-enabled harness has not been observed green in a single invocation. Each gate passed
individually after the final edits. Run once the rename follow-up lands:

```
cd apps/desktop && npm run gates
```

This is the one verification I wanted and do not have.

### 5. Optional: install the pre-push hook

Shipped at `apps/desktop/scripts/hooks/pre-push`, deliberately **not installed** — `core.hooksPath`
is repo-wide and changes how the owner's git behaves. Install one-liner is in the hook's own header:

```
git config core.hooksPath apps/desktop/scripts/hooks
```

---

## Refactor rules that constrain the two fixes

These are load-bearing. Getting them wrong makes the code worse to satisfy a linter.

1. **High cyclomatic + LOW cognitive is usually a flat `??`/`||` chain. Do NOT refactor it.** Each
   alternative costs a cyclomatic point while the code stays trivially readable. The functions worth
   refactoring are high on *both* metrics.
2. **A default parameter costs a cyclomatic point independent of any branching.** A function with
   four injected dependencies defaulted for production carries four points of pure
   dependency-injection seam cost. **Removing a seam to satisfy a linter is the wrong trade.** If
   most of `buildServeEnv`'s 11 is seam, leave it and keep it baselined.
3. **After any fix, DELETE its debt entry.** Never refresh a recorded number upward. The list is
   meant to shrink; `check-complexity.mjs` prints `FIXED (remove from complexity-debt.json): …` when
   a baseline entry stops reproducing, and that is not a failure — it is the prompt.
4. **The ceiling stays at 9. This is deliberate and is not a mistake to "correct".** The owner's
   standing rule is cognitive ≤ 10. A function at exactly 10 satisfies the rule and fails a
   ceiling-of-10 lint, so enforcing 9 means passing code satisfies both. `SiteCard` at cyc 10 is an
   accepted debt entry — nobody contorts a design around it.
5. **Debt is keyed per VIOLATION (rule, file, message), never per file, and never by line number.**
   ESLint flat config can only relax a whole *file*, and elsewhere in this repo a per-file debt list
   let a function sit at 18/13 for months because a *different* function in its file was listed.
   Line numbers are excluded because two functions in one file can emit the identical message, and a
   line-keyed entry goes stale on every edit above it.

---

## The ten traps — acceptance criteria for anyone extending this harness

Each is a way a gate ships and then quietly stops measuring. Two of them caught real defects in my
own work, in the same session I wrote them down.

1. **Coverage without `--test-coverage-include` measures Jini, not Tovu.** An unscoped run here
   instruments **1445 files**, almost all `../../../Jini/packages/*/dist/**` reached through
   symlinked `node_modules`.
2. **`--test-coverage-include` FILTERS what was loaded; it does not force files in.** A file no test
   imports leaves the denominator and **the percentage goes UP**. This corrupted my own headline
   number: I reported the `.ts` area at "80.78% over 9 files" when there are 18, and the missing
   half had pushed the figure up. Hence: the denominator is a **disk scan**, never the lcov.
3. **A gate that reads an artifact off disk passes on stale data.** `check-route-coverage-floor.ts`
   returned OK at 98.54% from an lcov nine days old, having run no tests. Its zero-file guard
   catches a *missing* lcov, not a stale populated one. `check-coverage.mjs` produces its own
   coverage every run; there is no path in it that reads a pre-existing artifact.
4. **A check that warns instead of failing is indistinguishable from no check.**
   `stage-payload.mjs`'s `warnIfDistIsStale` wrote to stderr and exited 0 — the direct cause of a
   shipped twelve-day-stale bundle. Now `fail()`.
5. **Node's `LF` counts every line including comments and blanks.** Verified: `keyed-serializer.js`
   LF:51 / `wc -l` 51; `App.hooks.ts` 1272/1272. This codebase is comment-dense, so these line
   percentages read HIGHER than a statement-based tool's and are **not comparable to any
   c8/vitest/istanbul number — including `apps/admin`'s**. Recorded in `coverage-floors.json` itself
   so nobody puts the two in one table.
6. **`--no-error-on-unmatched-pattern` turns "this directory vanished" into silence.** Four scopes
   in `check-src-complexity-drift.ts` no longer exist and are skipped without a word. Any use of it
   needs a companion count assertion.
7. **ESLint exit 2 is a CRASH with empty stdout, not a finding.** A caller testing `rc !== 1` reads
   it as a pass. `rejectUnusableEslintRun` refuses anything that is not exit 0-or-1 *with* a
   parseable, non-empty report — including `"[]"`: *matching nothing is not finding nothing*.
8. **An exit code read through a pipe is the pipe's.** `npm run admin:build 2>&1 | tail` gives
   `$?`=0 while `PIPESTATUS[0]`=1. This is the actual mechanism behind a "build exits 0" report that
   was carried downstream as a root cause. No pipes anywhere in this harness.
9. **Desktop build-output trees sit outside ESLint's global ignores** — `release/`,
   `release-verify/`, `staging/`, `src/speech/.build/` each hold a full app copy. Handled in the new
   config block's `ignores`.
10. **A gate nobody invokes accumulates silently.** `check:admin-complexity-drift` is fully written,
    documented, referenced in a `ci.yml` comment, invoked by nothing — and **11 violations behind**.
    The deliverable is never the script; it is the line that calls it, plus property 3.

---

## Things I know that are not written down anywhere else

- **`npm run complexity` is ALREADY RED at HEAD** — rc=1, 12 errors over 3402 files. Eleven are in
  `apps/admin/src` and are exactly the drift the uninvoked `check:admin-complexity-drift` reports;
  the twelfth is a `sonarjs/no-redundant-jump` in `apps/website`. **Zero are under `apps/desktop`** —
  which is how the new eslint block was proven additive. Measured on a dirty tree; re-measure clean
  before acting on the admin count.
- **`ci.yml` is `disabled_manually`, not billing-blocked.** `gh workflow list --all`: three other
  workflows active and running successfully 09-10/09-11. Re-enabling is one `gh workflow enable CI`.
  It is deliberately still off — it would arrive red on ≥4 blocking gates. `ci-local.sh`'s header now
  records this; it previously asserted the billing reason for weeks after it stopped being true.
- **`development/scripts/check-area-coverage-floor.ts` is a complete, unwired gate whose required
  config file `area-coverage-floors.json` does not exist.** It would exit 1 the moment anyone ran
  it. It is the single best argument for property 3, and it is still sitting there.
- **11 of 22 `check:*` scripts are invoked by nothing**, plus `triage:coverage-gaps` and
  `triage:churn-hotspots`. `check:openapi-contract` additionally *hangs forever* after crashing on a
  401 at `development/scripts/lib/tovu-test-server.ts:42`.
- **`coverage-floors.json` and `quality-gates.json` are plain JSON that no typechecker validates.**
  A stale path in either is invisible to `tsc` and to grep-for-imports. Rename Commit 5 proved this
  — the gate caught two moved paths by failing. `rename-c456` has been told to check both files
  alongside code in future renames.
- **`apps/site-chat`'s `build` script is `check-no-linked-jini.mjs && vite build`** — the same
  guard-chained shape as admin. So the *old* remedy string (`npm --prefix apps/site-chat run build`)
  would have been blocked on a linked checkout exactly as admin's was. The corrected remedy
  generalises: `cd <shell> && npx vite build`.
- **`check-no-linked-jini.mjs` is CORRECT and must not be "fixed".** Verified all four invocation
  forms return rc=1 with Jini linked. The reported "exits 0 while blocked" was trap 8.
- **Do not suggest `npm run unlink:jini`** anywhere — in a script, a message, or a doc. Owner ruling.

---

## The `apps/site-chat/dist` finding — why `package.json` belongs in `sourceFiles`

Running `npm run stage` for real (rather than trusting the unit test) refused `apps/site-chat/dist`
as **7.7 days stale**. Cause: `apps/site-chat/package.json` changed on 2026-09-10 in commit
`2815f643`, *"chore(deps): bump @jini-ai/ui, chat, admin to 0.3.7 to fix nested agentic pin"*. The
bundle was built 2026-09-03 — **before** that fix.

Packaging that day would have shipped a site-chat widget built against pre-0.3.7 Jini, silently. The
old script would have staged it and exited 0, because `site-assistant.js` exists.

This is a **second live instance of the original incident, in a different shell, caused by a
dependency bump rather than a source edit**. A `sourceDirs`-only freshness check would not have seen
it. That is why every `STAGED_SHELLS` entry carries `sourceFiles: [<shell>/package.json]`.

Running it for real also found the inverse — a **false positive**: a `.unit.test.tsx` edited after
the build counted as a bundle input. Fixed with `isBundleInput`. **The unit test could not
structurally have found either of these.** That is the argument for watching a gate actually fail.

---

## Open questions I never resolved

1. **Is `buildServeEnv`'s cyc 11 mostly DI seam or real logic?** Never measured. Blocks fix #3.
2. **The Sonnet triage agent's verdicts on all 8 violations** — dispatched, never seen by me.
3. **Would `ci.yml` actually be red in CI?** My four RED results were measured on a dirty tree
   carrying a retired session's uncommitted work. `admin:build` inverts (fails locally with Jini
   linked, passes in CI from the registry), so the dirty tree misleads in both directions. A clean
   measurement needs `git archive HEAD | tar -x` and ~5 minutes. **Never conflate those four numbers
   with the desktop results, which were measured on a tree byte-identical to HEAD for `apps/desktop`.**
4. **Should `.tsx` ever be measured?** It needs `apps/admin`'s vitest+jsdom stack in `apps/desktop` —
   a real new dependency and a decision nobody has taken. Currently declared `notMeasured` with the
   reason printed every run. My recommendation was: don't, yet.
5. **`main.js` coverage** — 0%, nothing imports it (it requires `electron` at module scope). The path
   forward is extract-and-test, already in motion (`desktop-auth.js`, `shutdown-tracker.js`,
   `speech-ipc.js` are why the `.js` area reads 99%+). Declared `notMeasured`. Its *complexity* is
   genuinely clean — zero violations at 9, verified non-vacuously (forcing threshold 1 yields 34
   findings, so the rule really reaches the file).
6. **PIDs 13296 / 13297** (`check-openapi-contract.ts`) were still hung when I rotated out.
7. **`npm run stage` prints `npm error missing: tsd@^0.7.1, required by p-try@2.2.0`** on stderr
   while exiting 0. Pre-existing, unrelated, unfixed.

---

## Verified numbers at rotation

- `check-complexity` rc=0 — **62 files linted at 9/9, 10 grandfathered, 0 new**
- `check-coverage` rc=0 — `.js/.cjs` 99.40/94.95/94.74 (floors 96/90/90) · `.ts` 80.66/94.44/22.54
  (floors 76/88/none) · `bin` 89.47/85.11/66.67 (floors 85/80/62)
- 74 tests pass across the five harness test files, 0 fail
- `npm run stage` rc=0 on fresh shells; rc=1 on stale, three times, on genuinely stale payloads
- Full `npm run gates` in one invocation: **NOT observed** (interrupted) — see worklist item 4
