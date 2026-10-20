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
| L023 | site-dir (10 files) | 30/54 | PART 1 MERGED (8/10, verify OK, 183 tests); sites-home + site-registry with fresh agent (L023b) | 9/9 | 100/100/100 (8 files) | 3cfe7d41 6f5f1284 2bf78c8e cde58aa9 46a48384 93346945 edb5690a c282a81d |
| L096 | secrets/vault-kinds | 30/32 | MERGED (verify OK, 97 tests) | 10/9 | 100/100/100 | 101043e1 |
| L142 | db key-dependent-data, vault-credential-inventory | 20/20 | MERGED (verify OK, 37 tests) | 7/8 | 100/100/100 | b528df8d, 6749970c |
| L147 | db/sqlite journal, share-database | 14/16 | MERGED (verify OK, 50 tests) | ≤10/≤10 | 100/100/100 | d609fc90, ab768c4c |
| L243 | db/repos change-set, external-mcp, publish-history | 12/4 | MERGED (verify OK, 108 tests) | 10/6 | 100/100/100 | e30707a9, 239c8533, 79f03956 |
| L265 | server-logs/log-file | 13/8 | MERGED (verify OK, 20 tests) | 9/8 | 100/100/100 | 98696795 |
| L278 | oauth/endpoint-safety | 12/- | MERGED (verify OK, 48 tests; +172 consumer tests per agent) | ≤10/≤10 | 100/100/100 | a1ab42cd |
| L279 | site-dir product-root, site-trash (after L023) | 11/11 | queued | | | |
| L114 | assistant (11 files) | 18/12 | PART 1 MERGED (9/11, verify OK, 143 tests); byok-tool-surface + external-mcp-oauth with fresh agent (L114b) | 10/9 | 100/100/100 (ext-mcp-connection-source branch 96.4: tsx-injected CJS check in lazy import, unreachable) | 21fcdc39 4794de41 6b420912 f40b738d 3e7b48ed cbd13799 2754a079 |
| L275 | assistant/mcp-federation/registrations | 12/9 | MERGED (verify OK, 79 tests) | 7/4 | 100/100/100 | 95f597f1 |

## Problems
- Pre-push hook (apps/desktop/scripts/hooks/pre-push) misfires on the FIRST push of a new branch from a worktree: `git diff HEAD @{push}` fails (no @{push}) so it runs desktop gates, which fail here (no electron). Fix used: push lot branches from the main checkout (`cd /home/user/Tovu && git push -u origin <lot-branch>`), where @{push} resolves and the hook correctly skips. Never --no-verify.
- Root tsc/typecheck:tests failed only on missing `@tovu/sdk` dist → fixed by `npm run build` in packages/sdk (dist gitignored). Add to SETUP next wave.
- Subagents shared a `tsc.done` marker name in the scratchpad → told later lots to use lot-specific marker names.

- CONTEXT CAP: L023 subagent ran to ~362k tokens / 146 tool calls (OVER the 300k hard cap) before stopping; L114 reached ~285k / 155 calls. Big multi-file lots (10-11 files) are too large for one subagent: split lots >5 files next wave. Continuation agents told to stay ≤100 tool calls.
- L023 agent started the local Postgres cluster (pg_ctlcluster 16 main start) and created superuser role `root` for Postgres pins (PGHOST=/var/run/postgresql PGUSER=root).
- Shared scratchpad: an L142 helper script (red.py) collided with L023's same-named file. Give each lot its own scratch subdir.

## Bugs pinned (reported, not fixed)
- L096 vault-meta-rules: normalization status wrapped in an array (e.g. ["conflict"]) is accepted (String() coercion).
- L265 log-file: when the tail byte budget starts exactly on a line boundary, the first complete entry is dropped as "torn".
- L147 share-database: final secret byte scan (requireShareSecretFree/redactSecretShapes, outside lot) misses a token glued to the previous text column (no word boundary).

- L275 registrations: host-policy confirmation card's writeShapedInputs come only from call args; Jini's own card also uses schema write-shaped names (inconsistent).

## Cross-area / out-of-scope flags
- L023: added optional ports inspectStoppedDatabase(…,{verifyIntegrity}), createRawFileSitePort(…,{filesystem}), exported isOutsideRoot(…,{pathApi}). development/scripts/__tests__/sites-move-home.test.ts left in development/ (off-limits).
- L114: assistant-vault-compat dropped `?? ""`/`?? false` fallbacks (VaultRecord types them non-null); ask-choice isRecord takes positional arg (type predicate).
- L275: assistant/__tests__/mcp-federation.adapter-memory.test.ts doc comment still names the moved test file; 'Federated tool arguments must be an object.' could name the tool.
- L096: keyring derive/deriveSigningSecret exist only for Jini's KeyringPort type (Jini change to drop).
- L142: snapshotVaultCredentials counts a missing COUNT row as 0 (unreachable with real SQL; pinned).
- L147: SiteShareRefusal has no `cause`; appendInterruptedRow ignores params.siteId; findNonTerminalForSite doc claims O(1) via index but filters in memory.
- L147 error messages changed: "Invalid portable columns for 'X': its portability policy names a column the table does not declare."; "Cannot build portable plugin schema for '<pluginId>': …".
- L147 added optional seams prepareSharePluginTables(…, {modules}), sanitizeShareDatabase(…, {statfs}) + exported StagingSpacePort type.

## Next
- L278: assertSafeProviderEndpoint / assertSafeUserFacingUrl (legacy testing/DB seam) have no production callers — owner decides on removal.
