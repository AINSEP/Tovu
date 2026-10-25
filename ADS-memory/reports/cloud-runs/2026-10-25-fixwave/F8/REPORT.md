# F8 — Tovu features + cli (Stryker L14) fix wave

## Run log
- 2026-10-25T21:34Z STARTED. Tovu code branch `cloud/fixwave-1025-F8` from origin/cloud/overnight-1024-tovu @61d219a5. Jini @origin/cloud/overnight-1024-jini at /home/user/Jini (install+build exit 0, linked via link:jini). Node 24.22.
- ENV: `npm rebuild argon2 better-sqlite3 esbuild` fails EUNSUPPORTEDPROTOCOL "workspace:*" after link:jini (linked Jini packages). Will deal with only if a touched test needs it.
- 21:44Z ASSUMPTION/FINDING: L14's per-file scores are partly ARTIFACTS of its test selection (`find-tests.sh | head -4`, same-dir `__tests__` only, directory order). Re-running Stryker (same config) on `publish-content/content-hash.ts` with its own `content-hash.test.ts` gives **100 %** (L14: 66.7 %). `precheck-reasons.ts` is exercised by `ui/__tests__/report-rows.test.ts`, which L14's finder never looks in. Low L14 scores are therefore checked against measured coverage with ALL importing tests before writing tests.
- 21:46Z coverage tool: node:test `--experimental-test-coverage` needs `--enable-source-maps` with tsx, or line numbers point at the wrong lines. Even with it, the leading file-header comment block (and sometimes the first `export function` line) shows as uncovered: a V8/source-map artifact. "code-lines-uncovered" in this report leaves out comment/blank/import lines.
- 21:55Z background re-score of the 17 worst L14 files stopped: `post/repo.memory.ts` has 52 importing test files (dry run 2.4 min), so the full re-score would take hours. Re-scoring only touched files, with targeted tests.
