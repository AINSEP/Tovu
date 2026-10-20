# TW1 platform — cloud coordinator progress

Coordinator branch: `cloud/tw1-platform` (base `origin/restructure/apps-website-phased`). Started 2026-10-20 01:03 UTC.

## Setup notes
- Container Node was v22.22.0. Node 24 installed via preinstalled nvm: `NVM_DIR=/opt/nvm . /opt/nvm/nvm.sh && nvm install 24` → v24.22.0. Shell state does not persist, so every command prefixes `PATH=/opt/nvm/versions/node/v24.22.0/bin:$PATH`.
- AI-Dev-Shop cloned to /home/user/AI-Dev-Shop. Jini (general-work) cloned to /home/user/Jini; `pnpm install --frozen-lockfile` OK (~22s); `pnpm --no-bail -r build` exits 1 only on integrations test-file tsc errors (expected), all 36 packages have dist.
- Tovu `npm ci` OK at root, apps/admin, apps/site-chat. `npm run link:jini` linked 57 (relative symlinks into ../Jini). `require.resolve('@jini-ai/core')` works in main and in worktrees.
- Worktrees: /home/user/wt-<LOT> on `cloud/tw1-platform-<LOT>`, node_modules symlinked (root, apps/admin, apps/site-chat). Symlinked node_modules show as untracked (gitignore has `node_modules/` with slash) → added `node_modules` to .git/info/exclude.
- Complexity lint: temp flat config in scratchpad (outside repo), eslint 10.8 + @typescript-eslint/parser + eslint-plugin-sonarjs 4.2 from Tovu node_modules, `--no-config-lookup -c <cfg>`. Note: `-f unix` formatter removed in eslint 10; use `-f json`/stylish.
- Setup time: ~6 min (01:03 → ~01:09 UTC).

## Personas
- Coordinator loaded AI-Dev-Shop agents/software-architect/skills.md and agents/code-inspection/skills.md.

## Baseline (58 violations across 34 files)
See lot table; worst per lot recorded as cyc/cog.

## Lot status
| Lot | Files | Baseline worst cyc/cog | Status | After | Coverage | Commits |
|---|---|---|---|---|---|---|
| L023 | site-dir (10 files) | 30/54 (move-sites-home) | dispatched | | | |
| L096 | secrets/vault-kinds | 30/32 | dispatched | | | |
| L142 | db key-dependent-data, vault-credential-inventory | 20/20 | dispatched | | | |
| L147 | db/sqlite journal, share-database | 14/16 | dispatched | | | |
| L243 | db/repos change-set, external-mcp, publish-history | 12/- | dispatched | | | |
| L265 | server-logs/log-file | 13/- | queued | | | |
| L278 | oauth/endpoint-safety | 12/- | queued | | | |
| L279 | site-dir product-root, site-trash (after L023) | 11/11 | queued | | | |
| L114 | assistant (11 files) | 18/12 | queued | | | |
| L275 | assistant/mcp-federation/registrations | 12/- | queued | | | |

## Problems
(none yet)

## Next
