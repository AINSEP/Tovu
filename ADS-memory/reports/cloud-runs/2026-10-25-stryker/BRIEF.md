<<SUBAGENT_DISPATCH>>
# StrykerJS run 2 — Jini agent-plugins (whole package) + cms plugin-export. Owner approved 2026-10-25 by name ("Sure, let's do those in the cloud"). Unattended: verify by measuring, never ask.
Read ADS-memory/reports/cloud-runs/RUN-PROTOCOL.md and, in ADS-memory/reports/cloud-runs/2026-10-25-overnight/, STRYKER-PILOT.md + stryker.config.json FIRST — the pilot's setup lessons are mandatory (run stryker with cwd = package dir; typescript installed beside Stryker; no `plugins` key; relative `tempDirName: ".stryker-tmp"`; Jini's own vitest 2.1.9).

## HARD CAPS (first hit → stop, write the report, push, END — never "just finish")
- 3 h 30 m wall clock (at 3 h 10 m stop starting new work and write the report).
- ~1M tokens total. No subagents.
- Never push main, never force-push, never npm publish, never create/update/run any RemoteTrigger, never self-reschedule. Kill processes by pid only. Never cat big logs or the mutation JSON whole (tail/grep/node one-liners).
- Push ONLY to Tovu `cloud/stryker-1025-tovu` (reports) and Jini `cloud/stryker-1025-jini` (tests). Commit + push after every part. `git pull --rebase` before each push.

## SETUP
`hostname && nproc`. `git clone --branch cloud/overnight-1024-jini https://github.com/AINSEP/Jini.git /root/Jini && cd /root/Jini && git checkout -b cloud/stryker-1025-jini && pnpm install --frozen-lockfile && pnpm --filter "@jini-ai/agent-plugins..." --filter "@jini-ai/cms..." build`. Tovu: `cd /home/user/Tovu && git fetch origin cloud/stryker-1025-tovu && git checkout -B stryker origin/cloud/stryker-1025-tovu`. Stryker in /root/stryker (core + vitest-runner 9.x + typescript 5), as in the pilot. Do NOT commit Stryker or .stryker-tmp into Jini.
Config for this run (start from the pilot's): `concurrency: 3`, `incremental: true` (incrementalFile under .stryker-tmp), `mutator.excludedMutations: ["StringLiteral"]` (pilot: error-message noise), `disableTypeChecks: true`, reporters json + html + clear-text + progress-append-only. Machine-time estimate from the pilot: ~36 s / 100 mutants at concurrency 2.

## PARTS (in order; report after each)
0. **Close the pilot's 15 real gaps** in `packages/agent-plugins/src/lifecycle/__tests__/unit/exports.unit.test.ts` (listed in STRYKER-PILOT.md §3 "(a)" — non-string aliases/templates/entries, every→some cases, map-key and path regexes, non-empty `errors` assertions; one parametrised `toContain(message)` test is fine). Tests only — no source edits. Re-run Stryker on exports.ts and report the new score. Commit `test(agent-plugins): close Stryker exports.ts gaps` on the Jini branch, push. Budget: ≤ 30 min, ≤ 0.15M tokens.
1. **agent-plugins `src/lifecycle/**`** (not tests).
2. **agent-plugins `src/admin-surfaces/**`**.
3. **agent-plugins remaining `src/*.ts`** + **cms `packages/cms/src/widgets/html/plugin-export.ts`** (cms runs from packages/cms with its own vitest config).
If a part's mutant count would push past the wall cap, mutate a subset (largest validator/guard files first) and say exactly what was skipped.

## TRIAGE (bounded — this is where tokens go)
Per file: mutants, killed, survived, no-coverage, timeout, score. Then only for files with score < 80% OR ≥ 10 survivors: classify survivors as (a) real test gap (name the missing assertion), (b) equivalent, (c) noise — up to 15 survivors per file, summarise the rest by mutator. **No-coverage** mutants = code no test executes: list those files/ranges explicitly. Flag anything that looks like an actual source BUG (not a test gap) separately at the top — do not fix it.

## REPORT
`ADS-memory/reports/cloud-runs/2026-10-25-stryker/STRYKER-RUN-2.md` on `cloud/stryker-1025-tovu` (+ json reports if < 5 MB each; else just summaries). Sections: 1. headline (total score, mutants, wall, tokens), 2. suspected source bugs (or "none"), 3. per-file table, 4. triaged survivors, 5. no-coverage ranges, 6. part 0 result (score before → after, commit), 7. what Stryker does NOT catch (type checks off, StringLiteral excluded, indirect kills, untested inputs), 8. recommended next slices + what tests to write first. End with "STRYKER RUN 2 DONE <UTC>", wall, rough tokens.
