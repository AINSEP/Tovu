# Route coverage — ground truth — 2026-09-05

**Status: IN PROGRESS — skeleton committed early per standing incremental-commit rule.**

Dispatch: produce a trustworthy `apps/website/src/server/routes/**`-equivalent (now
`inbound/{admin-http,public-http}/routes/**`) coverage number, distinguish real gaps from
measurement artifacts, and design (not build) a trustworthy recurring measurement.

Every prior report (`2026-09-03-route-coverage-below-100.md`,
`2026-09-03-coverage-gap-analysis-existing-data.md`,
`2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`) is treated as a CLAIM, not fact, and
re-verified against code and fresh measurements. Every line below is marked **MEASURED** (I ran it
and read the output myself) or **INFERRED** (reasoning on top of a MEASURED fact). A number I did
not personally produce is cited as "per <report>", never stated as fact.

## 1. Confirmed traps (read the scripts myself)

- **`check:route-coverage-floor` runs no tests.** MEASURED: `development/scripts/check-route-coverage-floor.ts`
  only calls `loadRouteCoverage()` against the on-disk `development/coverage/lcov.info` — no test
  invocation anywhere in the file or in `route-coverage-lib.ts`. That lcov's mtime is **2026-09-03
  19:43** (`ls -la development/coverage/`) — 2 days stale as of today. Its green/red proves nothing
  about current code.
- Dual-instantiation contamination is real and partially fixed today (`4d48f645`, `96988ca7`,
  `b3748e94` per the 2026-09-05 report) but not fully — confirmed by re-reading that report and the
  detector script, not yet re-run by me at this point in the task.

## 2. Scope for this measurement

TBD below as measurement proceeds.

## 3. The real coverage number

TBD.

## 4. Genuinely uncovered vs. artifact-uncovered

TBD.

## 5. Why prior numbers differ

**MEASURED via `git log --since=2026-09-03`**, checked against the `2026-09-03-route-coverage-below-100.md`
table's 10 worst-ranked files (captured ~12:48 PDT that day, from `development/coverage/lcov.info`):

| File | Sep 3 rank (branch%) | Fix commits since |
|---|---|---|
| `entries/update.ts` | 78.16% | `9e416602`, `7e1cea7e`, `6c499cf0` (15:16–17:13 same day) — "cover update/lifecycle/list/get-entry route branches" |
| `entries/lifecycle.ts` | 79.52% | same 3 commits |
| `recovery/deep-link.ts` | 79.59% | `69157f8c`, `a63534b5` (15:03–15:30) — "close route-level branch gaps on 4 destructive admin ops" |
| `connectors/disconnect.ts` | 78.57% | same 2 commits |
| `change-sets/revert.ts` | 50.00% | same 2 commits |
| `redirects/import.ts` | 50.00% | same 2 commits |
| `seo/get-entry.ts` | 40.00% | `d4a10b35` (20:32) — behavior fix, not obviously coverage-focused; unclear if branches added |
| `users/list.ts`, `users/enable.ts`, `comments/moderation-queue.ts` | 66.67% / 44.44% / 50.00% | **none** — no commits since Sep 3 |

**Mechanism, not just delta:** the Sep 3 report's own worst-ranked files were targeted by two dedicated
coverage-closing commits **on the same afternoon**, 2-4 hours after that report's own snapshot. The
report is not wrong about what it measured — it is simply older than the fixes it prompted. Anyone
citing that table today without re-measuring is citing pre-fix numbers for at least 7 of its worst 10
rows. This is the same mechanism found independently in §8 for `apps/admin/src/lib/api.ts` (a report
capturing a true snapshot, then work landing within hours that the report's own reader has no way to
know about without re-running). The 3 files with no fix commits (`users/list.ts`, `users/enable.ts`,
`comments/moderation-queue.ts`) are the ones worth checking against the fresh lcov below — see §7.

Separately, the dual-instantiation contamination fixes (`4d48f645`, `b3748e94`, `96988ca7`, all
2026-09-05 morning) explain why the 2026-09-03 lcov and today's fresh lcov are not directly
comparable even for files with no source changes: today's run should show materially less
contamination on files in Route W's/A's blast radius (theme/widgets/forms/post/media/db-schema
subgraph, `contracts/core/events/*`, `platform/export/*`, `platform/routing/routing.ts`) purely from
the coverage-collection fix, independent of any test-content change.

## 6. Design for a trustworthy recurring measurement (not built)

**MEASURED**: `package.json` already has the right-shaped plumbing, unused as a pipeline —
`test:cov:server` (scoped to `apps/website/src/server/**/*.test.ts` only — narrower than the
forbidden repo-wide `test:cov`, which also runs `packages/*/src` and `apps/site-chat/src`) writes
the same `development/coverage/lcov.info` the two route gates already read. `test:cov:server:unit`
and `:integration` additionally split into `lcov.unit.info`/`lcov.integration.info` for
`check-route-coverage-diff.ts`'s two-tier per-file gate. None of the three currently run in CI or on
a schedule — `check:route-coverage-floor` and `check:route-coverage-diff` both silently trust
whatever stale file happens to be sitting on disk (see §1). A trustworthy recurring measurement
needs exactly three things none of the current gates have:

1. **Run tests as part of the same job that evaluates the gate**, not as a separate, independently-
   scheduled step that a developer might skip. Fold `test:cov:server` (or the tiered pair) into the
   same CI step that then runs `check-route-coverage-floor.ts` / `check-route-coverage-diff.ts`,
   fail-fast on test failure per `route-coverage-lib.ts`'s own header design intent — this is already
   the documented intent, just not wired.
2. **Gate on `check-coverage-integrity.ts` BEFORE trusting the floor/diff numbers.** Run it against
   the fresh `lcov.info` immediately after `test:cov:server` and before either route gate reads it;
   a SEVERE or new-CONTAMINATED result should block, not just advise, because a contaminated block's
   line/branch numbers are not the file's real numbers (see this session's own §7 finding that one
   contaminated file reads dramatically different real vs. corrupted branch%). This closes exactly
   the gap that let `check:route-coverage-floor` report a real-looking 92%+ line number for weeks
   while unrelated to whether any given file's number was trustworthy.
3. **Emit and store the evaluated-file COUNT alongside the percentage, every run**, and alert if it
   drops. `check-route-coverage-floor.ts` already guards against literal zero (§ "Zero measurable
   files"), but a silent partial drop (170 files today vs. 150 next week, say, because a path prefix
   went stale again — this has happened twice per `route-coverage-lib.ts`'s own changelog comment,
   2026-08-28 and 2026-09-02) would still report a plausible-looking percentage over fewer files and
   nobody would notice. A count that's pinned/compared run-over-run turns that silent failure mode
   into a visible one.

None of this requires new tooling — `test:cov:server`, `test:cov:server:tiered`, and
`check-coverage-integrity.ts` all already exist and work; they simply are not chained together and
none of the three run automatically. Per the dispatch's rule ("design it; do not build it"), this is
left as a design, not a PR.

## 7. Ranked gap list

TBD.

## 8. The `api.ts` "~145 untested endpoints" claim — REFUTED, and stale within the hour

Scope note first: this claim (`project_tovu_open_decisions_2026_09_05` memory, sourced from an
admin-coverage sweep) is about `apps/admin/src/lib/api.ts` — the admin SPA's HTTP **client** wrapper,
`vitest`/jsdom, a different app/runner/layer (client call-sites, not server route handlers) than this
dispatch's `apps/website` server-route scope. Verified anyway per explicit instruction.

**MEASURED** (this session, scoped `vitest run --coverage --coverage.include='src/lib/api.ts'`
against all 13 `apps/admin/src/lib/__tests__/api-*.unit.test.ts` files, from `apps/admin/`):

```
Statements   : 93.82% ( 304/324 )
Branches     : 94.02% ( 173/184 )
Functions    : 94.52% ( 207/219 )
Lines        : 95.63% ( 285/298 )
326 tests, 13 files, all passing
```

The claimed figure was **`BRH 91/184` branch (49.46%), `FNH 71/216` functions (32.9%)** — same
branch denominator (184) as my run, wildly different hit count (91 vs. 173). Root cause, MEASURED via
`git log --diff-filter=A`: five of the thirteen test files I ran were created **today, between 11:01
and 11:05** — `api-users`, `api-widgets-endpoints`, `api-assistant`, `api-connectors-policies-forms-
seo-redirects-posts`, `api-long-tail-endpoints`.unit.test.ts. The memory's own frontmatter timestamps
the finding at `2026-09-05T17:13:11Z` UTC (10:13 local) — **about 50 minutes before** those five files
landed. This is not a bad measurement; it's a true snapshot that a concurrent session's work (visibly
targeting this exact open decision) has since obsoleted. **Verdict: claim was accurate when written,
REFUTED as current — do not act on the 145-endpoint number today.** Whoever owns that open-decision
item should close it: functions/branches are both now in the mid-90s, not a "sharded multi-agent pass"
situation any more. (I did not identify who added those files; no attribution claimed.)
