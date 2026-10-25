# F8 — Tovu features + cli (Stryker L14) fix wave — REPORT

## 1. Headline
- **Tests added:** 38 commits on Tovu `cloud/fixwave-1025-F8`: 27 new test files and 6 extended ones, ~3,000 lines, **~160 new test cases**. Every touched test file run together (32 files): **227/227 pass**. All fakes are DI or temp git/SQLite fixtures; no network.
- **Source bugs found: 0 confirmed.** No new test contradicted intended behaviour.
- **Security-policy gaps found (need an owner decision, NOT fixed — see §2):** (a) `secrets_vault` rows are refused for send-by-hand only because one column is named `owner_key`; (b) several per-install tables (mail suppression list, consent revisions, user settings, tool approvals…) can be sent by hand; (c) backup copies of secret files (`.npmrc.bak`, `.mcp.x.json.bak`, `site.db.bak`, `backup.sqlite3`, a file literally named `.pem`/`.key`) pass the publish file-tree deny-list; (d) `secret-scan-guard` never scans file NAMES.
- **Source changes (behaviour-preserving):** only `webhooks/secret-scan-guard.ts`. It now takes injected `repoRoot`, `patterns` and CLI `log/error/exit` ports, all defaulted. `main()` is split (`reportSection`) to keep CCN ≤ 10. Byte-identical CLI output is pinned by the spawned-CLI test. Tests were green before and after (35/35).
- **CCN > 10 in touched/scope files: 1 → 0.** My own port injection pushed `main()` to 12 and I fixed it. The scope scan (features files worked on + all of `cli/`) found no other function over 10.
- **Coverage:** every non-UI source file I touched is at **100 % code lines**, with the 2-file exception listed in §3. Branches are 100 % except the listed unreachable or defensive ones.
- **Stryker before (L14) → after.** Same config: tap runner, `coverageAnalysis: off`, StringLiteral excluded, `--force`, cwd = repo. "After" runs the file's own tests plus the new ones.

| file | L14 | after |
|---|---|---|
| forms/agent-tools.ts | 13.5 | **100** |
| pages/agent-tools.ts | 34.1 | **100** |
| plugin-runtime/agent-tools.ts | 28.6 | **100** |
| trash/agent-tools.ts | 60.0 | **100** |
| trash/registry.ts | 60.9 | **100** |
| trash/move-to-trash.ts | 50.7 | **100** |
| publish-content/precheck-reasons.ts | 12.5 | **100** |
| publish-content/content-hash.ts | 66.7 | **100** (no new test: L14's test selection caused the low score) |
| custom-credentials/custom-credential-create-ui.ts | 44.3 | **100** |
| custom-credentials/plugin-credential-card.ts | 2.2 | **98.6** |
| deploy-ops/registry.ts | 87.2 | **98.5** |
| publish-content/export-bundle.ts | 54.7 | **98.1** |
| post/slug.ts | 68.6 | **97.1** |
| deploy-targets/host-kit.ts | 88.3 | **96.1** |
| trash/trash-item-tool.ts | 28.8 | **93.2** |
| deployments/deploy-config-registry.ts | 71.5 | **92.4** |
| post/expected-version.ts | 73.7 | **89.5** |
| custom-credentials/credential-copy-tool.ts | 83.0 | **84.4** (the instance-gate and catalog survivors L42/L60 are now killed) |
| publish-content/raw-row-contributor.ts | 65.8 | **83.7** (rest: guard clauses that later checks also cover, i.e. defence in depth) |
| deploy-ops/typed-secret-card.ts | 63.3 | **82.7** |
| webhooks/secret-scan-guard.ts | 57.3 | **86.6** (24 survivors left, all in the git-output parsers L281–342: equivalent or unreachable with real git, e.g. `rev-list --objects` already lists each object once, so first-seen vs last-seen path cannot differ) |
| consent / site-backup tool catalogs | 74.6 / 79.6 | catalog mutants **all killed**; handler mutants show as NoCoverage in this targeted run (their own suites were not included), so the whole-file % is not comparable |
| backstop-policy.ts, share-registry.ts, post/search.ts, file-tree-policy.ts, deploy-ops/secrets.ts, redirects/tool-registrations.ts, site-key-sources.ts, repo-handler.ts | — | tests added; not re-scored with full suites (time). The anchor survivors at backstop-policy L8–11 remain on purpose, see §2(b) |

- **Wall:** 21:34Z → ~23:05Z (~1 h 30 m of the 3 h cap). **Tokens:** ~0.45M of the ~1.5M cap.

## 2. Source bugs / suspected gaps (owner decision; NOTHING changed in source)
None of these is a contradiction with documented behaviour, which is why they are reported and not fixed (BRIEF: change source only for a real bug).
- **(a) `secrets_vault` defence by coincidence.** `BACKSTOP_DENIED_TABLE_PATTERNS` has no `secrets_vault` entry. On the real migrated schema its rows are refused only because the column `owner_key` matches `/key/`. **Pinned** by `backstop-policy.deny-table.unit.test.ts` "REGRESSION PIN", so a column rename now fails a test. Suggest adding `/^secrets_vault/` to the table deny-list.
- **(b) Sendable per-install tables.** Measured on a freshly migrated content DB (100 tables): `checkRawTable` allows, among others, `mail_suppression`, `mail_suppression_removals`, `mail_feedback_inbox`, `site_consent_heads/revisions`, `setting_values_user`, `external_mcp_tool_approvals`, `agent_tool_attempts`, `form_delivery_jobs/plans`, `domain_binding`. These are only reachable by a principal with `publish.backstop` selecting rows by hand. Also, the system-table patterns are `^`-anchored, so `x_deployment` / plural `deployments` pass. This is the reason I did NOT pin the "allowed look-alike" cases, which would have cemented the gap.
- **(c) File-tree deny-list misses backups.** `checkTreePath` allows `.mcp.local.json.bak`, `x.mcp.local.json`, `.npmrc.bak`, `site.db.bak`, `backup.sqlite3`, and files named exactly `.pem` / `.key` (`extensionOf` treats a leading-dot name as having no extension). File content may still be secret-scanned elsewhere; not verified.
- **(d) Secret scanner ignores file names.** `secret-scan-guard` scans blob content (tip and history) but never paths, so a credential-shaped filename is not caught.
- **Weak assertion found and fixed (test-only):** `typed-secret-card.test.ts` asserted `/success/` and `/failure/` against the whole outcome page. Both words appear in every page's shared CSS/JS, so those assertions could never fail. They now assert the status line's `data-state` and text.

## 3. Per-file coverage (node:test lcov with `--enable-source-maps`; "code lines" leaves out comments/imports — the leading header comment always reads uncovered under V8+tsx)
| file | lines | branches | not covered (why) |
|---|---|---|---|
| webhooks/secret-scan-guard.ts | 100 % code (except the `main()` auto-run guard) | 75/79 | malformed `git cat-file` record L340/342 (unreachable with real git); default-root history scan of the real repo L369 |
| trash/move-to-trash.ts, trash/trash-item-tool.ts, trash/agent-tools.ts, trash/registry.ts | 100 % | 100 % | |
| publish-content/export-bundle.ts, precheck-reasons.ts, raw-row-contributor.ts (181/181), repo-handler.ts (lines), content-hash.ts | 100 % | 100 % except repo-handler 111/118 | |
| custom-credentials/plugin-credential-card.ts | 100 % | 68/69 | L88 `pluginForm.details ?? []`: pluginCardDetails always returns an array |
| custom-credentials/custom-credential-create-ui.ts | 100 % | 25/25 | |
| forms, pages, plugin-runtime `agent-tools.ts` | 100 % | 100 % | |
| deploy-ops/registry.ts, typed-secret-card.ts (35/35), host-kit.ts (63/63), deploy-config-registry.ts (260/260 lines, 115/119) | 100 % | as listed | |
| post/slug.ts, post/repo.memory.ts (L59–64 now covered, with memory-vs-SQL parity on every dialect), post/expected-version.ts | 100 % | 100 % | |
| cli/commands/owner-store.ts | 312/315 | 96/111 (was 72/98) | `unhandledAction` is a `never` branch; the default output/exit ports |

## 4. Anti-patterns seen most (for AI Dev Shop)
1. **Measurement artifact (new, #1):** L14 picked tests by `head -4` of same-dir importers and never ran `cli/`. That made well-tested files look 2–67 %. A mutation lane must select tests by the import graph, uncapped, before anyone triages its numbers.
2. **AP5 declarative contracts.** 9 catalogs or registries were unasserted: forms, pages, plugin-runtime, trash, consent, site-backup, credential-copy, TRASHABLE, trash_item. Fixed with inline `deepEqual` after stripping descriptions, plus Ajv good/extra-key checks.
3. **AP1 bare or vacuous assertions:** the regex-on-whole-page outcome checks above.
4. **AP4 happy-string regex:** slug, deploy-op host/id/module path, share token/id/file, site-key id, file-tree id segment, backstop deny-list.
5. **AP7 guard without a negative test:** owner-store stdin contract, raw-row address decoder, credential-copy gates. Each refusal is now shown to happen before the store or database is touched.
6. **AP2 singletons:** adjacent scanner matches, first-seen history path, multi-chunk proof body.

## 5. NOT done
- No full-suite re-score (all importers) for: backstop-policy, share-registry, consent and site-backup catalogs, post/search, file-tree-policy, deploy-ops/secrets, redirects/tool-registrations, site-key-sources, repo-handler. They have targeted tests only.
- L14 files not touched: html-document-store.memory, hidden-until-script, host-binding, lipay-plugin, uninstall-confirmation-ui, media-references, run-ops, raw-file-contributor, api-connections/*, share-service, table-adapter, trash/repo.
- Not mutation-scored: `cli/` (L14 never ran it; this run measured coverage and added owner-store negatives only).
- Equivalent survivors noted, not chased: slug `/-+$/`; export-bundle L275 `?? []`; host-kit L82 (throw inside try → false); deploy-ops/registry L35/L39; raw-row-contributor decodeId clauses that later checks also cover.
- Stale doc comment: `trash/agent-tools.ts` `trashToolEntityTypes` says "the bespoke six"; it is seven (`theme`). Pinned in the test, comment left as is.
- BRIEF owner decisions 1–3 (database-transfer, mcp-ui allowlist, wiring owner policy) are in lanes L7/L11, not F8. Not touched.
- ENV: `npm rebuild argon2 better-sqlite3 esbuild` fails after `link:jini` (`workspace:*`). Not needed: better-sqlite3 loaded fine.
- Typecheck: `tsc -p tsconfig.json` passes with 0 errors. `tsconfig.tests.json` has 344 pre-existing errors, **0 in any F8 file** (8 of mine were found and fixed mid-run). ESLint on touched files: 0 errors.

## 6. Commits (Tovu `cloud/fixwave-1025-F8`, base `61d219a5`)
- `8235c35e` test(post): search text extraction — hostile shapes, block separators, exact budget and depth bounds
- `491858c6` test(deploy-ops): assert the typed-secret outcome's rendered status, not a word in the page's shared CSS
- `bda513ad` test(publish-content): repo-handler gatewayDeps per-dep refusal and okOrThrow identity
- `0a7743de` test(post): versionConflictEnvelope structured 409 body
- `c0651291` test(publish-content): raw-row empty-pk address and each missing gateway dep
- `c14fe4b7` test(deploy-ops): secret list 500-row cap/truncation boundary and field clipping
- `e359348a` test(publish-content): file-tree id-segment table, per-kind base dirs, secret-name refusals at any depth
- `3ef88361` test(site-backup): inline backup/import/share tool catalog contract + oneOf url/uploadId table
- `b62d743f` test(site-backup): share-registry id/token/file regex tables and refuse-before-write guards
- `f3504bb1` test(deployments): bundled deploy-config hints — candidate-path order/dedupe, single-workflow rule, contained-path table
- `64889b5d` test(redirects): redirects_import batch-size guard — each clause and the max boundary
- `41dd6d2e` test(consent): inline consent tool catalog contract + derived-risk agreement
- `81447202` test(custom-credentials): credential copy gates — owner, RBAC and instance asked for system.write, refusals before inventory
- `803ae448` test(webhooks): isSafeSiteKeyId regex table (separators, dot-only, bounds, junk)
- `853b1f00` test(publish-content): backstop deny-list tables per regex + real-schema pin that sealed-credential rows are never sendable
- `b5155f1b` test: fix typecheck of new F8 tests (Ajv 6 options, assertion-narrowing, field cast)
- `93640024` refactor(webhooks): keep secret-scan-guard main() at CCN <= 10 after port injection
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

F8 DONE 2026-10-25T23:05Z — wall ~1 h 31 m, ~0.45M tokens

## Run log
- 2026-10-25T21:34Z STARTED. Tovu code branch `cloud/fixwave-1025-F8` from origin/cloud/overnight-1024-tovu @61d219a5. Jini @origin/cloud/overnight-1024-jini at /home/user/Jini (install+build exit 0, linked via link:jini). Node 24.22.
- ENV: `npm rebuild argon2 better-sqlite3 esbuild` fails EUNSUPPORTEDPROTOCOL "workspace:*" after link:jini (linked Jini packages). Will deal with only if a touched test needs it.
- 21:44Z ASSUMPTION/FINDING: L14's per-file scores are partly ARTIFACTS of its test selection (`find-tests.sh | head -4`, same-dir `__tests__` only, directory order). Re-running Stryker (same config) on `publish-content/content-hash.ts` with its own `content-hash.test.ts` gives **100 %** (L14: 66.7 %). `precheck-reasons.ts` is exercised by `ui/__tests__/report-rows.test.ts`, which L14's finder never looks in. Low L14 scores are therefore checked against measured coverage with ALL importing tests before writing tests.
- 21:46Z coverage tool: node:test `--experimental-test-coverage` needs `--enable-source-maps` with tsx, or line numbers point at the wrong lines. Even with it, the leading file-header comment block (and sometimes the first `export function` line) shows as uncovered: a V8/source-map artifact. "code-lines-uncovered" in this report leaves out comment/blank/import lines.
- 21:55Z background re-score of the 17 worst L14 files stopped: `post/repo.memory.ts` has 52 importing test files (dry run 2.4 min), so the full re-score would take hours. Re-scoring only touched files, with targeted tests.
- 23:02Z DONE. Final secret-scan-guard re-score 86.6 %. Tovu `cloud/fixwave-1025-F8` and reports branch pushed and verified on origin.
