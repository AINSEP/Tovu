# tvzcheck — Tovuize up-front choice: verify + commit (2026-10-17)

Commit: 6d49ebc77 (15 files, explicit paths). Not pushed.
Excluded (other lanes): bundled-inactive-gating.integration.test.ts (shopify hunk), all *.css, apps/admin/**, development/todos.md, _fixtures.ts, ADR-069/admin-theme docs, sites/**.

## Tests (node --test, root TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json, --experimental-test-module-mocks, --test-concurrency=1, under lock)
71/71 pass, 0 fail (log: run1.log). Static top-level test() counts (some loop-generated, so the sum is 68 vs 71 executed):
- bundled-tovu-theme-package.unit.test.ts: 16
- ask-choice-tool.test.ts: 17
- tool-registrations.theme-import-file.test.ts: 10
- theme-file-import.test.ts: 12
- batch-tool-inputs.test.ts: 13

## RED -> GREEN (scratch copy of apps/website/src + content + packages, node_modules symlink; deleted after)
Neutralised: importThemeFileFromLocalFile used unguarded fs.readFileSync(path.resolve(root, sourcePath)) with no destination validation; tool skipped assertThemeFileWritable for theme_import_local_file.
RED (log: red.log), 22 tests, 19 pass / 3 fail — exactly the new guard tests:
- theme_import_local_file: preview, trash and compiled destinations refuse valid local fonts without writing — "Missing expected rejection."
- local import refuses secrets, escapes, symlinks, empty and mismatched bytes without replacing a file — "Missing expected rejection."
- local import rejects an oversized font at the guarded reader's import limit — assertion failed (not FsFilePathError)
GREEN: live tree 71/71.

## Typecheck
`NODE_OPTIONS=--max-old-space-size=6144 npx tsc -p tsconfig.tests.json --noEmit` (covers all apps/website/src incl. tests): rc=2, 36 errors, NONE in the file set. Other lanes' files (not fixed): cross-site-read-catalog.test.ts (3, principalRepo/SettingsPrincipalLookupPort), human-confirm.lifecycle, chat-delete-grant.unit, consent/adapters, resolve-by-label.unit, account-label-heal-scheduler.unit, static-token-setup.unit (5), pages/tool-registrations, post/tool-registrations.model-facing-errors, server-logs-tool.unit, theme-watcher.test, vendor-credentials/vault-adapter.unit, web/tool-registrations.unit (2), vault-kinds.unit, process-logs.unit (2), native-fallback-wiring.unit (2), observability-middleware (6), peer-site-reads.fixture (3), peer-site-reads.test, vault-unified-credentials.integration. Full log: tsc.log.

## HOME
Before/after identical: sites.json md5 96f40f997441d64d6af9fecd5a9db918, site-keys 860, ~/Documents/Tovu = luvira order-pinch plannie tovu-dev zoran. No leftover test processes.

## Pending
- Served-skill check: boot reseeds content/agent-plugins/tovu-theme as v1.1.0 — NOT done (no server restart/reseed; another agent capturing on :3000).
- Mutation for the new guards: not run (no mutation today); candidate lane rows: theme-file-import.ts importThemeFileFromLocalFile/persistThemeImport, import-theme-file-tool.ts handler.
