# Session STATIC — structure + code quality (folder: `static`, cap 2 hours)
Read `development/cloud/quality-1111/COMMON.md` first; follow it exactly. You don't need to run any test suite. Run each tool on Tovu (apps/, packages/, content/) AND Jini (packages/*/src), skipping tests, dist, node_modules, vendor and built plugin bundles (`packages/provider-plugins/plugins/*/<version>/`).

1. Cyclomatic complexity per function (owner ceiling 10): use the repo's eslint complexity config (`npm run complexity:strict` in Tovu) or eslint `complexity` rule with max 10 for Jini. `complexity.tsv` (repo, file, function, line, complexity); totals > 10, > 15, > 25; top 50.
2. Duplication: `npx --yes jscpd@4` (min 50 tokens) over both repos together, so Tovu↔Jini copies show. `duplication.tsv`; total duplicated lines and %; top 50 clone pairs.
3. Dead code: `npm run quality:knip` in Tovu; knip on Jini (best effort config). Unused files / exports / dependencies counts + lists.
4. Import cycles: `npx --yes dependency-cruiser@16` (or madge) per repo; every cycle listed (`cycles.tsv`), plus cross-package cycles in Jini and Tovu feature↔feature cycles.
5. Argument rule: `node development/scripts/args-object-audit.mjs /home/user/Tovu --label Tovu --json …` and the same for /home/user/Jini. Totals + per app/package.
6. Type safety: count `as any`, `: any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!` per repo (rg), and `npx --yes type-coverage@2` per Tovu app / Jini package if it runs in time.
7. Other: semgrep (`npm run quality:semgrep:test` if available, else skip); `await import(` in prod code; files > 500 lines; functions > 80 lines.
8. RESULTS.md: one table of totals per check × repo, then the lists' top 50.
