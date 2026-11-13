# Session PROM — floating/misused promises in Tovu apps/website (folder: `prom`, cap 90 minutes)
Read `development/cloud/quality-1111/COMMON.md` first and follow it, with these overrides:
- **NO subagents at all.** You alone, plain shell. Don't read source files; the linter does the reading.
- **Hard cap 90 minutes** of wall clock from your first command. At 45 min: commit and push what you have. At the cap, or when done: write RESULTS.md, commit, push to `cloud/quality-1111-prom`, END. Start nothing else.
- Report only. No fixes, and no edits outside `development/cloud/quality-1111/prom/`.
- You need ONLY Tovu. Skip COMMON setup steps 2 and 3 except `npm ci` at the Tovu root (no Jini install/build, no link:jini, no admin/desktop/site-chat installs). The website resolves `@jini-ai/*` from the published npm copies in the root node_modules.

Why this run exists: the previous SEC session linted every other unit but SKIPPED `apps/website` (2,165 files). It ran ONE eslint process with `projectService: true` over all files for 60 minutes at ~4.1 GB and produced nothing, because eslint writes JSON only at exit.

## Steps
1. Copy last run's scripts: `git fetch origin cloud/quality-1111-sec && git show origin/cloud/quality-1111-sec:development/cloud/quality-1111/sec/scripts/promises.eslint.config.mjs > development/cloud/quality-1111/prom/scripts/promises.eslint.config.mjs` (and `run-promises.sh` the same way, for reference). Install the SAME pinned tools in a container-only tool dir outside the repo: eslint 9.39.1, typescript-eslint 8.46.4 (+ @typescript-eslint/parser 8.46.4), typescript 5.9.3 (`npm install --ignore-scripts`). Record versions in RESULTS.md.
2. Use classic project mode, NOT projectService: set `SEC_PROJECT=tsconfig.json` with `SEC_ROOT=/home/user/Tovu` (the Tovu root `tsconfig.json` includes exactly `apps/website/src/**/*.ts`). Same two rules, default options, `noInlineConfig: true`.
3. File list: `git ls-files 'apps/website/src/**.ts'` minus `__tests__`, fixtures, mocks, `*.test.ts`, `.d.ts` (same exclusions as `run-promises.sh`).
4. **Canary (≤10 min):** lint ONE shard of ~100 files; record wall time and peak RSS. From that rate decide the shard count so the whole run fits in ~60 minutes.
5. **Shard** the file list (by top-level folder under `apps/website/src/`, splitting `features/` into several shards). Run at most 3 shards at once with `--max-old-space-size=4096` each (16 GB box); each shard writes its own `raw/promises-shard-<n>.json` + `.txt` stderr, so a cap still leaves finished shards. Biggest shards last.
6. `promises.tsv` (repo, unit, file, line, rule, message) from all finished shards; list every shard as DONE / NOT RUN with its file count. Files the parser couldn't type-load go in `skipped.tsv` with the exact error.
7. RESULTS.md: totals per rule, totals per top-level folder, then EVERY hit listed (file:line, rule, message; no code excerpts), tool versions, canary timing, and any NOT RUN shards. Never counts only.
