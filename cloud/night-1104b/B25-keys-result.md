Phase 1 source changes are in place on `merge-1029`, uncommitted and unverified.

Root causes were owner mutations exposed through [attached-vault.ts](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/features/project-keys/attached-vault.ts:13), site-copy fallbacks, and root-specific owner storage. Changes cover canonical app-data storage, reference/grant isolation, owner approval, per-site revoke, one GitHub entry, and removal of saved-key exports.

Added nine regression test files and updated affected contracts. **No tests, typechecks or builds ran.** `git diff --check` passed.

[Handoff, costs and open items](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/P25-phase1-programmer-handoff.txt) · [Files changed and tests added](/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/P25-phase1/files-changed.txt)

Open: runtime/type/complexity verification and deferred gating of already-open provider sessions; those retain the existing reapply/watch lifecycle.

Run from the Tovu clone:

```bash
p25_tests=/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/codex/2026-11-04-night/P25-phase1
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-timeout=60000 --test-concurrency=2 $(cat "$p25_tests/node-test-files.txt")
(cd apps/admin && npx vitest run --maxWorkers=2 $(cat "$p25_tests/vitest-test-files.txt"))
```