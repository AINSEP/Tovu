# L14 — Tovu website remaining features + cli (Stryker measure-only)
Run 16:49Z–20:35Z (~3h45 wall), ~0.2M tokens. Runner: tap-runner 9.6.1 (node:test via tsx, Node 24.22), per-file scoped testFiles (≤4 test files importing the mutated file), concurrency 4, coverageAnalysis off, StringLiteral excluded, type checks off, incremental off. No source/test edits.

## 0. Scope caveats (read first)
- **apps/website/src/cli/ was NOT RUN** — my driver queue covered `features/` only; the 3h40 no-new-runs cutoff passed before I could add it. Re-run with the same driver (data/run-one.sh).
- Queue stopped at the 3h40 cutoff, at api-connections/contribution.ts. Everything after it (see NOT RUN) is untouched. Within each feature dir files were ordered smallest-first, so the largest files of a dir were the ones most likely reached last or not at all.
- Jini clone/install was denied by the permission classifier in this run, so tests importing `@jini-ai/*` fail to load (installed package lacks e.g. `validateAgentPluginExportProps`). 31 files hit that/other dry-run failures and are listed unscored. @tovu/sdk had to be built mid-run (first ~4 failures were that; later ones are the Jini mismatch).
- Excluded from queue: member-login, identity, members, settings, mail, database-transfer (L7), `ui/` dirs, index.ts, types.ts, files <600 B or ≥30 KB. 41 queued files have no unit test importing them (listed).

## 1. Suspected source bugs
None confirmed. (All 1,814 survivors read as test gaps or equivalents; none showed a contradiction with intended behaviour in the lines sampled.)

## 2. Survivors by mutator (all scored files)
ConditionalExpression 608, ObjectLiteral 276, Regex 176, LogicalOperator 156, EqualityOperator 141, MethodExpression 90, ArrayDeclaration 88, BooleanLiteral 74, OptionalChaining 62, BlockStatement 53, ArrowFunction 47, ArithmeticOperator 28, UnaryOperator 12, AssignmentOperator 3.

## 3. Triage (bounded)
(a) real gaps — judged from the listed survivor lines; (b)/(c) not individually classified except where noted. ObjectLiteral/BooleanLiteral survivors in `agent-tools.ts` / `*-card.ts` / `tool-registrations` are mostly **tool-schema declarations nobody asserts** (pages/agent-tools 34%, forms/agent-tools 13.5%, trash/agent-tools 60%, plugin-runtime/agent-tools 28.6%): (a) low-to-medium — a snapshot/contract test of the registered tool definition (authorization.permission, inputSchema.required, additionalProperties:false) would kill them.
- **webhooks/secret-scan-guard.ts (57%)**: ALLOWLIST matcher L154 `file && patternName && value` mutated to `true`/`||` survives → (a) HIGH: no test proves a non-allowlisted finding is still reported; SKIP_EXTENSIONS emptied survives; 43 no-cov mutants.
- **trash/move-to-trash.ts (51%)**: L116 unknown-type guard and L141 expectedVersion conflict check can be removed with no test failing; L150/152 display & expectedVersion carry-over unasserted → (a) HIGH (data-integrity on delete).
- **publish-content/content-hash.ts (67%)**: EXCLUDED_KEYS emptied and the null/array/object normalisation branches (L92–94) survive → (a) HIGH: hash stability across key order/excluded fields not asserted; affects publish diffing.
- **publish-content/export-bundle.ts (55%)**: slug/address selection L236–240 and held-entity filter survive; 31 no-cov → (a) HIGH.
- **publish-content/raw-row-contributor.ts (66%, 126 survivors / 462)**: largest survivor pile in the run → (a) needs round-trip contributor tests.
- **post/repo.memory.ts (28%, 122 no-cov), post/repo.ts (46%), pages/html-document-store.memory.ts (54%)**: in-memory repos are barely exercised by the tests that import them (mostly the sqlite repos are tested) → (a) medium; also reduces value of memory-repo as a test double.
- **custom-credentials/plugin-credential-card.ts (2.2%, 133 no-cov of 173)**: effectively untested → (a) HIGH (credential UI card); **custom-credential-create-ui.ts 44%**.
- **deployments/deploy-ops/registry.ts** (87% but 34 survivors): L35 module-path validator `.mjs`, not-absolute checks — each sub-condition mutated to `true` survives → (a) HIGH: path-traversal/absolute-path guard for deploy-op modules not tested per-clause; L19 platforms-length boundary (EqualityOperator, boundary 32) → (a) boundary test. **typed-secret-card.ts 63%**: locale/abort and secret field flags unasserted.
- **deploy-targets/host-kit.ts (88%)**: response-size cap L93 `bytes > 4096` boundary and L78 `!ok || !body` unasserted → (a).
- **post/slug.ts (69%)**: format regex anchoring/char class (Regex mutants) → (a) tests for rejected slugs (uppercase, spaces, trailing junk).
- trash/registry.ts 61% (25 surv), post/search.ts 64% (29), pages/agent-tools 34% — see table; not individually classified (budget).

## 4. No-coverage hot spots (nothing executes them)
plugin-credential-card.ts (133), post/repo.memory.ts (122), trash/trash-item-tool.ts (83), secret-scan-guard.ts (43), post/repo.ts (35), export-bundle.ts (31), trash/move-to-trash.ts (29). Full per-file survivor lines + no-cov line numbers are in section 7 (files <80% or ≥10 survivors).

## 5. What these numbers do NOT catch
Type checks off (type-only mutants uncounted); StringLiteral excluded (error codes/messages/permission strings unchecked — notable for permission names and reason codes); tap-runner has no per-test coverage so a killed mutant may be killed by an unrelated test file in the scoped set; only tests that *import the file by name* (≤4, same feature __tests__) were run — indirect/integration tests elsewhere were not, so scores can be understated for files tested only through other modules and overstated nowhere; tests failing to load (Jini env) leave those files wholly unscored; UI/.tsx and ui/ dirs excluded; timeouts counted as detected.

## 6. Top 10 tests to write first
1. secret-scan-guard: finding not in ALLOWLIST is reported; each ALLOWLIST clause (file/pattern/value) individually required; SKIP_EXTENSIONS honoured.
2. move-to-trash: unknown type rejected; expectedVersion mismatch → conflict; display/expectedVersion recorded in marker.
3. content-hash: key-order independence, EXCLUDED_KEYS ignored, null/undefined/array/object normalisation.
4. export-bundle: held-entity exclusion and slug-address selection (empty slug, non-string slug).
5. deploy-ops/registry: per-clause tests for module path (.mjs, no leading /, no traversal) and platforms length 32/33.
6. plugin-credential-card + custom-credential-create-ui: render/submit paths (secret never echoed).
7. raw-row-contributor round-trip (export→import) tests.
8. Tool-definition contract tests for pages/forms/trash/plugin-runtime agent-tools (permission + required inputs + additionalProperties:false).
9. host-kit: 4096-byte cap boundary, non-ok/no-body responses.
10. slug format pattern: rejected-input table; memory repos (post/pages) behavioural parity with sqlite repo.

## Headline
- 180 files scored, 19490 mutants (killed+timeout 12885, survived 1814, no-coverage 684); score **83.8%** (StringLiteral excluded, type checks off, tap-runner file-granular, coverageAnalysis off).
- Files with no unit test importing them (NOTESTS): 41. Files whose scoped test run failed in the dry run (not scored): 31. Files never reached (NOT RUN): 361.

## Per-file table (worst first)
| file | mutants | killed | timeout | survived | no-cov | score |
|---|---|---|---|---|---|---|
| features/custom-credentials/plugin-credential-card.ts | 173 | 3 | 0 | 2 | 133 | 2.2 |
| features/publish-content/precheck-reasons.ts | 16 | 1 | 0 | 4 | 3 | 12.5 |
| features/forms/agent-tools.ts | 118 | 7 | 0 | 45 | 0 | 13.5 |
| features/post/repo.memory.ts | 242 | 66 | 0 | 47 | 122 | 28.1 |
| features/plugin-runtime/agent-tools.ts | 40 | 2 | 0 | 5 | 0 | 28.6 |
| features/trash/trash-item-tool.ts | 199 | 42 | 0 | 21 | 83 | 28.8 |
| features/pages/agent-tools.ts | 222 | 15 | 0 | 29 | 0 | 34.1 |
| features/custom-credentials/custom-credential-create-ui.ts | 106 | 27 | 0 | 23 | 11 | 44.3 |
| features/post/repo.ts | 214 | 35 | 1 | 8 | 35 | 45.6 |
| features/trash/move-to-trash.ts | 81 | 36 | 0 | 6 | 29 | 50.7 |
| features/pages/html-document-store.memory.ts | 132 | 60 | 0 | 43 | 8 | 54.1 |
| features/publish-content/export-bundle.ts | 110 | 57 | 1 | 17 | 31 | 54.7 |
| features/webhooks/secret-scan-guard.ts | 277 | 107 | 3 | 39 | 43 | 57.3 |
| features/trash/agent-tools.ts | 37 | 9 | 0 | 5 | 1 | 60 |
| features/trash/registry.ts | 223 | 39 | 0 | 25 | 0 | 60.9 |
| features/deployments/deploy-ops/typed-secret-card.ts | 128 | 60 | 2 | 28 | 8 | 63.3 |
| features/plugins/lipay/lipay-plugin.ts | 13 | 7 | 0 | 4 | 0 | 63.6 |
| features/post/search.ts | 100 | 54 | 2 | 29 | 3 | 63.6 |
| features/publish-content/raw-row-contributor.ts | 462 | 267 | 0 | 126 | 13 | 65.8 |
| features/plugin-runtime/uninstall-confirmation-ui.ts | 16 | 4 | 0 | 2 | 0 | 66.7 |
| features/publish-content/content-hash.ts | 35 | 16 | 0 | 8 | 0 | 66.7 |
| features/post/slug.ts | 39 | 24 | 0 | 11 | 0 | 68.6 |
| features/site-backup/share-registry.ts | 186 | 104 | 0 | 37 | 9 | 69.3 |
| features/pages/hidden-until-script.ts | 169 | 99 | 0 | 43 | 0 | 69.7 |
| features/plugin-runtime/host-binding.ts | 119 | 64 | 0 | 17 | 10 | 70.3 |
| features/post/search-index.postgres.ts | 51 | 19 | 0 | 6 | 2 | 70.4 |
| features/deployments/deploy-config-registry.ts | 330 | 208 | 0 | 53 | 30 | 71.5 |
| features/post/reverters.ts | 104 | 70 | 0 | 16 | 10 | 72.9 |
| features/post/expected-version.ts | 22 | 14 | 0 | 2 | 3 | 73.7 |
| features/consent/tool-registrations.ts | 193 | 88 | 0 | 30 | 0 | 74.6 |
| features/trash/repo.ts | 134 | 49 | 5 | 16 | 2 | 75 |
| features/webhooks/site-key-sources.ts | 153 | 91 | 0 | 26 | 3 | 75.8 |
| features/publish-content/repo-handler.ts | 213 | 152 | 0 | 25 | 19 | 77.6 |
| features/deployments/deploy-config.ts | 99 | 53 | 0 | 12 | 3 | 77.9 |
| features/publish-content/gated-hooks.ts | 49 | 34 | 0 | 8 | 1 | 79.1 |
| features/site-backup/tool-registrations.ts | 240 | 129 | 0 | 33 | 0 | 79.6 |
| features/publish-content/connect-destination.ts | 37 | 28 | 0 | 7 | 0 | 80 |
| features/consent/settings-link.ts | 119 | 79 | 2 | 20 | 0 | 80.2 |
| features/publish-content/raw-file-contributor.ts | 369 | 256 | 0 | 62 | 0 | 80.5 |
| features/forms/form-file-storage.ts | 37 | 26 | 0 | 6 | 0 | 81.3 |
| features/webhooks/keyring.env.ts | 176 | 113 | 0 | 17 | 9 | 81.3 |
| features/publish-content/push-plan.ts | 64 | 48 | 0 | 11 | 0 | 81.4 |
| features/api-connections/connect.ts | 131 | 84 | 10 | 21 | 0 | 81.7 |
| features/publish-content/media-references.ts | 224 | 160 | 1 | 36 | 0 | 81.7 |
| features/consent/host.ts | 23 | 18 | 0 | 4 | 0 | 81.8 |
| features/forms/publish-content.ts | 47 | 27 | 0 | 6 | 0 | 81.8 |
| features/plugins/store/store-plugin.ts | 12 | 9 | 0 | 2 | 0 | 81.8 |
| features/site-backup/import-restore-placement.ts | 127 | 86 | 0 | 18 | 0 | 82.7 |
| features/custom-credentials/credential-copy-tool.ts | 390 | 218 | 16 | 35 | 13 | 83 |
| features/post/html-plain-text.ts | 145 | 87 | 4 | 18 | 0 | 83.5 |
| features/publish-content/bundle-staging.ts | 45 | 36 | 0 | 7 | 0 | 83.7 |
| features/webhooks/seal-aad-invariant.ts | 124 | 79 | 1 | 8 | 7 | 84.2 |
| features/deployments/deploy-ops/run-ops.ts | 478 | 335 | 11 | 55 | 9 | 84.4 |
| features/site-backup/share-backend.ts | 86 | 59 | 1 | 11 | 0 | 84.5 |
| features/webhooks/http.memory.ts | 15 | 11 | 0 | 2 | 0 | 84.6 |
| features/publish-content/backstop-preview.ts | 111 | 79 | 0 | 14 | 0 | 84.9 |
| features/publish-trust/keys.ts | 62 | 34 | 0 | 6 | 0 | 85 |
| features/publish-content/backstop-policy.ts | 176 | 124 | 0 | 21 | 0 | 85.5 |
| features/post/search-index.ts | 121 | 58 | 12 | 9 | 2 | 86.4 |
| features/redirects/tool-registrations.ts | 200 | 117 | 0 | 12 | 6 | 86.7 |
| features/plugins/store/store-runtime.ts | 113 | 66 | 0 | 5 | 5 | 86.8 |
| features/deployments/deploy-ops/registry.ts | 316 | 231 | 0 | 34 | 0 | 87.2 |
| features/plugins/snapshot.ts | 49 | 34 | 0 | 5 | 0 | 87.2 |
| features/trash/table-adapter.ts | 268 | 198 | 0 | 28 | 1 | 87.2 |
| features/form-destinations/connection-port.ts | 16 | 14 | 0 | 2 | 0 | 87.5 |
| features/publish-content/file-blob-index.ts | 25 | 20 | 1 | 3 | 0 | 87.5 |
| features/api-connections/surface-connections.ts | 123 | 100 | 0 | 14 | 0 | 87.7 |
| features/trash/tool-registrations.ts | 105 | 71 | 0 | 8 | 2 | 87.7 |
| features/trash/permissions.ts | 50 | 36 | 0 | 5 | 0 | 87.8 |
| features/deployments/deploy-ops/secrets.ts | 368 | 270 | 0 | 36 | 0 | 88.2 |
| features/publish-content/disconnect-tool.ts | 48 | 30 | 0 | 3 | 1 | 88.2 |
| features/deployments/deploy-targets/host-kit.ts | 107 | 84 | 7 | 12 | 0 | 88.3 |
| features/publish-content/content-references.ts | 80 | 53 | 0 | 7 | 0 | 88.3 |
| features/site-backup/push-jobs.ts | 70 | 50 | 4 | 7 | 0 | 88.5 |
| features/post/publish-content.ts | 338 | 244 | 0 | 30 | 0 | 89.1 |
| features/plugin-runtime/set-enabled-confirmation-ui.ts | 35 | 17 | 0 | 0 | 2 | 89.5 |
| features/api-connections/form-delivery-connection.ts | 63 | 44 | 0 | 5 | 0 | 89.8 |
| features/consent/readiness.ts | 117 | 79 | 1 | 9 | 0 | 89.9 |
| features/custom-credentials/vault-repo.ts | 199 | 162 | 0 | 14 | 4 | 90 |
| features/post/search-index.memory.ts | 14 | 9 | 0 | 1 | 0 | 90 |
| features/site-backup/share-policy.ts | 97 | 27 | 0 | 3 | 0 | 90 |
| features/trash/entry-sql.ts | 27 | 18 | 0 | 2 | 0 | 90 |
| features/api-connections/plugin-state.ts | 112 | 91 | 0 | 9 | 1 | 90.1 |
| features/publish-content/file-tree-policy.ts | 419 | 262 | 0 | 28 | 0 | 90.3 |
| features/site-backup/import-verifier.ts | 22 | 19 | 0 | 2 | 0 | 90.5 |
| features/api-connections/hook-http.ts | 12 | 10 | 0 | 1 | 0 | 90.9 |
| features/consent/revisions.repo.ts | 54 | 41 | 0 | 4 | 0 | 91.1 |
| features/publish-content/composite-blob-source.ts | 40 | 31 | 0 | 3 | 0 | 91.2 |
| features/form-destinations/select.ts | 66 | 42 | 0 | 4 | 0 | 91.3 |
| features/post/cover-image.ts | 270 | 224 | 4 | 21 | 0 | 91.6 |
| features/consent/settings.ts | 108 | 79 | 0 | 5 | 2 | 91.9 |
| features/site-backup/share-service.ts | 174 | 129 | 0 | 11 | 0 | 92.1 |
| features/redirects/publish-content.ts | 86 | 48 | 0 | 4 | 0 | 92.3 |
| features/form-destinations/registry.ts | 279 | 216 | 0 | 16 | 1 | 92.7 |
| features/post/go-live.ts | 75 | 64 | 0 | 5 | 0 | 92.8 |
| features/plugin-runtime/built-ins/content-analyzer/plugin.ts | 15 | 13 | 0 | 1 | 0 | 92.9 |
| features/site-backup/plan-store.ts | 45 | 37 | 3 | 3 | 0 | 93 |
| features/plugin-runtime/declarative-content-types.ts | 331 | 245 | 0 | 18 | 0 | 93.2 |
| features/post/template-options.ts | 15 | 14 | 0 | 1 | 0 | 93.3 |
| features/publish-content/peer-url.ts | 83 | 56 | 0 | 4 | 0 | 93.3 |
| features/deployments/static-publish/inspection.ts | 52 | 43 | 0 | 3 | 0 | 93.5 |
| features/publish-content/backstop-service.ts | 324 | 265 | 0 | 18 | 0 | 93.6 |
| features/plugin-runtime/declarative-enable.ts | 18 | 15 | 0 | 1 | 0 | 93.8 |
| features/post/featured-image.ts | 59 | 46 | 0 | 3 | 0 | 93.9 |
| features/publish-content/seed-hash.ts | 17 | 16 | 0 | 1 | 0 | 94.1 |
| features/trash/not-trashed.ts | 48 | 32 | 0 | 2 | 0 | 94.1 |
| features/post/content-stats-tool.ts | 207 | 161 | 0 | 10 | 0 | 94.2 |
| features/deployments/export-run.ts | 62 | 47 | 3 | 3 | 0 | 94.3 |
| features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts | 299 | 232 | 0 | 14 | 0 | 94.3 |
| features/post/repo.rows.ts | 74 | 66 | 0 | 2 | 2 | 94.3 |
| features/api-connections/browser-binding.ts | 66 | 51 | 0 | 3 | 0 | 94.4 |
| features/plugin-runtime/install-tool.ts | 100 | 68 | 0 | 3 | 1 | 94.4 |
| features/publish-content/destination-credential.ts | 21 | 17 | 0 | 1 | 0 | 94.4 |
| features/forms/import-remote-submissions.ts | 80 | 69 | 0 | 4 | 0 | 94.5 |
| features/consent/validation.ts | 185 | 142 | 0 | 8 | 0 | 94.7 |
| features/publish-trust/handshake-client.ts | 149 | 110 | 0 | 6 | 0 | 94.8 |
| features/site-backup/push-engine.ts | 126 | 109 | 1 | 6 | 0 | 94.8 |
| features/plugin-runtime/invocation-core-deps.ts | 44 | 37 | 0 | 2 | 0 | 94.9 |
| features/plugins/disk-headroom.ts | 21 | 19 | 0 | 1 | 0 | 95 |
| features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts | 129 | 102 | 0 | 5 | 0 | 95.3 |
| features/api-connections/vault-stores.ts | 149 | 127 | 0 | 6 | 0 | 95.5 |
| features/deployments/deploy-targets/registry.ts | 550 | 449 | 0 | 21 | 0 | 95.5 |
| features/form-destinations/pull.ts | 72 | 64 | 0 | 3 | 0 | 95.5 |
| features/custom-credentials/credential-recovery.ts | 28 | 22 | 0 | 1 | 0 | 95.7 |
| features/api-connections/byo-client.ts | 31 | 24 | 0 | 1 | 0 | 96 |
| features/plugin-runtime/plugin-export.ts | 29 | 24 | 0 | 1 | 0 | 96 |
| features/plugins/migration-recovery.ts | 28 | 24 | 0 | 1 | 0 | 96 |
| features/form-destinations/rewrite-actions.ts | 66 | 49 | 0 | 2 | 0 | 96.1 |
| features/forms/form-destination-manifest.ts | 30 | 27 | 0 | 1 | 0 | 96.4 |
| features/plugins/plugin-identity.ts | 77 | 57 | 0 | 2 | 0 | 96.6 |
| features/publish-content/report-labels.ts | 146 | 127 | 0 | 4 | 0 | 96.9 |
| features/plugin-runtime/install-archive.ts | 210 | 162 | 1 | 5 | 0 | 97 |
| features/site-backup/import-verifier-projection.ts | 81 | 64 | 0 | 2 | 0 | 97 |
| features/site-backup/share-zip.ts | 76 | 64 | 0 | 2 | 0 | 97 |
| features/vendor-credentials/vault-adapter.ts | 225 | 193 | 0 | 5 | 1 | 97 |
| features/forms/submission-ip-expiry-sweep.ts | 39 | 33 | 0 | 1 | 0 | 97.1 |
| features/publish-trust/provisioning.ts | 297 | 235 | 0 | 7 | 0 | 97.1 |
| features/form-destinations/deliver.ts | 41 | 36 | 0 | 1 | 0 | 97.3 |
| features/custom-credentials/write-files-validation.ts | 193 | 148 | 0 | 4 | 0 | 97.4 |
| features/publish-trust/connect.ts | 45 | 37 | 0 | 1 | 0 | 97.4 |
| features/site-backup/share-hosting.ts | 197 | 161 | 0 | 4 | 0 | 97.6 |
| features/form-destinations/key-store.ts | 52 | 47 | 0 | 1 | 0 | 97.9 |
| features/post/duplicate-embeds.ts | 59 | 45 | 10 | 1 | 0 | 98.2 |
| features/publish-trust/revocations.ts | 219 | 182 | 0 | 3 | 0 | 98.4 |
| features/publish-trust/grant.ts | 238 | 195 | 0 | 3 | 0 | 98.5 |
| features/api-connections/budgets.ts | 107 | 85 | 0 | 1 | 0 | 98.8 |
| features/site-backup/import-archive-reader.ts | 103 | 94 | 0 | 1 | 0 | 98.9 |
| features/publish-trust/challenge.ts | 117 | 98 | 0 | 1 | 0 | 99 |
| features/custom-credentials/auth-schemes.ts | 46 | 41 | 0 | 0 | 0 | 100 |
| features/deployments/publish-credentials/account-label-heal-scheduler.ts | 27 | 25 | 0 | 0 | 0 | 100 |
| features/deployments/publish-credentials/execution-mode.ts | 8 | 4 | 0 | 0 | 0 | 100 |
| features/deployments/static-publish/domain-publish-rows.ts | 86 | 64 | 0 | 0 | 0 | 100 |
| features/forms/rate-limit-profile.ts | 1 | 1 | 0 | 0 | 0 | 100 |
| features/plugin-runtime/built-ins/content-analyzer/summary.ts | 74 | 41 | 0 | 0 | 0 | 100 |
| features/plugin-runtime/install-consent.ts | 35 | 18 | 0 | 0 | 0 | 100 |
| features/plugin-runtime/repo.sqlite.ts | 4 | 3 | 0 | 0 | 0 | 100 |
| features/plugins/migration-journal.ts | 38 | 19 | 0 | 0 | 0 | 100 |
| features/plugins/plugin-store.ts | 1 | 1 | 0 | 0 | 0 | 100 |
| features/plugins/restore.ts | 7 | 5 | 0 | 0 | 0 | 100 |
| features/post/repo.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100 |
| features/post/search-index.sqlite.ts | 35 | 17 | 0 | 0 | 0 | 100 |
| features/publish-content/apply-errors.ts | 2 | 1 | 0 | 0 | 0 | 100 |
| features/publish-content/baseline-repo.ts | 6 | 5 | 0 | 0 | 0 | 100 |
| features/publish-content/blob-staging.ts | 13 | 11 | 0 | 0 | 0 | 100 |
| features/publish-content/execute-import.ts | 10 | 6 | 0 | 0 | 0 | 100 |
| features/publish-content/run-repo.ts | 33 | 31 | 0 | 0 | 0 | 100 |
| features/publish-trust/provisioning.node-io.ts | 18 | 14 | 0 | 0 | 0 | 100 |
| features/publish-trust/session.ts | 114 | 86 | 0 | 0 | 0 | 100 |
| features/redirects/agent-tools.ts | 44 | 15 | 0 | 0 | 0 | 100 |
| features/site-backup/share-preparation.ts | 34 | 30 | 0 | 0 | 0 | 100 |
| features/trash/db-port.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100 |
| features/trash/remove-without-blocker.ts | 11 | 9 | 0 | 0 | 0 | 100 |
| features/trash/repo.sqlite.ts | 3 | 3 | 0 | 0 | 0 | 100 |
| features/trash/widget-removal.ts | 5 | 4 | 0 | 0 | 0 | 100 |
| features/webhooks/delivery.ts | 22 | 18 | 0 | 0 | 0 | 100 |
| features/webhooks/keyring.memory.ts | 8 | 6 | 0 | 0 | 0 | 100 |
| features/webhooks/secret-sealer.aesgcm.ts | 7 | 6 | 0 | 0 | 0 | 100 |
| features/webhooks/signing.keyring.ts | 2 | 2 | 0 | 0 | 0 | 100 |
| features/webhooks/signing.ts | 9 | 9 | 0 | 0 | 0 | 100 |
| features/pages/skeleton.ts | 1 | 0 | 0 | 0 | 0 | n/a |

## Dry-run failed (not scored — ENV/test-load failures; mostly @jini-ai export mismatch because the Jini clone was not permitted in this run)
- features/post/preview-tool.ts (rc=1)
- features/pages/html-document-store.sqlite.ts (rc=1)
- features/publish-content/publish-readiness.ts (rc=1)
- features/publish-content/agent-tools.ts (rc=1)
- features/deployments/static-publish/domain-publish-tool.ts (rc=1)
- features/deployments/dockerfile.ts (rc=1)
- features/deployments/tool-registrations.ts (rc=1)
- features/deployments/deploy-ops/tool-registrations.ts (rc=1)
- features/deployments/static-publish/publish-run.ts (rc=1)
- features/deployments/static-publish/publish-history.ts (rc=1)
- features/deployments/static-publish/credentials.ts (rc=1)
- features/deployments/static-publish/verify.ts (rc=1)
- features/custom-credentials/credential-save-tool.ts (rc=1)
- features/custom-credentials/agent-tools.ts (rc=1)
- features/custom-credentials/store.ts (rc=1)
- features/site-backup/import-restore.ts (rc=1)
- features/site-backup/share-file-policy.ts (rc=124)
- features/site-backup/import-registry.ts (rc=124)
- features/site-backup/import-backend.ts (rc=124)
- features/form-destinations/port.ts (rc=1)
- features/consent/revisions.ts (rc=1)
- features/consent/ensure-privacy-defaults.ts (rc=1)
- features/consent/config.ts (rc=1)
- features/consent/service.ts (rc=1)
- features/plugin-runtime/widget-partials.ts (rc=1)
- features/plugin-runtime/install.ts (rc=1)
- features/plugin-runtime/source-tools.ts (rc=1)
- features/permanent-delete/tool-registrations.ts (rc=1)
- features/webhooks/subscriptions.ts (rc=1)
- features/webhooks/repo.memory.ts (rc=1)
- features/webhooks/tool-registrations.ts (rc=1)

## No direct unit test found (never mutated)
- features/post/capability-card.ts
- features/pages/permissions.ts
- features/publish-content/live-site-policy.ts
- features/publish-content/pull.ts
- features/publish-content/report-contract.ts
- features/publish-content/permissions.ts
- features/publish-content/publish-tool.ts
- features/deployments/ports.ts
- features/deployments/agent-tools.ts
- features/deployments/deploy-ops/agent-tools.ts
- features/custom-credentials/card-token.ts
- features/custom-credentials/delete-request-confirmation-ui.ts
- features/custom-credentials/custom-credential-set-token-ui.ts
- features/site-backup/share-preparation-steps.ts
- features/site-backup/import-backend-steps.ts
- features/site-backup/import-verifier-inventory.ts
- features/trash/scheduler.node.ts
- features/trash/db-port.ts
- features/trash/adapters/member.ts
- features/trash/adapters/redirect.ts
- features/trash/adapters/comment.ts
- features/trash/adapters/post.ts
- features/trash/adapters/media.ts
- features/trash/adapters/marker-sql.ts
- features/trash/adapters/directory.ts
- features/trash/adapters/user.ts
- features/redirects/repo.sqlite.ts
- features/redirects/phase-handler.ts
- features/forms/capability-card.ts
- features/forms/delivery-status.ts
- features/forms/repo.sqlite.ts
- features/consent/privacy-page-template.ts
- features/consent/request.ts
- features/plugins/data-modules.ts
- features/plugins/store/manifest.ts
- features/plugins/lipay/manifest.ts
- features/plugin-runtime/capability-card.ts
- features/plugin-runtime/admin-response.ts
- features/vendor-credentials/abort-guarded-repo.ts
- features/permanent-delete/agent-tools.ts
- features/webhooks/agent-tools.ts

## NOT RUN (queue not reached)
- features/post/slug.ts
- features/api-connections/contribution.ts
- features/api-connections/host.ts
- features/change-sets/agent-tools.ts
- features/change-sets/tool-registrations.ts
- features/recovery/gated-hooks.ts
- features/recovery/agent-tools.ts
- features/recovery/tool-registrations.ts
- features/entries/repo.sqlite.ts
- features/entries/repo.rows.ts
- features/entries/tool-registrations.ts
- features/entries/publish-content.ts
- features/entries/unreadable-owner-entries-repair.ts
- features/entries/trash-aware-memory-repo.ts
- features/entries/repo.ts
- features/entries/public-list.ts
- features/content-types/repo.sqlite.ts
- features/content-types/repo.memory.ts
- features/content-types/declared-owners.ts
- features/content-types/write-service.ts
- features/content-types/repo.ts
- features/content-types/repo.rows.ts
- features/content-types/publish-content.ts
- features/content-types/tool-registrations.ts
- features/content-duplication/derive-available-name.ts
- features/content-duplication/agent-tools.ts
- features/content-duplication/tool-registrations.ts
- features/media/purge-media.ts
- features/media/provider-credential-store.memory.ts
- features/media/guard-rendition-repo.ts
- features/media/document-archive.ts
- features/media/upload-content-type.ts
- features/media/where-used.ts
- features/media/public-path.ts
- features/media/library-save-attachment.ts
- features/media/content-type-store.ts
- features/media/verify-published-media.ts
- features/media/bootstrap.ts
- features/media/list-pending-chat-attachments.ts
- features/media/provider-credential-vault.ts
- features/media/versioned-media-repo.ts
- features/media/view-image-tool.ts
- features/media/hydrate-blob-store-from-seed.ts
- features/media/promote-chat-attachment.ts
- features/media/publish-content.ts
- features/media/duplicate-asset.ts
- features/media/tool-registrations.ts
- features/media/view-video-tool.ts
- features/media/import-media-entity.ts
- features/media/read-chat-attachment.ts
- features/media/provider-credential-store.ts
- features/media-import/agent-tools.ts
- features/media-import/fetch-image.ts
- features/media-import/tool-registrations.ts
- features/media-generation/provider-credential-save.ts
- features/media-generation/media-provider-registry.ts
- features/media-generation/agent-tools.ts
- features/media-generation/providers-tools.ts
- features/media-generation/tool-registrations.ts
- features/navigation/menu-version-conflict-error.ts
- features/navigation/repo.sqlite.ts
- features/navigation/page-target-resolver.ts
- features/navigation/trash-menu.ts
- features/navigation/tool-registrations.ts
- features/navigation/html-render.ts
- features/navigation/menu-trash-follow-ups.ts
- features/navigation/reverters.ts
- features/navigation/repoint-menu-refs.ts
- features/navigation/migrate-footer-page-links.ts
- features/navigation/trash-aware-memory-menu-repo.ts
- features/navigation/import-menu.ts
- features/navigation/repo.ts
- features/navigation/publish-content.ts
- features/taxonomy/repo.sqlite.ts
- features/taxonomy/html-render.ts
- features/taxonomy/repo.rows.ts
- features/taxonomy/agent-tools.ts
- features/taxonomy/collection-term-policy.ts
- features/taxonomy/publish-content.ts
- features/taxonomy/gated-hooks.ts
- features/taxonomy/publish-term-ids.ts
- features/taxonomy/trash-term.ts
- features/taxonomy/taxonomy-trash-follow-ups.ts
- features/taxonomy/tool-registrations.ts
- features/taxonomy/repo.ts
- features/comments/data-module-install.ts
- features/comments/repo.sqlite.ts
- features/comments/comment-targets.ts
- features/comments/public-markers.ts
- features/comments/ip-hash-salt.ts
- features/comments/provider-selection.ts
- features/comments/builtin-provider.ts
- features/comments/agent-tools.ts
- features/comments/settings.ts
- features/comments/tool-registrations.ts
- features/newsletter/repo.sqlite.ts
- features/newsletter/hooks.ts
- features/newsletter/errors.ts
- features/newsletter/launch-gate.ts
- features/newsletter/lists.ts
- features/newsletter/unsubscribe.ts
- features/newsletter/campaign.ts
- features/newsletter/data-module-manifest.ts
- features/newsletter/subscriptions.ts
- features/newsletter/confirmation.ts
- features/newsletter/campaign-write-service.ts
- features/newsletter/repo.rows.ts
- features/newsletter/agent-tools.ts
- features/newsletter/ports.ts
- features/newsletter/repo.memory.ts
- features/newsletter/delivery/tool-registrations.ts
- features/newsletter/repo.ts
- features/newsletter/tool-registrations.ts
- features/site-export/theme-preview-manifest.ts
- features/site-export/theme-preview-report.ts
- features/site-export/static-security-headers.ts
- features/site-export/export-failure-summary.ts
- features/site-export/ports.ts
- features/site-export/route-manifest.ts
- features/source-control/repo.memory.ts
- features/source-control/repository-target.ts
- features/source-control/provider-kit.ts
- features/source-control/credential-form.ts
- features/source-control/provider-module.ts
- features/source-control/credential-setup.ts
- features/source-control/provider-registry.ts
- features/source-control/store.ts
- features/source-control/commit-site.ts
- features/source-control/tool-registrations.ts
- features/sites/site-preview/site-preview-store.ts
- features/sites/site-preview/site-preview-service.ts
- features/sites/site-preview/playwright-site-preview-capture.ts
- features/sites/deps.ts
- features/sites/agent-tools.ts
- features/sites/site-admin.ts
- features/sites/tool-registrations.ts
- features/site-search/access.ts
- features/site-search/settings.ts
- features/site-search/cms-document-source.ts
- features/site-search/index-state-store.ts
- features/seo/capability-card.ts
- features/seo/page-head-contributor.ts
- features/seo/cover-image.ts
- features/seo/agent-tools.ts
- features/seo/tool-registrations.ts
- features/seo/settings.ts
- features/origin/configured-origin.ts
- features/domain-dns/mail-dns-tools.ts
- features/domain-dns/binding.repo.ts
- features/domain-dns/mail-requirements.ts
- features/domain-dns/tools.ts
- features/domain-dns/mail-dns-status.ts
- features/domain-dns/dns-tools.ts
- features/domain-dns/dns-changes.ts
- features/object-storage/artifact-provider.ts
- features/object-storage/setting.ts
- features/object-storage/registry.ts
- features/object-storage/media-store.ts
- features/fs-files/site-file-request.ts
- features/fs-files/custom-root-permission.ts
- features/fs-files/tool-registrations.ts
- features/fs-files/agent-tools.ts
- features/fs-files/layout.ts
- features/fs-files/fs-files.ts
- features/fs-files/custom-root-store.ts
- features/database/gated-hooks.ts
- features/database/db-messages.ts
- features/database/adapter.sqlite.ts
- features/database/repo.memory.ts
- features/database/tool-registrations.ts
- features/email-templates/agent-tools.ts
- features/email-templates/tool-registrations.ts
- features/email-templates/render.ts
- features/email-templates/operations.ts
- features/external-mcp/built-in-connections.ts
- features/external-mcp/auth-mode.ts
- features/external-mcp/deps.ts
- features/external-mcp/operations-tools.ts
- features/external-mcp/save-form.ts
- features/external-mcp/agent-tools.ts
- features/agent-plugins/bundled-contribution-sources.ts
- features/agent-plugins/admin-surfaces/same-origin.ts
- features/agent-plugins/admin-surfaces/public-config.ts
- features/agent-plugins/admin-surfaces/forms.ts
- features/agent-plugins/deploy-split-activation.ts
- features/agent-plugins/admin-surfaces/issued-sign-ins.ts
- features/agent-plugins/operator-locale.ts
- features/agent-plugins/admin-surfaces/capabilities.ts
- features/agent-plugins/retired-plugin-tool-aliases.ts
- features/agent-plugins/identity.ts
- features/agent-plugins/search-provider-registry.ts
- features/agent-plugins/uninstall-confirmation-ui.ts
- features/agent-plugins/token-sign-in.ts
- features/agent-plugins/descriptor-i18n.ts
- features/agent-plugins/write-note-tool.ts
- features/agent-plugins/exports/diagnostics.ts
- features/agent-plugins/memory.ts
- features/agent-plugins/exports/source.ts
- features/agent-plugins/admin-surfaces/handlers.ts
- features/agent-plugins/executable-tools/approval.ts
- features/agent-plugins/set-enabled.ts
- features/agent-plugins/memory-tools.ts
- features/agent-plugins/mcp-metadata.ts
- features/agent-plugins/apply-connect-defaults.ts
- features/agent-plugins/update-effects.ts
- features/agent-plugins/connect-card-ui.ts
- features/agent-plugins/layout.ts
- features/agent-plugins/admin-surfaces/surfaces.ts
- features/agent-plugins/host-signals.ts
- features/agent-plugins/capability-projection.ts
- features/agent-plugins/analytics-provider-registry.ts
- features/agent-plugins/memory-i18n.ts
- features/agent-plugins/switch-on-saved-token.ts
- features/agent-plugins/apply-tool-renames.ts
- features/agent-plugins/new-site-agent-plugin-tokens.ts
- features/agent-plugins/mail-provider-setup.ts
- features/agent-plugins/supersession.ts
- features/agent-plugins/bundled-catalog.ts
- features/agent-plugins/executable-tools/host-capabilities.ts
- features/agent-plugins/import-access-token.ts
- features/agent-plugins/exports/runtime.ts
- features/agent-plugins/admin-surfaces/delivery-bindings.ts
- features/agent-plugins/executable-tools/register.ts
- features/agent-plugins/credential-cards.ts
- features/agent-plugins/uninstall-tool.ts
- features/agent-plugins/install-tool.ts
- features/agent-plugins/access-token-tool.ts
- features/agent-plugins/lifecycle.ts
- features/agent-plugins/mail-adapter-registry.ts
- features/agent-plugins/install-upload.ts
- features/agent-plugins/connect-tool.ts
- features/skills/live-registration.ts
- features/skills/install-service.ts
- features/skills/layout.ts
- features/skills/install-tool.ts
- features/skills/tool-registrations.ts
- features/widgets/capability-card.ts
- features/widgets/repo.sqlite.ts
- features/widgets/deps.ts
- features/widgets/media-html.ts
- features/widgets/publish-content.ts
- features/widgets/agent-tools.ts
- features/theme/capability-card.ts
- features/theme/asset-path-rewrites.ts
- features/theme/theme-id-aliases.ts
- features/theme/public-page-security-headers.ts
- features/theme/template-applicability.ts
- features/theme/font-links.ts
- features/theme/token-aliases.ts
- features/theme/save-theme-original.ts
- features/theme/preview-refresh.ts
- features/theme/verify-active-theme.ts
- features/theme/page-publication.ts
- features/theme/render-contract.ts
- features/theme/theme-watcher.ts
- features/theme/page-publish-tool.ts
- features/theme/hardcoded-link-lists.ts
- features/theme/theme-roster-sync.ts
- features/theme/preview-switcher-tools.ts
- features/theme/validation/references.ts
- features/theme/theme-preview-image.ts
- features/theme/validation/profiles.ts
- features/theme/active-theme-publish-content.ts
- features/theme/validation/markup.ts
- features/theme/theme-layout.ts
- features/theme/static-asset-contract.ts
- features/theme/preview-switcher.ts
- features/theme/duplicate-theme-tool.ts
- features/theme/set-active-theme-tool.ts
- features/theme/preview-switcher-html.ts
- features/theme/theme-file-import.ts
- features/theme/trash-theme-tool.ts
- features/theme/import-theme-file-tool.ts
- features/theme/theme-trash.ts
- features/theme/validation/webmcp-markup.ts
- features/theme/sync-originals.ts
- features/theme/liquid-allowlist.ts
- features/theme/validation/validate-theme-package.ts
- features/theme/active-theme.ts
- features/theme/migration/theme-migration-plan.ts
- features/theme/static-portability-index.ts
- features/theme/validation/structure.ts
- features/theme/file-identity-lock.ts
- features/theme/duplicate-theme.ts
- features/theme/migration/migrate-theme.ts
- features/theme/handlebars-allowlist.ts
- features/theme/entry-list-render.ts
- features/theme/code-tier-asset-normalizer.ts
- features/theme/validation/manifest-v2.ts
- features/theme/agent-tools.ts
- features/tool-audit/repo.sqlite.ts
- features/tool-audit/tool-gaps.repo.ts
- features/tool-audit/repo.memory.ts
- features/tool-audit/repo.ts
- features/web/web-page.ts
- features/web/tool-registrations.ts
- features/web/agent-tools.ts
- features/webmcp/settings.ts
- features/webmcp/webmcp-i18n.ts
- features/webmcp/published-html.ts
- features/webmcp/generated/annotated-actions-script.ts
- features/web-screenshot/screenshot-image.ts
- features/web-screenshot/request-guard.ts
- features/web-screenshot/capture-files.ts
- features/web-screenshot/own-site-opener.ts
- features/web-screenshot/desktop-page-capture.ts
- features/web-screenshot/agent-tools.ts
- features/web-screenshot/tool-registrations.ts
- features/web-screenshot/playwright-page-capture.ts
- features/web-screenshot/web-screenshot.ts
- features/workspace/repo.sqlite.ts
- features/workspace/agent-tools.ts
- features/workspace/repo.ts
- features/workspace/tool-registrations.ts
- features/site-glue/attachment-points/events.ts
- features/site-glue/ports.ts
- features/site-glue/attachment-points/tool-registration.ts
- features/site-glue/manifest.ts
- features/site-evidence/agent-tools.ts
- features/site-evidence/collect-page-evidence.ts
- features/site-evidence/tool-registrations.ts
- features/site-inspection/admin-screens.generated.ts
- features/site-inspection/page-body.ts
- features/site-inspection/section-collector.ts
- features/site-inspection/deps.ts
- features/site-inspection/live-url.ts
- features/site-inspection/tool-registrations.ts
- features/site-inspection/agent-tools.ts
- features/site-inspection/site-capabilities.ts
- features/site-inspection/published-page.ts
- features/site-guide/capability-card.ts
- features/site-guide/plugin-contributions.ts
- features/site-guide/contracts.ts
- features/site-guide/facts.ts
- features/server-logs/agent-tools.ts
- features/server-logs/tool-registrations.ts
- features/server-logs/read-server-logs.ts
- features/mail-status/permissions.ts
- features/mail-status/provider-agent-tools.ts
- features/mail-status/agent-tools.ts
- features/mail-status/feedback-setup.ts
- features/mail-status/delivery-agent-tools.ts
- features/mail-status/delivery-tool-registrations.ts
- features/mail-status/provider-tool-registrations.ts
- features/mail-status/provider-operations.ts
- features/mail-status/tool-registrations.ts
- features/mail-status/suppressions.ts
- features/mail-status/activity.ts
- features/mail-status/use-readiness.ts
- features/mail-status/test-send.ts
- features/presentation/repo.sqlite.ts
- features/presentation/repo.rows.ts
- features/presentation/repo.ts
- features/presentation/active-theme-id.ts
- features/analytics/agent-tools.ts
- features/analytics/salt.ts
- features/analytics/tool-registrations.ts
- features/analytics/jini-adapters.ts
- features/analytics/forwarding.ts
- features/analytics/ports.ts
- features/analytics/config.settings.ts

## 7. Survivors (files <80% or ≥10 survivors; ≤10 each)
### features/api-connections/connect.ts (81.7%, 21 surv, 0 nocov)
- L55 ObjectLiteral: `signal.addEventListener("abort", done, { once: true });` → `{}`
- L55 BooleanLiteral: `signal.addEventListener("abort", done, { once: true });` → `false`
- L71 EqualityOperator: `while (Date.now() < deadline && !run.signal.aborted) {` → `Date.now() <= deadline`
- L73 ConditionalExpression: `if (status.status === "connected" && (await readGeneration({ key: connectionRef })) > star` → `true`
- L74 MethodExpression: `await pause(Math.min(run.pollIntervalMs, Math.max(deadline - Date.now(), 0)), run.signal);` → `Math.min(deadline - Date.now(), 0)`
- L74 ArithmeticOperator: `await pause(Math.min(run.pollIntervalMs, Math.max(deadline - Date.now(), 0)), run.signal);` → `deadline + Date.now()`
- L125 ConditionalExpression: `const startOptionsOf = (optional: SignInOptions) => (optional.startParams === undefined ? ` → `false`
- L139 ObjectLiteral: `const key = deriveApiConnectionKey({ workspaceId: host.workspaceId, pluginId: connection.p` → `{}`
- L142 BlockStatement: `return () => { if (slots.get(key) === listening) slots.delete(key); };` → `{}`
- L142 ConditionalExpression: `return () => { if (slots.get(key) === listening) slots.delete(key); };` → `true`
### features/api-connections/surface-connections.ts (87.7%, 14 surv, 0 nocov)
- L42 OptionalChaining: `const code = (error as { code?: unknown } | null)?.code;` → `(error as {   code?: unknown; } | null).code`
- L47 Regex: `const SAFE_ATTEMPT_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/[a-z0-9]+(?:-[a-z0-9]+)*$/`
- L47 Regex: `const SAFE_ATTEMPT_CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L50 ConditionalExpression: `return { code: code.length <= 64 && SAFE_ATTEMPT_CODE.test(code) ? code : "sign-in-failed"` → `true`
- L50 EqualityOperator: `return { code: code.length <= 64 && SAFE_ATTEMPT_CODE.test(code) ? code : "sign-in-failed"` → `code.length < 64`
- L55 ObjectLiteral: `const NEVER_CONNECTED: StatusSource = { status: "disconnected", account: null, grantedScop` → `{}`
- L55 ArrayDeclaration: `const NEVER_CONNECTED: StatusSource = { status: "disconnected", account: null, grantedScop` → `["Stryker was here"]`
- L68 EqualityOperator: `return staged && Date.parse(staged.expiresAt) > host.clock.nowMs() ? staged.account : null` → `Date.parse(staged.expiresAt) >= host.clock.nowMs()`
- L75 ConditionalExpression: `grantedScopeSetIds: view.status === "connected" ? await grantedScopeSets(host, connection,` → `true`
- L75 ArrayDeclaration: `grantedScopeSetIds: view.status === "connected" ? await grantedScopeSets(host, connection,` → `["Stryker was here"]`
### features/consent/settings-link.ts (80.2%, 20 surv, 0 nocov)
- L18 ConditionalExpression: `if (!('tagName' in node) || node.tagName === 'template' || node.attrs.some(attr => attr.na` → `false`
- L18 ArrowFunction: `if (!('tagName' in node) || node.tagName === 'template' || node.attrs.some(attr => attr.na` → `() => undefined`
- L18 ConditionalExpression: `if (!('tagName' in node) || node.tagName === 'template' || node.attrs.some(attr => attr.na` → `false`
- L25 UnaryOperator: `function contentEnd({ node }: { node: Element }, { fallback = -1 }: { fallback?: number } ` → `+1`
- L26 OptionalChaining: `return node.sourceCodeLocation?.endTag?.startOffset ?? node.sourceCodeLocation?.endOffset ` → `node.sourceCodeLocation?.endTag.startOffset`
- L35 MethodExpression: `if (last?.tagName !== 'div' || last.attrs.some(attr => attr.name === 'hidden')) return row` → `last.attrs.every(attr => attr.name === 'hidden')`
- L49 ObjectLiteral: `if (attrs.has('data-jini-consent-open')) return { enabled: false, offset: 0, inline: false` → `{}`
- L49 BooleanLiteral: `if (attrs.has('data-jini-consent-open')) return { enabled: false, offset: 0, inline: false` → `true`
- L50 ConditionalExpression: `if (node.tagName === 'section' && attrs.get('id') === 'jini-consent') enabled = attrs.get(` → `true`
- L50 LogicalOperator: `if (node.tagName === 'section' && attrs.get('id') === 'jini-consent') enabled = attrs.get(` → `node.tagName === 'section' || attrs.get('id') === 'jini-cons`
### features/consent/tool-registrations.ts (74.6%, 30 surv, 0 nocov)
- L13 ObjectLiteral: `const TOKEN = { type: ['string', 'null'], description: 'The exact revision id from consent` → `{}`
- L14 ObjectLiteral: `const CONFIG = { type: 'object', description: 'Full ConsentConfig: banner text, enabled, p` → `{}`
- L13 ArrayDeclaration: `const TOKEN = { type: ['string', 'null'], description: 'The exact revision id from consent` → `[]`
- L12 ObjectLiteral: `const PATH = { type: 'string', description: 'One local public page path, default /; no ext` → `{}`
- L17 ObjectLiteral: `...['consent_get_readiness', 'consent_explain_blocked'].map(name => ({ name, description: ` → `{}`
- L17 ObjectLiteral: `...['consent_get_readiness', 'consent_explain_blocked'].map(name => ({ name, description: ` → `{}`
- L17 BooleanLiteral: `...['consent_get_readiness', 'consent_explain_blocked'].map(name => ({ name, description: ` → `true`
- L18 BooleanLiteral: `{ name: 'consent_get_settings', description: 'Read cookie banner draft, published revision` → `true`
- L18 ObjectLiteral: `{ name: 'consent_get_settings', description: 'Read cookie banner draft, published revision` → `{}`
- L19 ObjectLiteral: `{ name: 'consent_update_settings', description: 'Save a new cookie consent draft after a h` → `{}`
### features/custom-credentials/credential-copy-tool.ts (83.0%, 35 surv, 13 nocov)
- L42 ObjectLiteral: `inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];` → `{}`
- L42 BooleanLiteral: `inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];` → `true`
- L60 ObjectLiteral: `if (instance && !(await instance({ principalId, permission: 'system.write' })).allowed) {` → `{}`
- L61 ObjectLiteral: `throw new ToolInputError({ message: 'Copy is not authorized for this installation.' });` → `{}`
- L73 ObjectLiteral: `toolName: CREDENTIAL_COPY_TOOL_ID, baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId }` → `{}`
- L75 ObjectLiteral: `params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },` → `{}`
- L75 BooleanLiteral: `params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },` → `false`
- L77 ArrayDeclaration: `preferredFrameSize: ['100%', '1px'] });` → `[]`
- L85 ConditionalExpression: `if (aborted) return 'abandoned';` → `false`
- L99 ConditionalExpression: `!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.len` → `false`
- no-cov lines: 18,19,20,21,22,114
### features/custom-credentials/custom-credential-create-ui.ts (44.3%, 23 surv, 11 nocov)
- L86 BooleanLiteral: `required: true,` → `false`
- L81 ObjectLiteral: `{` → `{}`
- L87 ConditionalExpression: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `true`
- L87 ConditionalExpression: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `false`
- L87 EqualityOperator: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `prefill.label === undefined`
- L89 ObjectLiteral: `{` → `{}`
- L87 ObjectLiteral: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `{}`
- L94 BooleanLiteral: `required: true,` → `false`
- L95 EqualityOperator: `...(prefill.baseUrl !== undefined ? { value: prefill.baseUrl } : {}),` → `prefill.baseUrl === undefined`
- L95 ConditionalExpression: `...(prefill.baseUrl !== undefined ? { value: prefill.baseUrl } : {}),` → `true`
- no-cov lines: 71,95,174,176,177,178,181,182
### features/custom-credentials/plugin-credential-card.ts (2.2%, 2 surv, 133 nocov)
- L147 OptionalChaining: `try { return await loadCards?.(workspaceId) ?? []; }` → `loadCards(workspaceId)`
- L147 ArrayDeclaration: `try { return await loadCards?.(workspaceId) ?? []; }` → `["Stryker was here"]`
- no-cov lines: 63,64,67,69,73,74,75,77,78,85,86,87,88,89,97,98,99,100,101,102,103,107,109,110,111,112,117,119,120,126,127,131,132,133,137,138,139,140,148
### features/custom-credentials/vault-repo.ts (90.0%, 14 surv, 4 nocov)
- L7 ConditionalExpression: `...(id === undefined ? {} : { id }) };` → `false`
- L7 ConditionalExpression: `...(id === undefined ? {} : { id }) };` → `true`
- L7 EqualityOperator: `...(id === undefined ? {} : { id }) };` → `id !== undefined`
- L7 ObjectLiteral: `...(id === undefined ? {} : { id }) };` → `{}`
- L28 ConditionalExpression: `if (expectedRevision !== undefined) Object.defineProperty(record, "vaultExpectedRevision",` → `true`
- L45 ObjectLiteral: `const legacy = await this.vault.list(customVaultScope({ ...input, kind: "custom" }));` → `{}`
- L46 MethodExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `[...unified.filter(row => row.meta.credentialType === "custo`
- L46 MethodExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `unified`
- L46 ConditionalExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `true`
- L67 LogicalOperator: `if (error instanceof VaultError && error.code === "conflict" && (await this.listByWorkspac` → `error instanceof VaultError || error.code === "conflict"`
- no-cov lines: 73,75
### features/deployments/deploy-config-registry.ts (71.5%, 53 surv, 30 nocov)
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9])*$/`
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[^a-z0-9]+)*$/`
- L63 ConditionalExpression: `}, { onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] :` → `true`
- L87 BlockStatement: `try {` → `{}`
- L89 BlockStatement: `} catch {` → `{}`
- L156 ConditionalExpression: `if (typeof metadata === "string") return `${at}.${metadata}`;` → `false`
- L182 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L187 ConditionalExpression: `return typeof value === "string" && value.length <= 512 && /^[a-zA-Z0-9_./-]+$/.test(value` → `true`
- L187 LogicalOperator: `return typeof value === "string" && value.length <= 512 && /^[a-zA-Z0-9_./-]+$/.test(value` → `typeof value === "string" && value.length <= 512 && /^[a-zA-`
- no-cov lines: 93,208,213,221,222,223,224,225,229,230,231,247,255,256,259
### features/deployments/deploy-config.ts (77.9%, 12 surv, 3 nocov)
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/EXPOSE\s+(\d+)\s*$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\s*/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s(\d+)\s*$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\s$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\S*$/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/\s*"name"\s*:\s*"([^"]+)"/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/^\s*"name"\S*:\s*"([^"]+)"/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/^\s*"name"\s*:\s"([^"]+)"/m`
- L360 Regex: `/^VOLUME\s+\["([^"]+)"\]\s*$/m,` → `/VOLUME\s+\["([^"]+)"\]\s*$/m`
- L360 Regex: `/^VOLUME\s+\["([^"]+)"\]\s*$/m,` → `/^VOLUME\s+\["([^"]+)"\]\s*/m`
- no-cov lines: 118,119,121
### features/deployments/deploy-ops/registry.ts (87.2%, 34 surv, 0 nocov)
- L12 ConditionalExpression: `const object = (value: unknown): value is Record<string, unknown> => typeof value === "obj` → `true`
- L19 EqualityOperator: `if (!Array.isArray(value.platforms) || value.platforms.length > 32) return { ok: false, re` → `value.platforms.length >= 32`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" && module.endsWith(".mjs") && !mo`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" && module.endsWith(".mjs") || !mo`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" || module.endsWith(".mjs")`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 MethodExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `module.endsWith("/")`
### features/deployments/deploy-ops/run-ops.ts (84.4%, 55 surv, 9 nocov)
- L45 OptionalChaining: `if (signal?.aborted) { reject(aborted()); return; }` → `signal.aborted`
- L46 OptionalChaining: `const finish = () => { signal?.removeEventListener("abort", onAbort); resolve(); };` → `signal.removeEventListener`
- L48 OptionalChaining: `const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort)` → `signal.removeEventListener`
- L49 OptionalChaining: `signal?.addEventListener("abort", onAbort, { once: true });` → `signal.addEventListener`
- L49 ObjectLiteral: `signal?.addEventListener("abort", onAbort, { once: true });` → `{}`
- L49 BooleanLiteral: `signal?.addEventListener("abort", onAbort, { once: true });` → `false`
- L68 ObjectLiteral: `if (!credentials.some(c => c.label === explicit)) throw new DeployCredentialSetupRequired(` → `{}`
- L68 MethodExpression: `if (!credentials.some(c => c.label === explicit)) throw new DeployCredentialSetupRequired(` → `credentials.every(c => c.label === explicit)`
- L74 MethodExpression: `if (matches.length !== 1) throw new ToolInputError({ message: `Several saved custom creden` → `matches.map(c => c.label)`
- L90 ConditionalExpression: `if (error instanceof CredentialedRequestValidationError) throw new ToolInputError({ messag` → `true`
- no-cov lines: 80,91,159,206,316,328
### features/deployments/deploy-ops/secrets.ts (88.2%, 36 surv, 0 nocov)
- L47 MethodExpression: `const clip = (value: unknown, max: number) => String(value).slice(0, max);` → `String(value)`
- L64 ConditionalExpression: `if (!siteDir) return undefined;` → `false`
- L66 ObjectLiteral: `return revealSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveR` → `{}`
- L78 ObjectLiteral: `const registry = await deps.loadDeployOps({ workspaceId: deps.workspaceId });` → `{}`
- L80 LogicalOperator: `if (!platform.module.setSecret || !platform.module.secretCapabilities) {` → `!platform.module.setSecret && !platform.module.secretCapabil`
- L95 ConditionalExpression: `if (!Array.isArray(result?.secrets) || result.secrets.some(s => !s || typeof s.name !== "s` → `false`
- L96 MethodExpression: `const secrets = result.secrets.slice(0, 500).map(s => ({ name: clip(s.name, 128), ...(type` → `result.secrets`
- L97 ConditionalExpression: `return { secrets, truncated: result.truncated === true || result.secrets.length > 500 };` → `false`
- L97 EqualityOperator: `return { secrets, truncated: result.truncated === true || result.secrets.length > 500 };` → `result.secrets.length >= 500`
- L104 ConditionalExpression: `const version = (write: DeployOpsSecretWrite | undefined): { version?: string } => (typeof` → `true`
### features/deployments/deploy-ops/typed-secret-card.ts (63.3%, 28 surv, 8 nocov)
- L24 ObjectLiteral: `const registry = await deps.loadDeployOps({ workspaceId: deps.workspaceId });` → `{}`
- L22 ConditionalExpression: `if (ctx.signal.aborted) return { locale };` → `false`
- L29 ObjectLiteral: `return { locale };` → `{}`
- L32 ObjectLiteral: `title, description: credentialText({ id: "secretForm", locale: prep.locale }),` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L36 OptionalChaining: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret.secre`
- L36 BooleanLiteral: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `false`
- L36 BooleanLiteral: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `false`
- no-cov lines: 22,52,53,57
### features/deployments/deploy-targets/host-kit.ts (88.3%, 12 surv, 0 nocov)
- L57 ConditionalExpression: `if (!observability) return client;` → `false`
- L78 ConditionalExpression: `if (!response.ok || !response.body) return false;` → `false`
- L78 LogicalOperator: `if (!response.ok || !response.body) return false;` → `!response.ok && !response.body`
- L82 ConditionalExpression: `return body !== undefined && body.toString("utf8") === expected;` → `true`
- L83 BlockStatement: `} finally { await reader.cancel(); }` → `{}`
- L92 AssignmentOperator: `bytes += chunk.value.length;` → `bytes -= chunk.value.length`
- L93 ConditionalExpression: `if (bytes > 4096) return undefined;` → `false`
- L93 EqualityOperator: `if (bytes > 4096) return undefined;` → `bytes >= 4096`
- L102 ObjectLiteral: `const response = await ports.fetch({ url }, { init: { signal: AbortSignal.timeout(DEPLOY_F` → `{}`
- L102 ObjectLiteral: `const response = await ports.fetch({ url }, { init: { signal: AbortSignal.timeout(DEPLOY_F` → `{}`
### features/deployments/deploy-targets/registry.ts (95.5%, 21 surv, 0 nocov)
- L39 Regex: `const TARGET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L67 ObjectLiteral: `const load = await required.loadContributions({ ...ctx, definition: targetContribution }, ` → `{}`
- L67 BooleanLiteral: `const load = await required.loadContributions({ ...ctx, definition: targetContribution }, ` → `false`
- L176 EqualityOperator: `if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) ret` → `help.length >= MAX_HELP_LENGTH`
- L182 ConditionalExpression: `if (typeof value !== "string" || value.length > 500) return false;` → `false`
- L185 BlockStatement: `} catch {` → `{}`
- L182 EqualityOperator: `if (typeof value !== "string" || value.length > 500) return false;` → `value.length >= 500`
- L214 Regex: `const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;` → `/[A-Z][A-Z0-9_]{0,127}$/`
- L214 Regex: `const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;` → `/^[A-Z][A-Z0-9_]{0,127}/`
- L229 EqualityOperator: `if (!Array.isArray(value) || value.length > MAX_FIELDS) return `${at} must be an array of ` → `value.length >= MAX_FIELDS`
### features/form-destinations/registry.ts (92.7%, 16 surv, 1 nocov)
- L27 Regex: `const DESTINATION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L78 ConditionalExpression: `const unclaimed = dropShared({ entries: unique, keysOf: (entry) => (entry.descriptor.recei` → `true`
- L78 ArrayDeclaration: `const unclaimed = dropShared({ entries: unique, keysOf: (entry) => (entry.descriptor.recei` → `["Stryker was here"]`
- L84 ConditionalExpression: `?? unclaimed.find((entry) => entry.descriptor.receive === "co-hosted" && entry.descriptor.` → `true`
- L84 OptionalChaining: `?? unclaimed.find((entry) => entry.descriptor.receive === "co-hosted" && entry.descriptor.` → `entry.descriptor.hosts.includes`
- L92 ConditionalExpression: `if (receive && (typeof module.pull !== "function" || typeof module.ack !== "function")) re` → `false`
- L147 ConditionalExpression: `if (typeof module !== "string" || !module.endsWith(".mjs") || path.posix.isAbsolute(module` → `false`
- L174 ConditionalExpression: `return typeof value === "string" && value.length <= MAX_ID_LENGTH && DESTINATION_ID_PATTER` → `true`
- L174 LogicalOperator: `return typeof value === "string" && value.length <= MAX_ID_LENGTH && DESTINATION_ID_PATTER` → `typeof value === "string" || value.length <= MAX_ID_LENGTH`
- L174 ConditionalExpression: `return typeof value === "string" && value.length <= MAX_ID_LENGTH && DESTINATION_ID_PATTER` → `true`
- no-cov lines: 78
### features/forms/agent-tools.ts (13.5%, 45 surv, 0 nocov)
- L212 ObjectLiteral: `authorization: { permission: "admin.forms.manage" },` → `{}`
- L207 ObjectLiteral: `{` → `{}`
- L220 ObjectLiteral: `authorization: { permission: "admin.forms.manage" },` → `{}`
- L224 ArrayDeclaration: `required: ["name", "slug", "fields"],` → `[]`
- L223 BooleanLiteral: `additionalProperties: false,` → `true`
- L226 ObjectLiteral: `name: { type: "string", minLength: 1, maxLength: MAX_NAME_LENGTH, description: "Human-read` → `{}`
- L227 ObjectLiteral: `slug: {` → `{}`
- L242 ObjectLiteral: `authorization: { permission: "admin.forms.manage" },` → `{}`
- L245 BooleanLiteral: `additionalProperties: false,` → `true`
- L246 ArrayDeclaration: `required: ["formId"],` → `[]`
### features/pages/agent-tools.ts (34.1%, 29 surv, 0 nocov)
- L195 ObjectLiteral: `{` → `{}`
- L212 ObjectLiteral: `authorization: { permission: "content.read" },` → `{}`
- L213 ObjectLiteral: `inputSchema: {` → `{}`
- L215 BooleanLiteral: `additionalProperties: false,` → `true`
- L217 ObjectLiteral: `properties: {` → `{}`
- L219 ObjectLiteral: `slug: { type: "string", minLength: 1, description: "The page's slug, including '/' for the` → `{}`
- L220 ObjectLiteral: `regionId: { type: "string", minLength: 1, description: "Optional data-agent-element handle` → `{}`
- L245 ObjectLiteral: `authorization: { permission: PAGES_EDIT_HTML_PERMISSION },` → `{}`
- L249 ArrayDeclaration: `required: ["id", "html"],` → `[]`
- L246 ObjectLiteral: `inputSchema: {` → `{}`
### features/pages/hidden-until-script.ts (69.7%, 43 surv, 0 nocov)
- L21 Regex: `const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;` → `/<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']')*)>/gi`
- L21 Regex: `const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;` → `/<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[']*')*)>/gi`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\S*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^'])'|([^\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([']*)'|([^\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'])))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\S>"']+)))`
- L24 Regex: `const HIDING_DECLARATION = /(?:^|;)\s*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden)` → `/(?:^|;)\S*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidd`
- L24 Regex: `const HIDING_DECLARATION = /(?:^|;)\s*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden)` → `/(?:^|;)\s*(opacity\S*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidd`
### features/pages/html-document-store.memory.ts (54.1%, 43 surv, 8 nocov)
- L50 BlockStatement: `embedWarnings(): readonly PluginEmbedDiagnostic[] { return this.pluginWarnings; }` → `{}`
- L53 LogicalOperator: `this.pluginWarnings = await this.deps.validatePluginEmbeds?.({ workspaceId: this.scope.wor` → `(await this.deps.validatePluginEmbeds?.({   workspaceId: thi`
- L52 BlockStatement: `private async validatePluginEmbeds(input: { html: string }, _options = {}): Promise<void> ` → `{}`
- L48 ArrayDeclaration: `private pluginWarnings: readonly PluginEmbedDiagnostic[] = [];` → `["Stryker was here"]`
- L53 ArrayDeclaration: `this.pluginWarnings = await this.deps.validatePluginEmbeds?.({ workspaceId: this.scope.wor` → `["Stryker was here"]`
- L76 BlockStatement: `private async reindexEntryRefs(html: string): Promise<void> {` → `{}`
- L77 ConditionalExpression: `if (!this.deps.entryRefsRepo) return;` → `true`
- L93 BlockStatement: `private async appendRevision(seq: number, recordedAt: string): Promise<void> {` → `{}`
- L95 BooleanLiteral: `if (!row) return;` → `row`
- L95 ConditionalExpression: `if (!row) return;` → `true`
- no-cov lines: 53,78,79,124,185,195,196,213
### features/plugin-runtime/agent-tools.ts (28.6%, 5 surv, 0 nocov)
- L205 ObjectLiteral: `{` → `{}`
- L210 ObjectLiteral: `authorization: { permission: "admin.plugins.read" },` → `{}`
- L230 ObjectLiteral: `{` → `{}`
- L227 ObjectLiteral: `authorization: { permission: "admin.plugins.enable" },` → `{}`
- L247 ObjectLiteral: `authorization: { permission: "admin.plugins.enable" },` → `{}`
### features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts (94.3%, 14 surv, 0 nocov)
- L99 Regex: `const SENTENCE_BREAK = /[.!?]+(?=\s|$)/;` → `/[.!?](?=\s|$)/`
- L99 Regex: `const SENTENCE_BREAK = /[.!?]+(?=\s|$)/;` → `/[.!?]+(?=\s)/`
- L137 ConditionalExpression: `readingTimeMinutes: prose.words > 0 ? Math.ceil(prose.words / wordsPerMinute) : 0,` → `true`
- L137 EqualityOperator: `readingTimeMinutes: prose.words > 0 ? Math.ceil(prose.words / wordsPerMinute) : 0,` → `prose.words >= 0`
- L154 Regex: `const tokens = block.text.split(/\s+/).filter((token) => WORD_CHAR.test(token));` → `/\s/`
- L173 ConditionalExpression: `if (letters.length > 2 && letters.endsWith("e") && !/[^aeiouy]le$/.test(letters)) {` → `true`
- L173 EqualityOperator: `if (letters.length > 2 && letters.endsWith("e") && !/[^aeiouy]le$/.test(letters)) {` → `letters.length >= 2`
- L173 Regex: `if (letters.length > 2 && letters.endsWith("e") && !/[^aeiouy]le$/.test(letters)) {` → `/[^aeiouy]le/`
- L189 ArithmeticOperator: `const ease = round1(Math.min(100, Math.max(0, 206.835 - 1.015 * wordsPerSentence - 84.6 * ` → `206.835 + 1.015 * wordsPerSentence`
- L189 ArithmeticOperator: `const ease = round1(Math.min(100, Math.max(0, 206.835 - 1.015 * wordsPerSentence - 84.6 * ` → `1.015 / wordsPerSentence`
### features/plugin-runtime/declarative-content-types.ts (93.2%, 18 surv, 0 nocov)
- L91 BooleanLiteral: `return false;` → `true`
- L97 ConditionalExpression: `if (typeof name !== "string" || !validateIdentifierGrammar({ value: name })) {` → `false`
- L117 LogicalOperator: `if (identity && queryable && !isIndexableFieldKind({ value: identity.kind })) {` → `identity || queryable`
- L120 LogicalOperator: `if (!identity || errors.length > 0) return { errors };` → `!identity && errors.length > 0`
- L120 ConditionalExpression: `if (!identity || errors.length > 0) return { errors };` → `false`
- L135 EqualityOperator: `if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_DECLARED_FIELDS) {` → `raw.length >= MAX_DECLARED_FIELDS`
- L136 ArrayDeclaration: `return { fields: [], errors: [declError(`content type '${typeKey}' must declare 1-${MAX_DE` → `["Stryker was here"]`
- L144 MethodExpression: `const queryableCount = fields.filter((field) => field.queryable).length;` → `fields`
- L159 MethodExpression: `return typeof label === "string" && label.trim().length > 0 && label.length <= MAX_LABEL_L` → `label`
- L159 EqualityOperator: `return typeof label === "string" && label.trim().length > 0 && label.length <= MAX_LABEL_L` → `label.length < MAX_LABEL_LENGTH`
### features/plugin-runtime/host-binding.ts (70.3%, 17 surv, 10 nocov)
- L27 ArrowFunction: `hookIds: HOOK_POINTS.map((hook) => hook.name),` → `() => undefined`
- L19 ObjectLiteral: `export const PLUGIN_HOOK_SEMANTICS: Readonly<Record<string, ClaimMode>> = {` → `{}`
- L38 ObjectLiteral: `const declarativeContentTypes: DeclarativeContentTypesPort = {` → `{}`
- L33 ArrowFunction: `buildSdk: ({ sdk }) => sdk,` → `() => undefined`
- L39 ArrowFunction: `validateManifest: ({ manifest }) => validateDeclarativeManifest({ manifest }),` → `() => undefined`
- L41 ArrowFunction: `plan: ({ ports, workspaceId, decls }) => planDeclaredContentTypes({ ports: ports as Pick<D` → `() => undefined`
- L48 Regex: `const DECLARATIVE_DATA_FILE = /(?:^|\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp` → `/(?:^|\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp`
- L42 ArrowFunction: `apply: ({ ports, workspaceId, pluginId, plan }) => applyDeclaredContentTypes({ ports: port` → `() => undefined`
- L48 Regex: `const DECLARATIVE_DATA_FILE = /(?:^|\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp` → `/(?:\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp))`
- L48 Regex: `const DECLARATIVE_DATA_FILE = /(?:^|\/)(?:LICENSE|[^/]+\.(?:json|md|txt|png|jpe?g|gif|webp` → `/(?:^|\/)(?:LICENSE|[/]+\.(?:json|md|txt|png|jpe?g|gif|webp)`
- no-cov lines: 39,41,42,69
### features/plugin-runtime/uninstall-confirmation-ui.ts (66.7%, 2 surv, 0 nocov)
- L37 ArrayDeclaration: `details: [{ label: "Plugin", value: preview.pluginId }, { label: "Version", value: preview` → `[]`
- L39 BooleanLiteral: `"only a human can delete it permanently.", danger: true, confirmLabel: "Move to trash",` → `false`
### features/plugins/lipay/lipay-plugin.ts (63.6%, 4 surv, 0 nocov)
- L72 OptionalChaining: `throw new Error(`lipay dataModule declaration failed: ${declaration.error?.code} — ${decla` → `declaration.error.code`
- L72 OptionalChaining: `throw new Error(`lipay dataModule declaration failed: ${declaration.error?.code} — ${decla` → `declaration.error.message`
- L78 ObjectLiteral: `return createPaymentsService({ ...service, ledger: sqlPaymentsLedger({ kernel: storage }) ` → `{}`
- L78 ObjectLiteral: `return createPaymentsService({ ...service, ledger: sqlPaymentsLedger({ kernel: storage }) ` → `{}`
### features/post/content-stats-tool.ts (94.2%, 10 surv, 0 nocov)
- L34 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `{}`
- L34 BooleanLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `true`
- L35 ObjectLiteral: `includeWordCounts: { type: "boolean", default: true },` → `{}`
- L34 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `{}`
- L35 BooleanLiteral: `includeWordCounts: { type: "boolean", default: true },` → `false`
- L36 ObjectLiteral: `longest: { type: "integer", minimum: 0, maximum: 20, default: 5 },` → `{}`
- L62 Regex: `return { id: post.id, title: post.title, slug: post.slug, words: text === "" ? 0 : text.sp` → `/\s/u`
- L102 ConditionalExpression: `if (typeof longest !== "number" || !Number.isInteger(longest) || longest < 0 || longest > ` → `false`
- L102 EqualityOperator: `if (typeof longest !== "number" || !Number.isInteger(longest) || longest < 0 || longest > ` → `longest >= 20`
- L150 ObjectLiteral: `await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize ` → `{}`
### features/post/cover-image.ts (91.6%, 21 surv, 0 nocov)
- L40 ArrayDeclaration: `const INERT_ELEMENTS = new Set(["script", "style", "template", "noscript"]);` → `[]`
- L49 ConditionalExpression: `return (node.type === "image" || node.type === "media") && object(node.attrs);` → `true`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d\/[^/?#]+(?:[?#].*)?$/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[^?#].*)?$/`
- L62 BlockStatement: `try { return decodeURIComponent(encoded); } catch { return undefined; }` → `{}`
- L84 ConditionalExpression: `if (Array.isArray(node.content)) stack.push(node.content);` → `true`
- L91 ConditionalExpression: `return typeof ref === "string" ? candidate({ assetId: ref, alt: marker.config.alt ?? attrs` → `true`
- L105 UnaryOperator: `const marker = markers.get(node.sourceCodeLocation?.startOffset ?? -1);` → `+1`
### features/post/expected-version.ts (73.7%, 2 surv, 3 nocov)
- L51 ConditionalExpression: `if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {` → `false`
- L51 ConditionalExpression: `if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {` → `false`
- no-cov lines: 70,71,74
### features/post/html-plain-text.ts (83.5%, 18 surv, 0 nocov)
- L21 Regex: `return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {` → `/&(#[xX][0-9a-fA-F]+|#\D+|[a-zA-Z]+);/g`
- L21 Regex: `return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {` → `/&(#[xX][0-9a-fA-F]+|#\d|[a-zA-Z]+);/g`
- L26 MethodExpression: `const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) :` → `entity`
- L29 LogicalOperator: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `!Number.isInteger(codePoint) && codePoint < 0`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `false`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `false`
- L29 EqualityOperator: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `codePoint <= 0`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `true`
- L38 Regex: `const POST_DETAIL_HEADER_OPEN = /<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\s*(["'])((?:(?!\2)[\s` → `/<([a-z][a-z0-9]*)\b[^>]*\sclass\S*=\s*(["'])((?:(?!\2)[\s\S`
- L38 Regex: `const POST_DETAIL_HEADER_OPEN = /<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\s*(["'])((?:(?!\2)[\s` → `/<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\S*(["'])((?:(?!\2)[\s\S`
### features/post/publish-content.ts (89.1%, 30 surv, 0 nocov)
- L185 ConditionalExpression: `if ((field === "author" && post.author === null) || (field === "showAuthor" && post.showAu` → `true`
- L185 ConditionalExpression: `if ((field === "author" && post.author === null) || (field === "showAuthor" && post.showAu` → `true`
- L213 LogicalOperator: `version: existing?.version ?? 0,` → `existing?.version && 0`
- L214 LogicalOperator: `updatedAt: existing?.updatedAt ?? "",` → `existing?.updatedAt && ""`
- L227 BlockStatement: `) {` → `{}`
- L228 ObjectLiteral: `return {` → `{}`
- L268 ConditionalExpression: `if (refs.some((ref) => ref.entityType === "media" && ref.key === featured)) return refs;` → `true`
- L287 BooleanLiteral: `return termIds ? Object.defineProperty(publishRow, "termIds", { value: termIds, enumerable` → `true`
- L318 ArrayDeclaration: `coversTables: ["posts", "post_versions"],` → `[]`
- L323 ArrayDeclaration: `alsoAuthorizes: [TERM_SYNC_PERMISSION],` → `[]`
### features/post/repo.memory.ts (28.1%, 47 surv, 122 nocov)
- L31 ArrayDeclaration: `constructor(initialRows: PostRecord[] = []) {` → `["Stryker was here"]`
- L29 ArrayDeclaration: `private revisions: PostRevisionRecord[] = [];` → `["Stryker was here"]`
- L46 BlockStatement: `async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | nu` → `{}`
- L49 ArrowFunction: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `() => undefined`
- L48 LogicalOperator: `this.rows.find(` → `this.rows.find(row => row.workspaceId === required.workspace`
- L49 ConditionalExpression: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `false`
- L49 ConditionalExpression: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `true`
- L49 EqualityOperator: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `row.workspaceId !== required.workspaceId`
- L55 MethodExpression: `return this.rows.filter((row) => row.workspaceId === required.workspaceId);` → `this.rows`
- L55 ConditionalExpression: `return this.rows.filter((row) => row.workspaceId === required.workspaceId);` → `true`
- no-cov lines: 59,60,61,62,63,70,71,72,73,75,76,77,81,85,87,88,90,136,138,141,143,160,161,162,164,165,230
### features/post/repo.ts (45.6%, 8 surv, 35 nocov)
- L187 ConditionalExpression: `if (updated.length === 0) return { applied: false };` → `false`
- L226 ArrowFunction: `await this.kernel.run((db) =>` → `() => undefined`
- L243 ConditionalExpression: `if (removed.length > 0) await this.search.remove(this.kernel, required.id);` → `true`
- L243 EqualityOperator: `if (removed.length > 0) await this.search.remove(this.kernel, required.id);` → `removed.length >= 0`
- L313 ArrowFunction: `const prior = await this.kernel.run((db) =>` → `() => undefined`
- L324 ArrowFunction: `await this.kernel.run((db) => db.insertInto("post_revisions").values(toRevisionRow(input, ` → `() => undefined`
- L325 ObjectLiteral: `return { id, previousId: prior?.id ?? null };` → `{}`
- L325 LogicalOperator: `return { id, previousId: prior?.id ?? null };` → `prior?.id && null`
- no-cov lines: 80,81,88,89,92,94,103,104,105,114,120,187,249,250,258,271,272,275,282,286,287,290,331,332
### features/post/reverters.ts (72.9%, 16 surv, 10 nocov)
- L66 ConditionalExpression: `if (!post) return null;` → `false`
- L86 ConditionalExpression: `publishAt: inverse.publishAt === undefined ? currentPublishAt : inverse.publishAt,` → `false`
- L87 ConditionalExpression: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `false`
- L87 ConditionalExpression: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `true`
- L87 EqualityOperator: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `inverse.featuredMediaId !== undefined`
- L92 ConditionalExpression: `...(inverse.templateChoice !== undefined ? { templateChoice: inverse.templateChoice } : {}` → `true`
- L135 ConditionalExpression: `if (!inverse) {` → `false`
- L140 ConditionalExpression: `if (!existing) {` → `false`
- L158 ConditionalExpression: `...(inverse.ext !== undefined && Object.keys(inverse.ext).length > 0` → `true`
- L158 ConditionalExpression: `...(inverse.ext !== undefined && Object.keys(inverse.ext).length > 0` → `false`
- no-cov lines: 135,140,158,159,226
### features/post/search-index.postgres.ts (70.4%, 6 surv, 2 nocov)
- L53 Regex: `.replace(/\p{M}+/gu, "")` → `/\p{M}/gu`
- L54 Regex: `.replace(/[^\p{L}\p{N}]+/gu, " ")` → `/[^\p{L}\p{N}]/gu`
- L86 MethodExpression: `const terms = query.terms.flatMap((term) => foldForIndex(term).split(" ")).filter(Boolean)` → `query.terms.flatMap(term => foldForIndex(term).split(" "))`
- L87 ConditionalExpression: `if (terms.length === 0) return [];` → `false`
- L90 ConditionalExpression: `if (query.kind !== undefined) filters.push(sql`p.kind = ${query.kind}`);` → `false`
- L91 ConditionalExpression: `if (query.status !== undefined) filters.push(sql`p.status = ${query.status}`);` → `false`
- no-cov lines: 74,87
### features/post/search.ts (63.6%, 29 surv, 3 nocov)
- L122 MethodExpression: `return query.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];` → `query.toUpperCase()`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 LogicalOperator: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `typeof value === "object" && value !== null || !Array.isArra`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 LogicalOperator: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `typeof value === "object" || value !== null`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L157 ConditionalExpression: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `false`
- L157 LogicalOperator: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `(budget <= 0 || depth > MAX_BODY_DEPTH) && !isNode(node)`
- L157 ConditionalExpression: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `false`
- no-cov lines: 122,253,259
### features/post/slug.ts (68.6%, 11 surv, 0 nocov)
- L8 Regex: `return toSlug(title).slice(0, MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM).replace(/-+$/, "` → `/-$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/untitled(-\d+)?$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^untitled(-\d+)?/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^untitled(-\d)?$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/\d+$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^\d+/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^\d$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/[a-z0-9-]+$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/^[a-z0-9-]$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/^[^a-z0-9-]+$/`
### features/publish-content/backstop-policy.ts (85.5%, 21 surv, 0 nocov)
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals|sessions?|roles?|pol`
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals?|sessions?|roles|pol`
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals?|sessions|roles?|pol`
- L8 Regex: `/^api_keys(?:_|$)/i, /credential/i, /^composio_/i,` → `/api_keys(?:_|$)/i`
- L8 Regex: `/^api_keys(?:_|$)/i, /credential/i, /^composio_/i,` → `/composio_/i`
- L9 Regex: `/^(?:origin_settings|deployment|publish_content|publish_trust|publish_backstop|webhook|for` → `/(?:origin_settings|deployment|publish_content|publish_trust`
- L10 Regex: `/^(?:sqlite_|__?drizzle|drizzle_|migration)/i,` → `/(?:sqlite_|__?drizzle|drizzle_|migration)/i`
- L11 Regex: `/^(?:tovu_(?:chat_)?migrations|schema_migrations)(?:_|$)/i,` → `/(?:tovu_(?:chat_)?migrations|schema_migrations)(?:_|$)/i`
- L10 Regex: `/^(?:sqlite_|__?drizzle|drizzle_|migration)/i,` → `/^(?:sqlite_|__drizzle|drizzle_|migration)/i`
- L13 Regex: `export const BACKSTOP_DENIED_COLUMN_PATTERN = /secret|token|password|_hash$|key/i;` → `/secret|token|password|_hash|key/i`
### features/publish-content/backstop-preview.ts (84.9%, 14 surv, 0 nocov)
- L15 ArrowFunction: `return checkRawTable({ table: row.table, columns: [...row.columns.map((column) => column.n` → `() => undefined`
- L16 ConditionalExpression: `(Object.hasOwn(row.values, "workspace_id") && row.values.workspace_id !== workspaceId ? "T` → `true`
- L19 ConditionalExpression: `typeof value === "object" && value !== null ? Buffer.from(value.blobBase64, "base64").toSt` → `true`
- L51 ConditionalExpression: `(backstop.coveredTables.some((table) => table.toLowerCase() === incoming.table.toLowerCase` → `true`
- L54 ObjectLiteral: `const live = await backstop.rows.read({ table: incoming.table, pk: incoming.pk });` → `{}`
- L64 ConditionalExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `true`
- L64 ConditionalExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `false`
- L64 EqualityOperator: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `entity.id.toLowerCase() !== root.toLowerCase().replace(/\/$/`
- L64 MethodExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `entity.id.toUpperCase()`
- L64 MethodExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `root.toUpperCase()`
### features/publish-content/backstop-service.ts (93.6%, 18 surv, 0 nocov)
- L12 MethodExpression: `return actorId === ownerId || (await roles.list()).some((role) => role.isBuiltin && (role.` → `(await roles.list()).every(role => role.isBuiltin && (role.n`
- L39 ObjectLiteral: `await audit.save({ record: { ...record, result: "pending" } });` → `{}`
- L60 OptionalChaining: `const first = raw[0]?.backstop;` → `raw[0].backstop`
- L73 EqualityOperator: `return typeof reason === "string" && reason.trim().length >= 10 && reason.length <= 2000;` → `reason.trim().length > 10`
- L73 EqualityOperator: `return typeof reason === "string" && reason.trim().length >= 10 && reason.length <= 2000;` → `reason.length < 2000`
- L77 ConditionalExpression: `if (!row || typeof row !== "object") return false;` → `false`
- L79 ConditionalExpression: `return typeof candidate.table === "string" && !!candidate.pk && typeof candidate.pk === "o` → `true`
- L84 EqualityOperator: `if (!Array.isArray(rows) || !Array.isArray(files) || rows.length > BACKSTOP_LIMITS.rows ||` → `rows.length >= BACKSTOP_LIMITS.rows`
- L84 EqualityOperator: `if (!Array.isArray(rows) || !Array.isArray(files) || rows.length > BACKSTOP_LIMITS.rows ||` → `files.length >= BACKSTOP_LIMITS.files`
- L85 ArithmeticOperator: `if (rows.some((row) => !isBackstopRow({ row })) || files.some((file) => typeof file !== "s` → `rows.length - files.length`
### features/publish-content/content-hash.ts (66.7%, 8 surv, 0 nocov)
- L55 ArrayDeclaration: `const EXCLUDED_KEYS: ReadonlySet<string> = new Set([` → `[]`
- L92 ConditionalExpression: `if (value === undefined || value === null) return null;` → `false`
- L93 ConditionalExpression: `if (Array.isArray(value)) return value.map(normalize);` → `false`
- L94 EqualityOperator: `if (typeof value === "object") {` → `typeof value !== "object"`
- L94 ConditionalExpression: `if (typeof value === "object") {` → `false`
- L94 BlockStatement: `if (typeof value === "object") {` → `{}`
- L96 MethodExpression: `for (const key of Object.keys(value as Record<string, unknown>).sort()) {` → `Object.keys(value as Record<string, unknown>)`
- L109 ConditionalExpression: `if (EXCLUDED_KEYS.has(key)) continue;` → `false`
### features/publish-content/export-bundle.ts (54.7%, 17 surv, 31 nocov)
- L236 MethodExpression: `const candidates = source.entities.filter((entity) => !held.has(entityKey(entity.entityTyp` → `source.entities`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 LogicalOperator: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `typeof slug === "string" || slug.length > 0`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 EqualityOperator: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `slug.length >= 0`
- L241 ConditionalExpression: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `true`
- L241 LogicalOperator: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `address !== null || !byAddress.has(address)`
- L241 ConditionalExpression: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `true`
- L275 OptionalChaining: `const referencesOf = (entity: PackedEntity) => handlers.get(entity.entityType)?.references` → `handlers.get(entity.entityType)?.references(entity)`
- no-cov lines: 61,62,178,179,182,204,206,207,208,209,212,215,217,275,302,319,320,322,330,336
### features/publish-content/file-tree-policy.ts (90.3%, 28 surv, 0 nocov)
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][a-z0-9]+)*/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[^-.][a-z0-9]+)*$/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][a-z0-9])*$/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][^a-z0-9]+)*$/`
- L96 ConditionalExpression: `if (segment.length === 0 || segment.length > MAX_ID_SEGMENT_LENGTH || !ID_SEGMENT_PATTERN.` → `false`
- L96 EqualityOperator: `if (segment.length === 0 || segment.length > MAX_ID_SEGMENT_LENGTH || !ID_SEGMENT_PATTERN.` → `segment.length >= MAX_ID_SEGMENT_LENGTH`
- L117 Regex: `const MCP_CONFIG_NAME_PATTERN = /^\.mcp\..*\.json$/;` → `/\.mcp\..*\.json$/`
- L117 Regex: `const MCP_CONFIG_NAME_PATTERN = /^\.mcp\..*\.json$/;` → `/^\.mcp\..*\.json/`
- L196 MethodExpression: `const base = relPath.slice(relPath.lastIndexOf("/") + 1);` → `relPath`
- L198 ConditionalExpression: `return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();` → `false`
### features/publish-content/gated-hooks.ts (79.1%, 8 surv, 1 nocov)
- L251 BlockStatement: `const getBaseline: PlanImportDeps["getBaseline"] = async ({ entityType, entityId }) => {` → `{}`
- L252 ObjectLiteral: `const record = await input.baselineRepo.findOne({` → `{}`
- L264 ArrowFunction: `const hasBlob = async (sha256: string): Promise<boolean> =>` → `() => undefined`
- L271 ConditionalExpression: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `true`
- L271 ConditionalExpression: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `false`
- L271 EqualityOperator: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `input.getSeedHash !== undefined`
- L272 ConditionalExpression: `...(input.forcedEntityKeys === undefined ? {} : { forcedEntityKeys: input.forcedEntityKeys` → `false`
- L290 ObjectLiteral: `const captured = await input.dbOps.captureRestorePoint({ scopeId: input.workspaceId });` → `{}`
- no-cov lines: 271
### features/publish-content/media-references.ts (81.7%, 36 surv, 0 nocov)
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 LogicalOperator: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `node.type === 'widgetEmbed' && isPlainObject(node.attrs) || `
- L108 LogicalOperator: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `node.type === 'widgetEmbed' || isPlainObject(node.attrs)`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L112 ConditionalExpression: `if (marker.type.toLowerCase() !== 'widget') continue;` → `false`
- L114 ConditionalExpression: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `true`
- L114 LogicalOperator: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `target || target.key !== 'none'`
- L114 ConditionalExpression: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `true`
### features/publish-content/precheck-reasons.ts (12.5%, 4 surv, 3 nocov)
- L33 BlockStatement: `export function addressHeldByOther(entityType: string, field: string, value: string, holde` → `{}`
- L40 BlockStatement: `export function addressHeldInTrash(entityType: string, field: string, value: string, holde` → `{}`
- L24 BlockStatement: `export function notWired(entityType: string, id: string, portName: string): string {` → `{}`
- L48 BlockStatement: `export function trashedAtDestination(entityType: string, id: string): string {` → `{}`
- no-cov lines: 65,73,81
### features/publish-content/push-plan.ts (81.4%, 11 surv, 0 nocov)
- L26 ObjectLiteral: `const workspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });` → `{}`
- L51 ConditionalExpression: `input.scope == null` → `true`
- L51 ConditionalExpression: `input.scope == null` → `false`
- L51 EqualityOperator: `input.scope == null` → `input.scope != null`
- L64 ConditionalExpression: `{ bundle, ...(input.overwriteEntityKeys == null ? {} : { overwriteEntityKeys: input.overwr` → `false`
- L72 ArrowFunction: `const heldBackCount = result.notSupportedByLive.reduce((sum, entry) => sum + entry.count, ` → `() => undefined`
- L72 ArithmeticOperator: `const heldBackCount = result.notSupportedByLive.reduce((sum, entry) => sum + entry.count, ` → `sum - entry.count`
- L91 ConditionalExpression: `[entity.state.title, entity.state.slug, entity.displayLabel].filter((name): name is string` → `true`
- L91 EqualityOperator: `[entity.state.title, entity.state.slug, entity.displayLabel].filter((name): name is string` → `name.length >= 0`
- L95 ArithmeticOperator: `entityCount: bundle.entities.length - heldBackCount,` → `bundle.entities.length + heldBackCount`
### features/publish-content/raw-file-contributor.ts (80.5%, 62 surv, 0 nocov)
- L19 ArrayDeclaration: `return { entityType: "raw-file", dependsOn: [], build: (deps) => {` → `["Stryker was here"]`
- L21 ArrayDeclaration: `const skipped: SkippedPackEntity[] = [];` → `["Stryker was here"]`
- L24 ConditionalExpression: `if (policy) return policy;` → `false`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `deps.backstop?.coveredRoots.every(root => relPath.toLowerCas`
- L25 OptionalChaining: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `deps.backstop.coveredRoots`
- L25 ConditionalExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `false`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `relPath.toUpperCase()`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `root.toUpperCase()`
- L25 Regex: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `/\//`
- L26 Regex: `relPath.toLowerCase().startsWith(root.toLowerCase().replace(/\/$/, "") + "/"))` → `/\//`
### features/publish-content/raw-row-contributor.ts (65.8%, 126 surv, 13 nocov)
- L10 MethodExpression: `return `${table}:${JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) =>` → `Object.entries(pk)`
- L10 ArrowFunction: `return `${table}:${JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) =>` → `() => undefined`
- L16 EqualityOperator: `if (split < 1) return null;` → `split <= 1`
- L16 ConditionalExpression: `if (split < 1) return null;` → `false`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `(!pk || typeof pk !== "object" || Array.isArray(pk)) && chec`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `(!pk || typeof pk !== "object") && Array.isArray(pk)`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `!pk && typeof pk !== "object"`
- no-cov lines: 36,77,86,112,124,158,215
### features/publish-content/repo-handler.ts (77.6%, 25 surv, 19 nocov)
- L156 LogicalOperator: `const schemaVersion = config.schemaVersion ?? 1;` → `config.schemaVersion && 1`
- L157 LogicalOperator: `const dependsOn = config.dependsOn ?? [];` → `config.dependsOn && []`
- L157 ArrayDeclaration: `const dependsOn = config.dependsOn ?? [];` → `["Stryker was here"]`
- L167 LogicalOperator: `const omittable = new Set(config.omitWhenAbsent ?? []);` → `config.omitWhenAbsent && []`
- L167 ArrayDeclaration: `const omittable = new Set(config.omitWhenAbsent ?? []);` → `["Stryker was here"]`
- L170 MethodExpression: `fields` → `fields`
- L171 ConditionalExpression: `.filter((field) => !(omittable.has(field) && (row as Record<string, unknown>)[field] === u` → `false`
- L171 LogicalOperator: `.filter((field) => !(omittable.has(field) && (row as Record<string, unknown>)[field] === u` → `omittable.has(field) || (row as Record<string, unknown>)[fie`
- L183 ConditionalExpression: `if (err instanceof PublishContentApplyRowError || !(err instanceof Error)) return err;` → `false`
- L183 LogicalOperator: `if (err instanceof PublishContentApplyRowError || !(err instanceof Error)) return err;` → `err instanceof PublishContentApplyRowError && !(err instance`
- no-cov lines: 138,140,143,147,148,171,198,209
### features/redirects/tool-registrations.ts (86.7%, 12 surv, 6 nocov)
- L127 ObjectLiteral: `surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ schedule` → `{}`
- L127 ObjectLiteral: `surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ schedule` → `{}`
- L216 ConditionalExpression: `if (!rule) throw new RedirectNotFoundError(`redirect '${id}' was not found`);` → `false`
- L222 BooleanLiteral: `return { tombstoned: true, cancelled: false, rule: toRedirectToolView(record) };` → `true`
- L233 ConditionalExpression: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `false`
- L233 LogicalOperator: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `(!Array.isArray(input.rules) || input.rules.length < 1) && i`
- L233 ConditionalExpression: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `false`
- L233 LogicalOperator: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `!Array.isArray(input.rules) && input.rules.length < 1`
- L233 ConditionalExpression: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `false`
- L233 ConditionalExpression: `if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_IMPO` → `false`
- no-cov lines: 164,233,234,239,278,279
### features/site-backup/import-restore-placement.ts (82.7%, 18 surv, 0 nocov)
- L24 Regex: `const THEME_MANIFEST = /^themes\/(static|declarative)\/([^/]+)\/theme.json$/;` → `/themes\/(static|declarative)\/([^/]+)\/theme.json$/`
- L21 ObjectLiteral: `const PLAIN: ThemeManifestVerdict = { kind: "plain" };` → `{}`
- L24 Regex: `const THEME_MANIFEST = /^themes\/(static|declarative)\/([^/]+)\/theme.json$/;` → `/^themes\/(static|declarative)\/([^/]+)\/theme.json/`
- L25 Regex: `const THEME_FILE = /^themes\/(static|declarative)\/([^/]+)\/(.+)$/;` → `/themes\/(static|declarative)\/([^/]+)\/(.+)$/`
- L25 Regex: `const THEME_FILE = /^themes\/(static|declarative)\/([^/]+)\/(.+)$/;` → `/^themes\/(static|declarative)\/([^/]+)\/(.+)/`
- L26 Regex: `const THEME_ID = /^themes\/((?:static|declarative)\/[^/]+)\//;` → `/themes\/((?:static|declarative)\/[^/]+)\//`
- L27 Regex: `const STATIC_ASSET = /\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf` → `/\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|w`
- L27 Regex: `const STATIC_ASSET = /\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf` → `/\.(?:html|css|js|json|map|png|jpeg|gif|webp|avif|svg|ico|wo`
- L27 Regex: `const STATIC_ASSET = /\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf` → `/\.(?:html|css|js|json|map|png|jpe?g|gif|webp|avif|svg|ico|w`
- L43 ConditionalExpression: `if (verdict.kind === "compiled") compiledSources.set(id, verdict.sourcePrefix);` → `true`
### features/site-backup/share-backend.ts (84.5%, 11 surv, 0 nocov)
- L47 ObjectLiteral: `const content = await required.prepare({ signal: bounded });` → `{}`
- L74 ObjectLiteral: `list: async () => (await required.registry.list({ site: required.site })).map(view),` → `{}`
- L80 ConditionalExpression: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `true`
- L80 LogicalOperator: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `row.storage || !(row.storage.provider === "tovu-server" && r`
- L80 ConditionalExpression: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `false`
- L80 ConditionalExpression: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `true`
- L80 EqualityOperator: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `row.storage.binding !== required.registry.directory`
- L80 LogicalOperator: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `row.storage.provider === "tovu-server" || row.storage.bindin`
- L80 ConditionalExpression: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `true`
- L80 EqualityOperator: `if (row.storage && !(row.storage.provider === "tovu-server" && row.storage.binding === req` → `row.storage.provider !== "tovu-server"`
### features/site-backup/share-registry.ts (69.3%, 37 surv, 9 nocov)
- L19 Regex: `const ID = /^[0-9a-f-]{36}$/;` → `/[0-9a-f-]{36}$/`
- L19 Regex: `const ID = /^[0-9a-f-]{36}$/;` → `/^[0-9a-f-]{36}/`
- L20 Regex: `export const SHARE_TOKEN = /^[0-9a-f]{64}$/;` → `/^[0-9a-f]{64}/`
- L20 Regex: `export const SHARE_TOKEN = /^[0-9a-f]{64}$/;` → `/[0-9a-f]{64}$/`
- L21 Regex: `export const SHARE_FILE = /^[a-z0-9][a-z0-9-]{0,79}\.tovu\.zip$/;` → `/^[a-z0-9][a-z0-9-]{0,79}\.tovu\.zip/`
- L33 ConditionalExpression: `if (!ID.test(id)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid sh` → `false`
- L42 ConditionalExpression: `if (!SHARE_TOKEN.test(required.token)) throw new SiteShareRefusal({ code: "INVALID_INPUT",` → `false`
- L47 BlockStatement: `catch (error) {` → `{}`
- L46 ObjectLiteral: `try { await writeFile(file, required.shareId, { flag: "wx", mode: 0o600 }); }` → `{}`
- L48 ConditionalExpression: `if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;` → `false`
- no-cov lines: 33,42,49,74,96,105
### features/site-backup/share-service.ts (92.1%, 11 surv, 0 nocov)
- L36 ObjectLiteral: `return deliverShare({ registry: required.registry, row, delivery: optional.delivery, key, ` → `{}`
- L41 Regex: `return required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").sli` → `/[^a-z0-9]/g`
- L41 Regex: `return required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").sli` → `/^-|-+$/g`
- L41 Regex: `return required.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").sli` → `/^-+|-$/g`
- L50 ConditionalExpression: `return required.storage.provider === "tovu-server" && required.storage.binding === require` → `true`
- L63 ObjectLiteral: `const { url } = await delivery.store.upload({ key, bytes: required.archive, headers: { ...` → `{}`
- L65 ObjectLiteral: `await registry.put({ record: { ...row, storage: { ...row.storage, provider: delivery.provi` → `{}`
- L66 ObjectLiteral: `if (!await delivery.store.verify({ key, url, present: true, bytes: row.bytes }, { signal: ` → `{}`
- L68 OptionalChaining: `if (current?.status === "revoked") throw new SiteShareRefusal({ code: "REVOKED", message: ` → `current.status`
- L86 ObjectLiteral: `await delivery.store.delete({ key });` → `{}`
### features/site-backup/tool-registrations.ts (79.6%, 33 surv, 0 nocov)
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
- L92 BooleanLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `true`
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
- L92 ArrayDeclaration: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `[]`
- L92 ArrayDeclaration: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `[]`
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
- L92 ArrayDeclaration: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `[]`
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
- L92 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, oneOf: [{ required: ["url"] },` → `{}`
### features/trash/agent-tools.ts (60.0%, 5 surv, 1 nocov)
- L52 BlockStatement: `function entityTypeProperty(kinds: readonly TrashEntityType[]) {` → `{}`
- L158 ArrayDeclaration: `return [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...(registry?.keys() ?? [])` → `[]`
- L158 ArrayDeclaration: `return [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...(registry?.keys() ?? [])` → `[]`
- L158 LogicalOperator: `return [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...(registry?.keys() ?? [])` → `registry?.keys() && []`
- L158 OptionalChaining: `return [...new Set([...TRASH_PERMISSION_BY_ENTITY_TYPE.keys(), ...(registry?.keys() ?? [])` → `registry.keys`
- no-cov lines: 158
### features/trash/move-to-trash.ts (50.7%, 6 surv, 29 nocov)
- L109 ConditionalExpression: `if (mover) {` → `false`
- L116 ConditionalExpression: `if (!entry) return { ok: false, reason: "unknown-type" };` → `false`
- L141 ConditionalExpression: `if (entry.versionColumn && input.expectedVersion !== undefined && (row.version ?? null) !=` → `false`
- L150 LogicalOperator: `display: { title: row.title, subtitle: row.subtitle ?? null },` → `row.subtitle && null`
- L152 LogicalOperator: `expectedVersion: entry.versionColumn ? (row.version ?? null) : null,` → `row.version && null`
- L160 ConditionalExpression: `if (marker.ok) return { ok: true, version: marker.version };` → `true`
- no-cov lines: 109,110,111,113,116,141,142,164,165,166
### features/trash/registry.ts (60.9%, 25 surv, 0 nocov)
- L199 ObjectLiteral: `display: { title: "members.email" },` → `{}`
- L196 ObjectLiteral: `marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "disabled" ` → `{}`
- L203 ArrayDeclaration: `purgeFirst: [` → `[]`
- L204 ObjectLiteral: `{ table: "member_sessions", parentIdColumn: "member_id" },` → `{}`
- L205 ObjectLiteral: `{ table: "member_magic_tokens", parentIdColumn: "member_id" },` → `{}`
- L207 ObjectLiteral: `{ table: "member_consents", parentIdColumn: "member_id" },` → `{}`
- L206 ObjectLiteral: `{ table: "member_subscriptions", parentIdColumn: "member_id" },` → `{}`
- L240 ObjectLiteral: `marker: { kind: "timestamp", column: "deleted_at" },` → `{}`
- L245 ObjectLiteral: `display: {` → `{}`
- L248 ObjectLiteral: `join: { table: "form_definitions", on: ["form_definitions.id", "form_submissions.form_defi` → `{}`
### features/trash/repo.ts (75.0%, 16 surv, 2 nocov)
- L50 ConditionalExpression: `entityVersion: row.entity_version === null ? null : Number(row.entity_version),` → `false`
- L50 ConditionalExpression: `entityVersion: row.entity_version === null ? null : Number(row.entity_version),` → `true`
- L50 EqualityOperator: `entityVersion: row.entity_version === null ? null : Number(row.entity_version),` → `row.entity_version !== null`
- L86 LogicalOperator: `prior_marker: row.priorMarker ?? null,` → `row.priorMarker && null`
- L94 BlockStatement: `async findByEntity(required: { workspaceId: string; entityType: TrashEntityType; entityId:` → `{}`
- L121 BlockStatement: `async deleteById(required: { workspaceId: string; id: string }): Promise<void> {` → `{}`
- L122 ArrowFunction: `await this.kernel.run((db) =>` → `() => undefined`
- L159 ConditionalExpression: `if (optional.entityTypes && optional.entityTypes.length > 0) {` → `true`
- L159 EqualityOperator: `if (optional.entityTypes && optional.entityTypes.length > 0) {` → `optional.entityTypes.length >= 0`
- L175 UnaryOperator: `const last = items.at(-1);` → `+1`
- no-cov lines: 127,128
### features/trash/table-adapter.ts (87.2%, 28 surv, 1 nocov)
- L95 ConditionalExpression: `if (childIds.length === 0) return;` → `false`
- L86 ArrowFunction: `const lockRow = (workspaceId: string, entityId: string) => kernel().lockKey(`trash:${entry` → `() => undefined`
- L124 ConditionalExpression: `if (throughIds.length === 0) return; // nothing on the other side of the join to cascade t` → `false`
- L125 ConditionalExpression: `if (cascade.entityType) await cleanUpTrashedItemsRows(workspaceId, cascade.entityType, thr` → `true`
- L125 ConditionalExpression: `if (cascade.entityType) await cleanUpTrashedItemsRows(workspaceId, cascade.entityType, thr` → `false`
- L146 ConditionalExpression: `if (entry.versionColumn) columns.push(eb.ref(qualified(entry.table, entry.versionColumn)).` → `true`
- L160 ConditionalExpression: `if (!entry.versionColumn) return null;` → `false`
- L162 OptionalChaining: `return row?.version ?? null;` → `row.version`
- L176 ConditionalExpression: `if (entry.touchColumn) set[entry.touchColumn] = at;` → `false`
- L177 ConditionalExpression: `if (entry.versionColumn) set[entry.versionColumn] = sql`${sql.ref(entry.versionColumn)} + ` → `true`
- no-cov lines: 334
### features/trash/trash-item-tool.ts (28.8%, 21 surv, 83 nocov)
- L158 ObjectLiteral: `{` → `{}`
- L155 ArrayDeclaration: `export const TRASH_ITEM_DELEGATES: ReadonlyMap<TrashEntityType, TrashItemDelegate> = new M` → `[]`
- L172 ObjectLiteral: `{` → `{}`
- L187 ObjectLiteral: `{` → `{}`
- L200 ObjectLiteral: `{` → `{}`
- L211 ObjectLiteral: `{` → `{}`
- L224 ObjectLiteral: `{` → `{}`
- L259 BooleanLiteral: `additionalProperties: false,` → `true`
- L260 ArrayDeclaration: `required: ["entityType", "entityId"],` → `[]`
- L267 ObjectLiteral: `entityId: { type: "string", minLength: 1, description: "That thing's own id." },` → `{}`
- no-cov lines: 163,164,166,178,180,181,193,194,204,205,217,218,230,231,284,285,342,343,344,346,357,358,360,361,364,366,367,369,370,382,385,386,387,388,391,392,398,399,411,412…
### features/webhooks/keyring.env.ts (81.3%, 17 surv, 9 nocov)
- L151 ObjectLiteral: `if (present.parsed.ok) return new JiniFixedSiteKeyKeyring({ hex: present.parsed.hex, hkdfS` → `{}`
- L177 ConditionalExpression: `if (error instanceof JiniUnusableSiteKeyError) {` → `false`
- L463 ConditionalExpression: `if (isAlreadyExistsError(error) || (error instanceof Error && error.name === "RootKeyFileA` → `true`
- L463 ConditionalExpression: `if (isAlreadyExistsError(error) || (error instanceof Error && error.name === "RootKeyFileA` → `true`
- L463 LogicalOperator: `if (isAlreadyExistsError(error) || (error instanceof Error && error.name === "RootKeyFileA` → `error instanceof Error || error.name === "RootKeyFileAlready`
- L474 ConditionalExpression: `if (typeof err !== "object" || err === null || !("code" in err)) return false;` → `true`
- L473 BlockStatement: `function isAlreadyExistsError(err: unknown): boolean {` → `{}`
- L474 ConditionalExpression: `if (typeof err !== "object" || err === null || !("code" in err)) return false;` → `false`
- L474 ConditionalExpression: `if (typeof err !== "object" || err === null || !("code" in err)) return false;` → `false`
- L474 LogicalOperator: `if (typeof err !== "object" || err === null || !("code" in err)) return false;` → `typeof err !== "object" && err === null`
- no-cov lines: 177,178,476
### features/webhooks/secret-scan-guard.ts (57.3%, 39 surv, 43 nocov)
- L100 ArrayDeclaration: `const SKIP_EXTENSIONS = new Set([` → `[]`
- L145 ObjectLiteral: `{` → `{}`
- L154 ConditionalExpression: `return ALLOWLIST.some((e) => e.file === file && e.patternName === patternName && e.value =` → `true`
- L154 LogicalOperator: `return ALLOWLIST.some((e) => e.file === file && e.patternName === patternName && e.value =` → `e.file === file || e.patternName === patternName`
- L154 ConditionalExpression: `return ALLOWLIST.some((e) => e.file === file && e.patternName === patternName && e.value =` → `true`
- L154 ConditionalExpression: `return ALLOWLIST.some((e) => e.file === file && e.patternName === patternName && e.value =` → `true`
- L159 MethodExpression: `return out.split("\0").filter(Boolean);` → `out.split("\0")`
- L182 ConditionalExpression: `if (match[0].length === 0) re.lastIndex += 1; // guard against zero-length matches looping` → `false`
- L182 ConditionalExpression: `if (match[0].length === 0) re.lastIndex += 1; // guard against zero-length matches looping` → `true`
- L182 EqualityOperator: `if (match[0].length === 0) re.lastIndex += 1; // guard against zero-length matches looping` → `match[0].length !== 0`
- no-cov lines: 182,199,212,213,214,218,220,223,226,249,251,303,377,381,388,390,394,399,418
### features/webhooks/site-key-sources.ts (75.8%, 26 surv, 3 nocov)
- L72 ObjectLiteral: `assertTestHomeIsolation({ homeDir: input.home });` → `{}`
- L73 ArrayDeclaration: `const sources: SiteKeySource[] = [];` → `["Stryker was here"]`
- L105 ConditionalExpression: `return SAFE_SITE_KEY_ID.test(id) && id !== "." && id !== "..";` → `true`
- L105 ConditionalExpression: `return SAFE_SITE_KEY_ID.test(id) && id !== "." && id !== "..";` → `true`
- L141 BlockStatement: `} catch {` → `{}`
- L121 BlockStatement: `function legacyVolumeFilePath(cwd: string): string {` → `{}`
- L147 BlockStatement: `} catch {` → `{}`
- L150 ConditionalExpression: `return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed a` → `true`
- L150 LogicalOperator: `return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed a` → `typeof parsed === "object" && parsed !== null || !Array.isAr`
- L150 ConditionalExpression: `return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed a` → `true`
- no-cov lines: 205,206,207

L14 DONE 2026-10-25T20:35Z — wall ~3h50, ~0.2M tokens
