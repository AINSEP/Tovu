# TW1 inbound — cloud coordinator progress

Coordinator branch: `cloud/tw1-inbound` (from `origin/restructure/apps-website-phased`). Lot branches: `cloud/tw1-inbound-<LOT>`.

## Setup (2026-10-20, ~01:03–01:12 UTC, ~9 min incl. fixes)
- STEP 0: `Linux vm 6.18.44-fc-v139 x86_64 / host vm / /home/user/Tovu / node v22.22.0` → cloud-proof commit pushed.
- Node 24: env only had /opt/node20-22. Worked: download `node-v24.22.0-linux-x64.tar.xz` from nodejs.org (sha256 checked) → /opt/node24, symlink node/npm/npx/corepack into `/root/.local/bin` (ahead of /opt/node22/bin on PATH). `corepack enable --install-directory /root/.local/bin` for pnpm.
- AI-Dev-Shop cloned to /home/user/AI-Dev-Shop. Jini (general-work) cloned to /home/user/Jini; pnpm install 32 s; `pnpm --no-bail -r build`: only `@jini-ai/integrations` fails tsc (expected), every package has dist.
- Tovu: `npm ci` root + apps/admin + apps/site-chat OK. `link:jini` OK (57 relative links).
- EXTRA STEP NEEDED: `npm run build -w packages/sdk` (workspace `@tovu/sdk` has no dist after npm ci; integration tests fail with ERR_MODULE_NOT_FOUND .../@tovu/sdk/dist/index.js). Must be run in every worktree (dist is per checkout).
- Worktrees: `../wt-<LOT>` with node_modules symlinked to main checkout (+ admin, site-chat). Symlinks are not matched by `.gitignore`'s `node_modules/` → added `/node_modules`, `/apps/admin/node_modules`, `/apps/site-chat/node_modules` to `.git/info/exclude`. `require.resolve('@jini-ai/core')` OK in worktrees.
- GOTCHA: `node --test` with an empty file list runs the WHOLE suite (hung >2 min). Always pass explicit test files.
- Complexity check: temp flat config in coordinator scratchpad (outside repo), wrapper `cx.sh <files>` (eslint from Tovu devDeps, typescript-eslint parser, sonarjs, noInlineConfig). Baseline over all 9 lots: 72 errors.

## Personas
- Coordinator: loaded software-architect/skills.md and code-inspection/skills.md (01:05 UTC).

## Lots
| Lot | Status | Subagent | Before worst cyc/cog | After | Coverage | Commits | Verify |
|---|---|---|---|---|---|---|---|
| L055 publish-content | queued | | | | | | |
| L082 public-http/http/site | queued | | | | | | |
| L092 plugins | queued | | | | | | |
| L100 public-http/routes | queued | | | | | | |
| L125 media | queued | | | | | | |
| L140 assistant daemon | queued | | | | | | |
| L143 agent-plugins | queued | | | | | | |
| L175 settings | queued | | | | | | |
| L191 middleware | queued | | | | | | |

## Problems / notes

## Next
