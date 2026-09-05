# 2026-09-05 — Complexity Ground Truth

Status: COMPLETE. Measurement job only — nothing was fixed, no baseline file edited.

## Question being settled

Three sources disagreed about `src/`-scope complexity debt and could not all be true:
- `ADS-memory/reports/2026-09-03-OUTSTANDING-WORKLIST.md`: "68 violations / 43 files → 1
  (the documented `mergeExternalMcpSavePrefill` exemption). Gate green: `0 new complexity
  violations (1 total, 1 in baseline)`."
- `ADS-memory/reports/COMPLEXITY-DEBT-REMAINING-2026-09-03.md`: "70 violations remain
  across 41 files, none touched by this pass."
- `development/scripts/src-complexity-debt.json`: dispatcher counted 8 entries.

## Headline answer

**The gate is RED right now, not green.** MEASURED: running the gate's own instrument
(`npx tsx development/scripts/check-src-complexity-drift.ts`) today exits **1** with 2 new,
unbaselined violations. Neither of the two prior reports' numbers is correct today, and
neither is "wrong" in the sense of having been false when written — both were overtaken by
later commits in this same session. See Reconciliation below.

- **Real, currently-reproducing violations: 6, across 5 files.**
- **Baselined (accepted debt, not fixed): 4**, across 3 files.
- **New, unbaselined, currently failing the gate: 2**, across 2 files.

## MEASURED: the live run

Command:
```
npx tsx development/scripts/check-src-complexity-drift.ts
```
stdout captured to `.claude/harness-tmp/complexity-run-F.out`, exit code captured
separately (never through a pipe) to `.claude/harness-tmp/complexity-run-F.rc`:

```
EXIT:1
```

```
check:src-complexity-drift — 2 NEW apps/website/src/server / apps/website/src/assistant /
apps/website/src/features / apps/website/src/widgets / apps/website/src/seo /
apps/website/src/platform/export / apps/website/src/analytics / apps/website/src/media /
apps/site-chat/src complexity violation(s), not covered by src-complexity-debt.json:
  - [sonarjs/cognitive-complexity] apps/website/src/features/identity/builtin-role-grants.ts:
    Refactor this function to reduce its Cognitive Complexity from 12 to the 9 allowed.
  - [complexity] apps/website/src/server/runtime/boot/dev-tls.ts:
    Function 'resolveDevTls' has a complexity of 10. Maximum allowed is 9.
```

Because the script only prints full counts on its *pass* branch (see `main()`,
`check-src-complexity-drift.ts:266-271`), a RED run doesn't emit `(current.length total,
baseline.length in baseline)`. To get exact numbers I called the script's own exported
`findViolations()` and `diffAgainstBaseline()` directly (no baseline file touched, read-only):

```
BASELINE_COUNT=4
CURRENT_COUNT=6
ADDED_COUNT=2
REMOVED_COUNT=0
---CURRENT FILES---
apps/website/src/features/external-mcp/save-form.ts 1
apps/website/src/features/identity/builtin-role-grants.ts 1
apps/website/src/features/theme/static-render.ts 1
apps/website/src/server/inbound/admin-http/routes/system/sites.ts 2
apps/website/src/server/runtime/boot/dev-tls.ts 1
```
(full raw output: `.claude/harness-tmp/complexity-verify-F.out`, script:
`/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/d6b55a88-a50c-4a7f-834f-5be455e2d10c/scratchpad/verify-complexity-counts.mjs`)

`REMOVED_COUNT=0` means every one of the 4 baseline entries still reproduces — none is
stale today.

## MEASURED: how the baseline participates (read from the script, not inferred)

`development/scripts/check-src-complexity-drift.ts` does a **multiset diff**, not a
pass/fail on the raw count. Quoting the actual logic (`diffAgainstBaseline`, lines 154-184):

```ts
export function diffAgainstBaseline(baseline: readonly Violation[], current: readonly Violation[]): DriftResult {
  const baselineCounts = countByKey(baseline);
  const added: Violation[] = [];
  const consumedFromBaseline = new Map<string, number>();
  for (const violation of current) {
    const key = violationKey(violation);
    const allowed = baselineCounts.get(key) ?? 0;
    const consumed = consumedFromBaseline.get(key) ?? 0;
    if (consumed >= allowed) {
      added.push(violation);
    } else {
      consumedFromBaseline.set(key, consumed + 1);
    }
  }
  ...
```

And `main()` (lines 254-281): the gate only fails (`process.exit(1)`) when `added.length > 0`
— i.e., a violation whose exact `(rule, file, message)` key isn't already "used up" by a
baseline entry. **A violation present in the baseline is never in `added`, no matter how
long it's stood, and the gate exits 0 with it still counted in the printed total**
(`0 new complexity violations (${current.length} total, ${debt.violations.length} in
baseline)`, line 267-268 — note this line only fires on the passing branch, which is why a
RED run like today's prints no total).

**Direct answer to the dispatch's core question: the gate being green has never meant
"no violations." It means "no violations beyond what's already been named debt."** A
baselined entry is not fixed — it's read from disk on every run and still counted; it
simply doesn't move `added` past zero. Today it isn't even green: 2 violations exist that
aren't in the baseline at all.

Two of the 4 currently-baselined entries carry an explicit, reviewed exemption rationale in
`src-complexity-debt.json`'s own comments (`mergeExternalMcpSavePrefill`, and the
2026-09-05 pair `renderStaticPage` / the `sites.ts` route handler) — these are deliberate,
owner-approved "accepted debt," not silent suppression. But mechanically, the script treats
every baseline entry identically regardless of whether a rationale comment exists:
suppression is the mechanism either way.

## MEASURED: file-existence check on the "5 stale entries" claim

`COMPLEXITY-DEBT-REMAINING-2026-09-03.md` (committed 2026-09-03 08:23:06 -0700) states:
> "5 stale baseline entries in `src-complexity-debt.json` no longer reproduce (dead
> `src/...` paths from before the 2026-09-02 apps/website repoint)"

This was true when written, and was resolved before today. `src-complexity-debt.json`'s
own `_comment_2026-09-03_ratchet` documents folding those 5 dead `src/...`-path entries
back onto their live `apps/website/src/...` paths during the same day's ratchet (rather
than double-counting or leaving them dead). MEASURED today: none of the current 4 baseline
entries are `src/...`-rooted, and the live diff's `REMOVED_COUNT=0` confirms all 4 still
reproduce at their current `apps/website/src/...` paths. **This part of the 2026-09-03
report is now stale-but-was-correct — already overtaken by that same day's ratchet, not a
live problem.**

## Reconciliation of the three sources

| Source | Claim | Verdict |
|---|---|---|
| `COMPLEXITY-DEBT-REMAINING-2026-09-03.md` | "70 violations remain across 41 files" | **Stale, and the debt JSON's own commit history says so explicitly**: `_comment_2026-09-03_ratchet` notes this report "was already one commit stale by the time this ran (that report counted 70 across 41 files; live capture found 80 across 46 files)." So even on 2026-09-03 this number undercounted by 10. Overtaken entirely by the swarm cleanup the same day (67 of 68 fixed, commit `baf2675d`) and the 2026-09-05 baselining (commit `99ab0126`). Not reproducible today under any interpretation. |
| `2026-09-03-OUTSTANDING-WORKLIST.md` | "68→1... Gate green (1 total, 1 in baseline)" | **Correct when written, now stale.** Committed 2026-09-05 09:25:05. `99ab0126` ("baseline 2 flat-shape functions as accepted debt") landed 2026-09-05 10:18:14 — under an hour later — adding 3 more entries (baseline 1→4). Then `db83fdaf` ("materialize pages.edit_html...") landed 10:32:52, introducing the `builtin-role-grants.ts` violation. A third file, `dev-tls.ts`, currently carries an **uncommitted** working-tree edit (`git status`: `M`) from a concurrent agent in this shared session, adding the second new violation. None of this was wrong reporting — it's three real events in the same session after the report was written. |
| `src-complexity-debt.json` (dispatcher: "8 entries") | — | **The dispatcher counted top-level JSON keys, not violations.** The file has 8 top-level keys (`_comment`, `violations`, and 6 more `_comment_*` provenance notes), but the `violations` array itself — the only part the script reads — holds **4** entries. The real baseline count is 4, not 8. |

## Verdict: fixed vs. baselined

Of the 6 real, reproducing violations today:
- **0 have been fixed** in the sense of no longer existing.
- **4 are suppressed by the baseline** (mechanism above) — 2 with an explicit, reviewed
  "accepted debt" rationale in the JSON's comments (`save-form.ts`'s
  `mergeExternalMcpSavePrefill`, dated exemption predating this pass) and 2 more
  (`static-render.ts`'s `renderStaticPage`, `sites.ts`'s route handler — cyclomatic +
  cognitive, same function) added 2026-09-05 10:18:14 with an equally explicit rationale.
  All 4 are real code today; the gate will never flag them again unless their exact
  ESLint message text changes.
- **2 are neither fixed nor baselined** — they are failing the gate right now:
  `builtin-role-grants.ts`'s `applyBuiltinRoleGrants` (cognitive 12/9, committed) and
  `dev-tls.ts`'s `resolveDevTls` (cyclomatic 10/9, uncommitted working-tree edit).

So: the "campaign closed" framing in `OUTSTANDING-WORKLIST.md` was real for the 67 the
swarm actually refactored (batches landed as real diffs with re-measurement each time,
per that file's own commit list) — that part is fixes, not baselining. But the campaign's
closing state ("1 total") already included one baselined exemption, then grew to 4
baselined before growing further to 6 total via 2 unbaselined new violations within the
same session. **"Gate green" today would be false; it is currently RED.**

### `dev-tls.ts` — worth flagging, not fixing (out of scope for this report)
The uncommitted diff on `dev-tls.ts` extracts `isDevTlsExplicitlyDisabled` out of
`resolveDevTls` with a comment claiming the hoist was "purely to keep the `?.`/`||` this
parse needs off that function's own complexity count." MEASURED: `resolveDevTls` is still
over the ceiling (complexity 10/9) after that hoist — the comment's implied outcome doesn't
match today's live scan. This may simply be a WIP by a concurrent agent that intends
further extraction; noting it here rather than treating it as a closed claim.

### `builtin-role-grants.ts` — a stale self-reported metric in-file
`applyBuiltinRoleGrants`'s JSDoc carries `@overallScore 100`, but it's the exact function
the live gate flags at cognitive-12/9. Whatever produced that annotation didn't run the
same tool/threshold this gate uses (or ran before the function reached its current shape) —
another instance of an in-repo claimed metric not matching a direct measurement.

## Ranked recommendations (measurement job — implement nothing)

1. **Cheapest: `builtin-role-grants.ts`'s `applyBuiltinRoleGrants` (cognitive 12/9).**
   Nested loop (`grants` → `bindings`) each with early-continue guards plus one more
   `await` layer (`policyPermissions.listByPolicyId`) inside. A straightforward extraction
   — e.g. a `reconcileGrantForPolicy(binding, grant, deps)` helper pulling the innermost
   guard+read+write out of the `bindings` loop — would likely clear the ceiling without
   changing behavior; it's the newest, smallest, least security/credential-adjacent of the
   6, and unlike the 4 baselined entries has no "flat, avoid the metric" argument going
   for it (it's genuinely nested, not a flat fallback chain).
2. **`dev-tls.ts`'s `resolveDevTls` (cyclomatic 10/9).** Already mid-refactor
   (uncommitted). Whoever owns that edit should finish it — one more guard extraction
   (e.g. the cert-exists check) would likely close the remaining 1-point gap. Not this
   report's session to finish (uncommitted WIP belonging to a concurrent agent).
3. **Leave the 4 baselined entries as-is.** All 4 carry an explicit, reviewed rationale in
   `src-complexity-debt.json`'s own comments arguing the flat/`??`-chain shape is lower
   risk unrefactored than force-split. Re-opening any of them means re-litigating an
   owner-approved decision, not new information from this measurement.
4. **Retire `COMPLEXITY-DEBT-REMAINING-2026-09-03.md` or add a superseded-by note.** Its
   "70 across 41 files" number is unreproducible under any current interpretation and its
   only live content (the 5 stale-path entries) was resolved the same day it was written.
   Leaving it un-annotated is exactly the kind of stale-report trap that produced this
   dispatch.

## What I could not / did not determine

- Did not run `development/scripts/code-metrics.py` as a cross-check. The gate's own
  instrument already gives an exact, reproducible, tool-and-threshold-matched answer to the
  question asked; code-metrics.py uses different tooling/scope per this repo's own
  documented history of inflated raw numbers there, and running it would add noise, not
  confirmation, to a question this gate already answers directly. Flagging the skip
  explicitly rather than silently omitting it.
- Did not determine who owns the uncommitted `dev-tls.ts` edit (which concurrent
  session/agent). `git status`/`git log` don't attribute uncommitted working-tree changes
  to a session.
- Per hard rules, did not fix `builtin-role-grants.ts` or `dev-tls.ts`, and did not touch
  `src-complexity-debt.json`.

## Commands run (for reproduction)

```bash
npx tsx development/scripts/check-src-complexity-drift.ts > .claude/harness-tmp/complexity-run-F.out 2>&1
echo "EXIT:$?" > .claude/harness-tmp/complexity-run-F.rc   # captured separately, never through a pipe

# exact counts via the script's own exported functions, read-only:
npx tsx <scratchpad>/verify-complexity-counts.mjs > .claude/harness-tmp/complexity-verify-F.out 2>&1
```

Raw outputs preserved at `.claude/harness-tmp/complexity-run-F.out`,
`.claude/harness-tmp/complexity-run-F.rc`, `.claude/harness-tmp/complexity-verify-F.out`.
