# F8 — Tovu features + cli (Stryker L14) fix wave — REPORT (interim, updated as work lands)

## 1. Headline
- **Tests added: 21 commits, 17 new test files + 5 extended, ~150 new test cases.** Every test is DI-fake or a temp git/SQLite fixture. Nothing touches the network.
- **Source bugs found: 0.** No new test exposed a contradiction with intended behaviour. One behaviour-preserving refactor for testability: `secret-scan-guard.ts` now takes injected `repoRoot`, `patterns` and CLI `log/error/exit` ports, all defaulted. One stale doc comment found (see §5).
- **Main finding about L14 itself:** many L14 low scores were caused by its test selection, not real test gaps. Its finder took `head -4` importing tests, searched only same-dir `__tests__`, and never ran `cli/`. Re-scoring with the file's real tests (same config) gives `content-hash.ts` **100 %** (L14: 66.7) and `precheck-reasons.ts` **100 %**. `post/repo.memory.ts` has 100 % branches across its 52 importing suites (L14: 28 %, 122 no-cov). So L14 scores below about 70 % should be re-measured before acting on them.
- **Stryker before → after** (same config as L14: tap runner, coverageAnalysis off, StringLiteral excluded, `--force`; "after" uses the file's own tests plus the new ones):

| file | L14 | after | remaining survivors |
|---|---|---|---|
| forms/agent-tools.ts | 13.5 | **100** | – |
| pages/agent-tools.ts | 34.1 | **100** | – |
| plugin-runtime/agent-tools.ts | 28.6 | **100** | – |
| trash/agent-tools.ts | 60.0 | **100** | – |
| trash/move-to-trash.ts | 50.7 | **100** | – |
| publish-content/precheck-reasons.ts | 12.5 | **100** | – |
| publish-content/content-hash.ts | 66.7 | **100** (no new test needed: L14 selection artifact) | – |
| post/slug.ts | 68.6 | **97.1** | 1 equivalent (`/-+$/`→`/-$/`: toSlug already collapses repeated hyphens) |
| deploy-ops/registry.ts | 87 | **98.5** | 4: L35 startsWith→endsWith (equivalent: the empty-segment check subsumes it), L39 typeof host (equivalent: a number has no length), L70 optional-verb type check, L151 refusal-suffix message |
| custom-credentials/plugin-credential-card.ts | 2.2 | **96.4** before the follow-up commit `1e814f74`, which targets the 4 survivors (not re-scored) | |
| publish-content/export-bundle.ts | 54.7 | **92.5** before follow-up `90717264`, which targets L240/241 (not re-scored); L275 `?? []` is equivalent | |
| trash/trash-item-tool.ts | 28.8 | **89.0** before follow-up `9c5497b3`, which targets L259/260/267/346/366/388 | |
| webhooks/secret-scan-guard.ts | 57.3 | **84.8** before follow-up `d2c5cb7a` (allowlist entries, adjacent matches, first-seen path) | git-output parser defensive branches (L311–342) are equivalent or unreachable with real git |

## 2. Source bugs
None. Every new test passed against unmodified source, except where the test itself was wrong; those tests were fixed.

## 3. Per-file coverage (node:test lcov, `--enable-source-maps`; "code lines" leaves out comments/imports, see run log)
| file | lines (code) | branches | tests that measure it | note |
|---|---|---|---|---|
| webhooks/secret-scan-guard.ts | 100 % (all but the `main()` auto-run guard L438–440) | 70/75 | ports.unit + existing | unreachable: malformed `git cat-file` record L340/342; default-root history scan (real repo) L369 |
| trash/move-to-trash.ts | 100 % | 30/30 | | |
| publish-content/export-bundle.ts | 100 % | 67/67 | | |
| publish-content/precheck-reasons.ts | 100 % | 9/9 | | |
| custom-credentials/plugin-credential-card.ts | 100 % | 68/69 | | L88 `pluginForm.details ?? []` unreachable (pluginCardDetails always returns an array) |
| custom-credentials/custom-credential-create-ui.ts | 100 % | 25/25 | | |
| forms, pages, plugin-runtime, trash `agent-tools.ts` | 100 % | 100 % | | |
| deploy-ops/registry.ts | 100 % | 90/90 | | |
| deploy-ops/typed-secret-card.ts | 100 % | 35/35 (was 26/33) | | |
| deploy-targets/host-kit.ts | 100 % | 63/63 | | |
| post/slug.ts | 100 % | 7/7 | | |
| post/repo.memory.ts | 100 % (L59–64 `listHtmlByKind` newly covered, with memory-vs-SQL parity on every dialect) | 71/71 | 52 suites | |
| trash/trash-item-tool.ts | 100 % | 55/55 | own + assistant/theme/composition suites | |
| trash/registry.ts | 100 % | 2/2 | inline contract | |
| publish-content/raw-row-contributor.ts | 100 % | 181/181 (was 124/142) | | |
| cli/commands/owner-store.ts | 312/315 | 96/111 (was 72/98) | unit + integration | L171–173 `unhandledAction` is a `never` branch; default ports L82/96/97 |
| cli/** (other files, unit suite) | see run log | | | L14 never ran `cli/`; most files are already at 100 % lines under the unit suite |

## 4. Anti-patterns seen most (for AI Dev Shop)
1. **Measurement artifact (new, top):** a mutation score computed with a capped or same-dir-only test selection hides the tests that actually cover a file. Always select by import graph, uncapped, before triaging.
2. AP5 unasserted declarative contracts: 5 tool catalogs plus the TRASHABLE registry. Fixed with inline `deepEqual` after stripping descriptions, plus Ajv good/extra-key checks.
3. AP4 happy-string regex: slug, deploy-op host/id/module path. Fixed with full tables (leading/trailing junk, `\n`, case, max/max+1).
4. AP7 guards without negative tests: owner-store stdin contract, raw-row address decoder. Fixed by showing each refusal happens before the store or database is touched (recording fakes).
5. AP2 singleton inputs: the secret scanner's adjacent matches, and first-seen path dedupe in history.

## 5. NOT done / follow-ups
- Not re-scored after their last follow-up commits: plugin-credential-card, export-bundle, trash-item-tool, secret-scan-guard. Cost: 5–15 min each.
- The L14 files not reached here (share-registry, hidden-until-script, host-binding, lipay-plugin, uninstall-confirmation-ui, post/search, html-document-store.memory) already have ≥ 97 % line coverage under their own tests. Their L14 survivors are assertion gaps that still need triage.
- Stale comment: `trash/agent-tools.ts` `trashToolEntityTypes` doc says "the bespoke six"; there are seven today (`theme` was added). Pinned in the test, comment left unchanged (source not touched).
- Possible scanner gap, reported only: `secret-scan-guard` never scans file NAMES, neither at the tip (`ls-files` content only) nor in history (tree objects are filtered out). A credential-shaped filename would pass. Owner decision.
- `cli/` was never mutation-scored (L14 skipped it). This run only measured coverage and added owner-store negative tests.
- OWNER DECISIONS 1–3 in BRIEF (database-transfer, mcp-ui allowlist, wiring owner policy) are outside lane F8's scope (L7/L11). Not touched.

## 6. Commits (Tovu `cloud/fixwave-1025-F8`)
- `d2c5cb7a` test(webhooks): secret-scan-guard — every allowlist entry, adjacent matches, first-seen history path
- `5b1704aa` test(cli): owner-store stdin contract — malformed/unknown-field/path-escape/put-shape refusals never open owner.db
- `9c5497b3` test(trash): trash_item closed schema, entity-scoped authorize on both paths, read-version enforcement
- `bc922974` test(deploy-ops): typed secret card — success outcome, dismissal, pre-aborted call, masked multiline field
- `9aa40d67` test(trash): inline TRASHABLE registry contract (permissions, markers, purge order)
- `5092c90f` test(publish-content): raw-row contributor — address guards refuse before any read, value/column/pk/workspace rules, apply/undo refusals
- `857ce2ad` test(custom-credentials): create-credential card shape and outcome card pins
- `90717264` test(publish-content): carriable address index — string-only slugs, id beats slug, first slug wins
- `1e814f74` test(custom-credentials): kill plugin-credential-card survivors (secret non-token field, static http origin, no-loader warn)
- `8a72f051` test(post): listHtmlByKind parity — in-memory repo vs SQL on every dialect
- `b418c2f2` test(deploy-targets): content-proof cap boundary, multi-chunk count, non-ok short-circuit, redirect/timeout init
- `811f9475` test(pages,plugin-runtime,trash): inline agent-tool catalog contracts + schema boundary checks
- `db10edb3` test(trash): trash_item delegate mappings, declared kind enum, generic null-version/refusal paths
- `e725a958` test(post): regex tables for SLUG_FORMAT_PATTERN and automatic-slug detection
- `1d8f9e0a` test(deploy-ops): per-clause table for module-path containment, host/id regex anchors and size limits
- `40d187f2` test(forms): inline contract for the forms agent-tool catalog + schema boundary tables
- `fc025198` test(custom-credentials): plugin-credential-card — server-owned fields, HTTPS/credential-free guards, card matching
- `2a1eca1d` test(publish-content): pin every precheck-reason sentence and its report-rows rewrite
- `af96aaa3` test(publish-content): buildExportBundle/packAuthorizedEntities through the real registry
- `faa23220` test(trash): moveToTrash mover hand-over + null version/subtitle normalisation
- `8129b526` test(webhooks): secret-scan-guard ports — allowlist clauses, skip-extensions, size cap, binary, CLI paths



## Run log
- 2026-10-25T21:34Z STARTED. Tovu code branch `cloud/fixwave-1025-F8` from origin/cloud/overnight-1024-tovu @61d219a5. Jini @origin/cloud/overnight-1024-jini at /home/user/Jini (install+build exit 0, linked via link:jini). Node 24.22.
- ENV: `npm rebuild argon2 better-sqlite3 esbuild` fails EUNSUPPORTEDPROTOCOL "workspace:*" after link:jini (linked Jini packages). Will deal with only if a touched test needs it.
- 21:44Z ASSUMPTION/FINDING: L14's per-file scores are partly ARTIFACTS of its test selection (`find-tests.sh | head -4`, same-dir `__tests__` only, directory order). Re-running Stryker (same config) on `publish-content/content-hash.ts` with its own `content-hash.test.ts` gives **100 %** (L14: 66.7 %). `precheck-reasons.ts` is exercised by `ui/__tests__/report-rows.test.ts`, which L14's finder never looks in. Low L14 scores are therefore checked against measured coverage with ALL importing tests before writing tests.
- 21:46Z coverage tool: node:test `--experimental-test-coverage` needs `--enable-source-maps` with tsx, or line numbers point at the wrong lines. Even with it, the leading file-header comment block (and sometimes the first `export function` line) shows as uncovered: a V8/source-map artifact. "code-lines-uncovered" in this report leaves out comment/blank/import lines.
- 21:55Z background re-score of the 17 worst L14 files stopped: `post/repo.memory.ts` has 52 importing test files (dry run 2.4 min), so the full re-score would take hours. Re-scoring only touched files, with targeted tests.
