<<SUBAGENT_DISPATCH>>
# StrykerJS measure-only lanes L1–L7 (owner approved 2026-10-25: "just test it… know the gaps… do all that first"). REPORT ONLY — no source or test edits anywhere. Unattended: verify by measuring, never ask.
Read ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md and, in ADS-memory/reports/cloud-runs/2026-10-25-overnight/, STRYKER-PILOT.md + stryker.config.json FIRST. Pilot lessons are mandatory: run stryker with cwd = the package dir; typescript 5 installed beside Stryker; no `plugins` key; relative `tempDirName: ".stryker-tmp"`; use the package's own vitest. Never commit Stryker/.stryker-tmp anywhere.

## HARD CAPS (first hit → stop, write the report, push, END — never "just finish")
- 4 h wall clock (at 3 h 40 m stop starting new mutation runs and write the report).
- ~1M tokens. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Kill by pid only. Never cat big logs or mutation JSON whole (tail/grep/node one-liners).
- Push ONLY to Tovu `cloud/stryker-1025-tovu`, only your own files: `ADS-memory/reports/cloud-runs/2026-10-25-stryker/L<n>/`. Other lanes push to the same branch in parallel: `git pull --rebase` before every push; retry on reject.

## SETUP
`hostname && nproc && date -u`. Jini: `git clone --branch cloud/overnight-1024-jini https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && pnpm install --frozen-lockfile && pnpm --filter "<each lane package>..." build`. Tovu reports: `cd /home/user/Tovu && git fetch origin cloud/stryker-1025-tovu && git checkout -B stryker origin/cloud/stryker-1025-tovu`. Stryker in /root/stryker: `@stryker-mutator/core@^9 @stryker-mutator/vitest-runner@^9 typescript@5` (+ `@stryker-mutator/tap-runner@^9` if your lane has node:test code).
Config (from the pilot's): `testRunner vitest`, `coverageAnalysis perTest`, `concurrency 3`, `incremental true`, `mutator.excludedMutations ["StringLiteral"]`, `disableTypeChecks true`, reporters json + clear-text + progress-append-only (html only if < 5 MB).
**mutate** = the package's non-UI source: `src/**/*.ts`, excluding `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`, `**/*.d.ts`, `**/*.tsx`, generated files, pure type/barrel files.

## PLAN BEFORE RUNNING
For each package, count mutants first (`stryker run --dryRunOnly` logs "Instrumented N files with M mutants"; or a mutate-only quick count) and time the dry run. Pilot rate: ~36 s / 100 mutants at concurrency 2 with fast tests — measure your own. If the lane won't fit the clock, order files by risk (security, auth, permissions, money, data integrity, validators/guards, parsers first; logging/formatting last), run that ordered subset, and list exactly what was NOT run. A partial run with a clear "not run" list beats a timeout with nothing.

## TRIAGE (bounded — this is where tokens go)
Per file: mutants, killed, survived, no-coverage, timeout, score. Classify survivors (a) real test gap (name the missing assertion in one line), (b) equivalent, (c) noise only for files with score < 80% OR ≥ 10 survivors, up to 10 survivors per file; summarise the rest by mutator. List **no-coverage** files/ranges (code no test executes) explicitly. Anything that looks like an actual SOURCE BUG goes at the top of the report — do not fix it.

## REPORT — `ADS-memory/reports/cloud-runs/2026-10-25-stryker/L<n>/REPORT.md` (commit + push after each package, not only at the end)
1. Headline: packages, files, mutants run / total, score, wall, rough tokens. 2. Suspected source bugs (or "none"). 3. Per-file table (worst score first). 4. Triaged survivors. 5. No-coverage ranges. 6. NOT RUN list. 7. What these numbers do NOT catch (type checks off, StringLiteral excluded, indirect kills, untested inputs, UI/.tsx excluded). 8. Top 10 tests to write first, ranked by risk. End with "L<n> DONE <UTC>", wall, rough tokens.
