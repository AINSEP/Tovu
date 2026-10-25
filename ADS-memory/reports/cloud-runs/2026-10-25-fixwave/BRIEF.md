<<SUBAGENT_DISPATCH>>
# FIX WAVE F1–F8 — close Stryker test gaps + 100% per-file coverage + CCN ≤ 10 (owner approved 2026-10-25 ~3:15 PM PT). Unattended: verify by measuring, never ask.
Your lane id (F1…F8), packages and Stryker source lanes are in the trigger prompt. Owner rules: tests use DI fakes (no real network/DB unless the package already does), API args (requiredObj, optionalObj = {}), CCN ≤ 10, smallest change, MOVE "why" comments never delete them, no vendor code in core, generic → Jini. Do NOT change product behaviour: you write TESTS; you may refactor ONLY to (a) bring a function to CCN ≤ 10 or (b) make code testable via an injected port — both behaviour-preserving and covered by tests before AND after. If a test reveals a real SOURCE BUG: write the failing test, fix the bug minimally, and put it at the TOP of the report.

## READ FIRST
- ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md and, from branch origin/cloud/overnight-1024-tovu, ADS-memory/reports/cloud-runs/2026-10-25-overnight/COMMON.md (Node 24 setup, Tovu/Jini install+link, test commands, known-failing list).
- YOUR Stryker lane report(s): origin/cloud/stryker-1025-tovu:ADS-memory/reports/cloud-runs/2026-10-25-stryker/L<n>/REPORT.md (+ data/*survivors*). Sections 2 (suspected bugs), 4 (triaged survivors), 5 (no-coverage), 8 (Top 10 tests to write first) are your work list.
- Test anti-pattern guide (may appear mid-run — `git fetch` and re-read at each step): origin/cloud/fixwave-1025-reports:ADS-memory/reports/cloud-runs/2026-10-25-fixwave/TEST-ANTIPATTERNS.md. Until it exists: (1) assert WHICH error, not just failure; (2) arrays with ≥2 items so every≠some; (3) wrong-type/null/empty inputs; (4) one table-driven test per regex/validator: leading junk, trailing junk ("ok\n"), empty, max, max+1, case boundary; (5) assert tool/JSON input schemas (required, additionalProperties:false); (6) memoised factories: same ports → same instance, built once; (7) every security guard (auth/token/ownership/length/loopback) gets a NEGATIVE test that would fail if the guard were removed.

## ORDER OF WORK (stop at the cap wherever you are)
1. Security guards and suspected bugs from your lane report(s) — negative tests first. Lane-specific musts are in the trigger prompt.
2. No-coverage files/ranges → tests.
3. Real-gap survivors, worst-score files first (skip equivalents; note them).
4. Per-file coverage → 100% lines+branches for every NON-UI source file in your scope you touch (measure with the package's coverage: Jini vitest `--coverage --coverage.reportOnFailure=true`; Tovu node:test lcov per COMMON.md). List files still < 100% with the reason.
5. Complexity scan of your scope (`npx eslint --rule 'complexity: ["error", 10]' --rule 'sonarjs/cognitive-complexity: ["warn", 10]'` or lizard if present): refactor CCN > 10 functions in your scope ONLY with tests green before and after.
6. Re-score: Stryker on the files you changed (mutate = those files only, `--force`, same config as the lane report: vitest runner, perTest, StringLiteral excluded, cwd = package dir). Report before → after per file.

## HARD CAPS (first hit → stop new work, write the report, push, END — never "just finish")
- 3 h wall clock (at 2 h 40 m stop new work). ~1.5M tokens. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Kill by pid only. Never cat big logs/JSON whole. Never commit .stryker-tmp, coverage output or reports-data > 1 MB.
- Code pushes ONLY to your lane branch: Jini lanes → Jini `cloud/fixwave-1025-F<n>` (from origin/cloud/overnight-1024-jini); Tovu lanes → Tovu `cloud/fixwave-1025-F<n>` (from origin/cloud/overnight-1024-tovu). Commit + push after each step (small commits, explicit paths, message ends with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>").
- Report pushes ONLY to Tovu `cloud/fixwave-1025-reports`, only `ADS-memory/reports/cloud-runs/2026-10-25-fixwave/F<n>/` — `git pull --rebase` before every push; retry on reject. If a Jini push is refused (403), save `git format-patch` output into your report folder and say so at the top.

## REPORT — `ADS-memory/reports/cloud-runs/2026-10-25-fixwave/F<n>/REPORT.md` (update + push after each step)
1. Headline: tests added, source bugs found/fixed, files at 100% coverage (before → after), CCN>10 functions (before → after), Stryker score before → after per touched file, wall, rough tokens. 2. Source bugs (failing test → fix commit). 3. Per-file table. 4. Anti-patterns seen most (feed AI Dev Shop). 5. NOT done list. 6. Commits. End with "F<n> DONE <UTC>", wall, rough tokens.

## OWNER DECISIONS — DO NOT "FIX" THESE IN SOURCE (added 2:45 PM PT)
Three red security pin tests reflect OWNER-APPROVED behaviour (2026-10-25). Update the TEST to the decision; never change source to satisfy the old pin:
1. database-transfer copies `members.password_hash` — owner: ALLOW in database transfer (never in public/static exports). Update exclusions.unit.test.ts accordingly (and assert it stays out of public/static exports).
2. mcp-ui allowlist containing `members_delete` (and the grown allow-lists/exemption map) — owner SIGNED OFF. Update the allowlist pin.
3. owner policy containing `visitor-tools.manage` — owner: admins AND owner get it. Update wiring.test.ts (owner policy is not `['*']`-only).
