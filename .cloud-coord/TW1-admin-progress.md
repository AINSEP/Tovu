# TW1 admin — cloud coordinator progress

Branch: `cloud/tw1-admin` (from `origin/restructure/apps-website-phased`). Lot branches: `cloud/tw1-admin-<LOT>`.

## Setup (2026-10-20, ~4.3 min total)
- STEP 0: `Linux vm 6.18.44-fc-v139 x86_64`, host `vm`, `/home/user/Tovu`; cloud-proof commit 03ef4c25 pushed.
- Node: container had v22.22.0. No nvm/n/volta. **Worked:** download `node-v24.22.0-linux-x64.tar.xz` from nodejs.org/dist/latest-v24.x into `/opt/node24`, then `export PATH=/opt/node24/bin:$PATH` in every shell.
- AI-Dev-Shop cloned to `/home/user/AI-Dev-Shop`; Jini (general-work) cloned to `/home/user/Jini`.
- Jini: `corepack enable && pnpm install --frozen-lockfile` (28 s) OK; `pnpm --no-bail -r build`: only `@jini-ai/integrations` fails tsc, every package has `dist/`.
- Tovu: `npm ci` at root, apps/admin, apps/site-chat OK; `JINI_PACKAGES_DIR=/home/user/Jini/packages npm run link:jini` linked 57 entries; `require.resolve('@jini-ai/core')` -> Jini dist.
- Worktrees: `/home/user/cx/mkwt.sh <LOT>` = `git worktree add ../wt-<LOT> -b cloud/tw1-admin-<LOT> cloud/tw1-admin` + symlink the 3 node_modules from the main checkout. Resolution works inside worktrees. `node_modules` added to `.git/info/exclude` so the symlinks never show as untracked.
- **Brief correction:** vitest is 4.1.11 — `--minWorkers` is an unknown option (errors). Use `npx vitest run --maxWorkers=2 <files>`.
- Complexity: temp flat config outside the repo at `/home/user/cx/eslint.cx.mjs` (typescript-eslint parser + eslint-plugin-sonarjs from Tovu root node_modules, complexity 10, sonarjs/cognitive-complexity 10, noInlineConfig). Run: `/home/user/Tovu/node_modules/.bin/eslint --no-config-lookup -c /home/user/cx/eslint.cx.mjs -f json <files>` (unix formatter not in eslint 10).
- Baseline violations: 51 across the 33 lot files (`/home/user/cx/baseline.txt`).

## Personas
- Coordinator: loaded `agents/software-architect/skills.md` and `agents/code-inspection/skills.md` (AI-Dev-Shop @ depth-1 clone).
- Subagents: must confirm programmer/refactor/tdd skills.md in their first line (recorded per lot below).

## Lot status
| Lot | Area | Status | Persona confirm | Before→after worst cyc/cog | Coverage | Commits | Verify |
|---|---|---|---|---|---|---|---|
| L084 | components | queued | | | | | |
| L119 | features/sites | queued | | | | | |
| L134 | features/posts | queued | | | | | |
| L162 | features/dashboard | queued | | | | | |
| L166 | features/ai-assistant | queued | | | | | |
| L171 | integrations | queued | | | | | |
| L172 | lib | queued | | | | | |
| L195 | features/security | queued | | | | | |
| L209 | features/taxonomy | queued | | | | | |
| L213 | features/themes | queued | | | | | |

## Problems / notes

## Next
