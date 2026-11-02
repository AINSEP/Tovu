# Cloud test run — integ/merge-1029 (2026-11-02) — REPORT ONLY

## HARD CAPS (iron rule — overrides everything)
- Wall clock: 90 minutes from your first command. At 80 minutes stop starting new steps, write RESULTS, push, END.
- Single agent. Do NOT spawn subagents. Do NOT fix product code or tests. Only two commits are allowed (Jini lockfile, Jini plugin catalog) plus the results folder.
- If a setup step fails twice, record it in RESULTS and move on to the next step.

## Repos (pre-cloned)
- /home/user/Tovu and /home/user/Jini. In BOTH: `git fetch origin integ/merge-1029 && git checkout -B integ/merge-1029 origin/integ/merge-1029`.

## Setup
- Node 24: download the linux-x64 tarball from nodejs.org into ~/.local/node24; prefix EVERY command with `export PATH=$HOME/.local/node24/bin:$PATH;`. `corepack enable --install-directory $HOME/.local/node24/bin`.
- No Postgres, no Chromium, no IPv6 in this box: tests needing those count as ENV failures (list them separately).
- Save raw output of every step as `raw/<step>.txt` (NOT .log — Tovu .gitignore drops *.log).

## Jini (/home/user/Jini)
1. `pnpm install` (NOT frozen — the lockfile is stale on purpose). If pnpm-lock.yaml changed: `git commit -m "chore(lock): refresh pnpm-lock for agent-plugin subpaths and provider-plugins (cloud)" -- pnpm-lock.yaml`.
2. `pnpm --no-bail -r build`.
3. `pnpm --filter @jini-ai/plugin-catalog generate`. If packages/plugin-catalog/catalog.json changed: commit it alone ("chore(catalog): regenerate plugin catalog (cloud)").
4. Push those commits: `git push origin integ/merge-1029`.
5. Tests — only test files CHANGED vs origin/main (`git diff --name-only origin/main...HEAD`), plus these suites:
   - `pnpm test:agent-plugins:content`
   - each changed vitest file, run per package: `pnpm --filter <pkg> exec vitest run --maxWorkers=2 --minWorkers=1 <files>`
   - `pnpm vitest run --maxWorkers=2 --minWorkers=1 scripts/__tests__/{check-plugin-isolation,plugin-package-gates,assemble-agent-plugin-package,standalone-agent-plugin.integration,check-agent-plugin-content,check-package-layers,build-script-workspace-deps,script-entrypoints}.test.ts`
   - `pnpm guard:plugins ; pnpm guard ; pnpm guard:plugins:packed ; pnpm complexity:strict`
   - typecheck every package that has changed files: `pnpm --filter <pkg> typecheck` (or `exec tsc --noEmit -p .`), plus `npx tsc -p scripts/tsconfig.json --noEmit`.

## Tovu (/home/user/Tovu)
1. package.json names Jini versions that are not published yet (@jini-ai/agent-plugins ^0.6.19, @jini-ai/provider-plugins, @jini-ai/agentic ^0.6.18). To install: copy package.json to /tmp, temporarily set those three back to the versions in package-lock.json (drop provider-plugins), `npm ci`, then restore package.json from /tmp (`git diff --exit-code package.json` must be clean afterwards). Do not commit any of this.
2. `npm run build --workspace @tovu/sdk` BEFORE linking. Then `npm run link:jini` pointed at /home/user/Jini (check the script for its env var/path; Jini is built from step 2 above). Confirm node_modules/@jini-ai/provider-plugins and agent-plugins resolve to /home/user/Jini.
3. `npm run agent-plugins:compose`.
4. `cd apps/desktop && npm run build:preload` (desktop tests need it).
5. Tests — only test files CHANGED vs origin/main, by runner:
   - website/content/development node:test files: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 <files>` (batch ~40 files per call)
   - content/agent-plugin-overlays/**/__tests__/*.test.mjs: `node --test --test-concurrency=1 <files>` (fly-deploy workflow parity is EXPECTED to fail until the publish — mark it EXPECTED)
   - apps/admin vitest files: `cd apps/admin && npx vitest run --maxWorkers=2 <files>`
   - apps/desktop node:test files: `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <files>`
   - `npx tsc -p tsconfig.tests.json --noEmit` ; `cd apps/admin && npx tsc --noEmit` ; `cd apps/desktop && npm run typecheck` (if present)
   - `npm run quality:properties ; node development/scripts/check-hardwiring.mjs ; npm run complexity:strict`

## Report
- Write /home/user/Tovu/cloud-results/2026-11-02-integ/RESULTS.md: per step PASS/FAIL/ENV/EXPECTED with duration; then LIST EVERY FAILING TEST AND EVERY ERROR (file, test name, first assertion/error line) — never counts only. Separate: product failures vs ENV vs EXPECTED.
- `git add -f cloud-results/2026-11-02-integ && git commit -m "test(cloud): integ/merge-1029 results" -- cloud-results && git push origin integ/merge-1029` (Tovu). END.
