# L7 — Tovu website security (Stryker measure-only) — IN PROGRESS
## Step 1 — tap-runner proof (16:00 UTC): WORKS
`@stryker-mutator/tap-runner@9.6.1`, Node 24.22, cwd = repo root, config `step1-config.json` (nodeArgs `--import tsx --experimental-test-module-mocks --test-reporter=tap`, env `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json`, testFiles = member-login/__tests__/link-policy.test.ts, coverageAnalysis off, StringLiteral excluded, type checks off).
- `member-login/link-policy.ts`: 47 mutants instrumented, 37 scored: killed 36, survived 1, **97.30 %**. Whole `stryker run` 24 s (dry run 0.4 s overhead; 2 procs).
- Survivor: line 8:26 OptionalChaining `member?.id` → `member.id` — real gap (a connect attempt with member=null should return "conflict", not throw; add a test with `member: null, connectMemberId: "x"`).
- Note: tap-runner only knows test-file granularity (one `node` process per test file per mutant), so cost/mutant = number/duration of test files run.
