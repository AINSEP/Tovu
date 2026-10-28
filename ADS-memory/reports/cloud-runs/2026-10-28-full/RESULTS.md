# Full verification run 2026-10-28 — RESULTS (report only)
Tovu branch cloud/full-1028 (WIP snapshot 72c20a95), Jini cloud/full-1028 @ 18b4df78. Sonnet 5.5, no product edits committed. Local uncommitted setup only: all @jini-ai deps rewritten to file:../Jini/packages/*, root overrides removed, npm install (npm ci impossible: @jini-ai/cookie-consent@^0.6.13 not on npm), @testing-library/dom added.

## §0 One screen
**Dominant finding (REAL):** apps/website/src/platform/db/sqlite/fresh-content-db.ts:231 throws "fresh content bootstrap is behind CONTENT_MIGRATIONS" because its operations map has no entry for migration **0036_publish_history_config_jsonb** (migrations/index.ts:105; migration is Postgres-only, SQLite keeps text -> a no-op op fixes it). It fails 5815 of 5875 failing leaf tests across 701 files. Every Tovu suite number below (and the coverage numbers) is therefore depressed and NOT representative; re-measure after that one-line fix.

| Suite | Result |
|---|---|
| Jini build | 3 pkgs fail: memory (TS2379 src/extraction-log.ts:194), core (TS2322 src/records.test.ts:119), cookie-consent |
| Jini typecheck | 2 TS errors (same memory/core) |
| Jini guard | 19 violations (cookie-consent not in layer table L0; diagnostics->analytics L2->L4; user-management->ui L4->L5; SI-domain cookie-consent client; 2 new HW2, 2 new HW3, 27 stale debt) |
| Jini test:scripts | 3 fail (retired-package/infra-retirement tests, j05 final state) |
| Jini package vitest | 35 packages with tests, ALL tests pass (e.g. ui 8704, agent-runtime 4244, cms 4286). Per-package exit 1 only from coverage thresholds in 11 packages |
| Tovu typecheck | root 0, scripts 0, desktop x4 0, site-chat 0; e2e 7 (development/e2e/soak/desktop.soak.ts TS7006); typecheck:tests 396 (PostRecord vs PublicPostRecord/CoverImagePost, InMemoryPostRepo vs PostRepoPort, InMemoryOutbox.records private); admin 2 (use-edit-media-panel.hooks.ts:9 describeApiError not exported from ../rules; use-folder-drop.hooks.unit.test.ts:726) |
| Tovu node:test (8 shards) | s00 and s04 hit the 3000 s guard (partial, no lcov); s01,s02,s03,s05,s06,s07 exit 1. Leaf TAP ok lines (incl. nested, 8 shards, s00/s04 partial): 25781; 5875 failing leaf tests, 5815 root-cause above, 60 other |
| Admin vitest (rerun) | 13540 pass, 3 fail (2 files of 833): all describeApiError (see above). Coverage L99.41 B98.4 F98.74 |
| Desktop npm test | 2534 tests, 1 fail: site-error-feedback.test.ts "D-24: Add feedback stays on the websites view when switching to a site tab" (fails on lone re-run: REAL) |
| Coverage (invalid-ish, see caveat) | all-files merged from 6 of 8 shards: lines 85.31%, branches 69.63%, funcs 56.10%; 1071 never-loaded (admin/site-chat/desktop vitest-only so show 0). Route files (333 measurable): floor script L75.11 (floor 99) B86.72 F46.52 (floor 93) -> FAIL as expected |
| Complexity | Tovu 1273 messages in 617 files; core rules: complexity=5, sonarjs/cognitive-complexity=6; rest sonarjs (nested-conditional 156, expression-complexity 147, no-inconsistent-returns 125, nested-template 108, no-redundant-optional 100). Jini: eslint aborts ("sonarjs plugin not found" for a config object) -> NOT MEASURED |
| Architecture | check:boundaries EXIT 167 (167 errors: 163 no-deep-imports, 3 domain-no-direct-assistant-tool-registration, 1 feature-no-server-or-framework-imports; 528 warnings). check-architecture FAILED: module API surface 393->817, 28 new mutual module cycles; hub count 195->471 (non-blocking). madge circular: website 111, admin 176, desktop 169 |

## §1 Failing tests
Full list: raw/tovu-failing-leaf.json (name, file, error). Classification:
- **REAL (root, 5815 leaf / 701 files):** fresh-content-db.ts:231 as above. Includes fresh-content-db.unit.test.ts cases that expect the guard.
- Non-root (60 leaf, 20 files) — rerun alone once (raw/rerun-nonroot.txt):
  - search.dialects.test.ts (5, "did not finish before parent cancelled") — passes alone: FLAKY/ENV (load, 4 CPUs).
  - seal-aad-invariant.test.ts, providers-tools.test.ts — pass alone: FLAKY/ENV-or-cascade.
  - release-manifests.test.ts — fails alone: "Invalid comparator: file:../Jini/packages/chat" — ENV (caused by my local file: override).
  - tool-registrations.postgres.test.ts (4 fail alone, planId required) and external-mcp-repo.test.ts (40 fail alone) — fail alone, likely root cause cascade or Postgres setup (ENV) — unverified.
  - static-publish/adapter.unit.test.ts, embeds-everywhere.route.test.ts ("test failed") — fail alone/not rerun: unclassified.
  - disk-leak.test.ts "fixture server exited before readiness" — ENV likely.
  - boundary tests (features-no-server-imports, no-vendor-in-core, no-raw-sqlite, mcp-ui..., tool-registrations.assembly-pins, tool-contribution-registry, tool-metadata-projections, daemon-boots, component-catalog-routes, member-external-identities-step): not re-run; likely REAL arch drift (see §4) or cascade.
- Admin: 3 tests, REAL, describeApiError import (src/features/media/hooks/use-edit-media-panel.hooks.ts:9, from ../rules which no longer exports it).
- Desktop: site-error-feedback.test.ts:82-88 D-24, REAL (fails alone).
- Jini test:scripts: 3 fails, REAL/STALE (retired-package guard tests: infra still referenced) — see raw/jini-scripts.log.

## §2 Coverage gaps
Caveat: shards s00/s04 timed out (no lcov) and 5815 tests fail on bootstrap, so Tovu numbers below are lower bounds.
### Top 50 route files by uncovered lines (L% / B% / F% / uncovered)
| file | L | B | F | uncovered |
|---|---|---|---|---|
| inbound/public-http/routes/site/pages.ts | 92.9 | 68.4 | 62.9 | 219 |
| inbound/admin-http/routes/system/publish-site.ts | 76.91 | 86.96 | 50 | 109 |
| inbound/admin-http/routes/publish-content/backstop.ts | 63.67 | 71.15 | 65.38 | 97 |
| inbound/admin-http/routes/recovery/restore.ts | 62.7 | 83.33 | 50 | 91 |
| inbound/public-http/routes/site/chat-comparison-html.ts | 11.76 | 100 | 33.33 | 75 |
| inbound/admin-http/routes/database/migrate-forward.ts | 58.05 | 100 | 33.33 | 73 |
| inbound/admin-http/routes/posts/template-preview-render.ts | 65.4 | 75 | 25 | 73 |
| inbound/admin-http/routes/taxonomy/merge-term.ts | 56.52 | 100 | 33.33 | 70 |
| inbound/public-http/routes/site/media-rendition.ts | 90.7 | 54.17 | 40.74 | 66 |
| inbound/admin-http/routes/system/site-key.ts | 91.26 | 85.71 | 66.67 | 54 |
| inbound/admin-http/routes/external-mcp/put.ts | 72.32 | 100 | 28.57 | 49 |
| inbound/admin-http/routes/publish-content/bundle-create.ts | 78.97 | 100 | 66.67 | 49 |
| inbound/admin-http/routes/system/custom-credentials.ts | 78.13 | 55.56 | 69.23 | 49 |
| inbound/admin-http/routes/widgets/agent-tools.ts | 85.53 | 43.59 | 70 | 46 |
| inbound/admin-http/routes/agent-plugins/admin-surfaces.ts | 66.15 | 100 | 18.18 | 44 |
| inbound/admin-http/routes/forms/list-submissions.ts | 54.17 | 100 | 50 | 44 |
| inbound/admin-http/routes/users/write-policy-permission.ts | 55.1 | 44.44 | 60 | 44 |
| inbound/admin-http/routes/agent-plugins/install.ts | 66.92 | 100 | 28.57 | 43 |
| inbound/admin-http/routes/pages/delete.ts | 67.91 | 100 | 66.67 | 43 |
| inbound/admin-http/routes/media/import-url.ts | 50 | 100 | 50 | 41 |
| inbound/admin-http/routes/members/request-magic-link.ts | 67.52 | 100 | 40 | 38 |
| inbound/admin-http/routes/change-sets/revert.ts | 67.26 | 100 | 50 | 37 |
| inbound/admin-http/routes/external-mcp/oauth.ts | 80.11 | 100 | 44.44 | 37 |
| inbound/admin-http/routes/forms/update.ts | 67.83 | 100 | 50 | 37 |
| inbound/admin-http/routes/forms/pull-submissions.ts | 50 | 100 | 40 | 36 |
| inbound/admin-http/routes/media/replace.ts | 57.32 | 100 | 33.33 | 35 |
| inbound/admin-http/routes/entries/update.ts | 61.36 | 100 | 66.67 | 34 |
| inbound/admin-http/routes/forms/delete-submission.ts | 55.26 | 100 | 66.67 | 34 |
| inbound/admin-http/routes/plugins/set-enabled.ts | 81.62 | 60 | 70 | 34 |
| inbound/admin-http/routes/entries/lifecycle.ts | 61.18 | 100 | 66.67 | 33 |
| inbound/admin-http/routes/entries/create.ts | 62.79 | 100 | 50 | 32 |
| inbound/public-http/routes/members/complete-sign-in.ts | 65.22 | 100 | 42.86 | 32 |
| inbound/admin-http/routes/content-types/lifecycle.ts | 66.3 | 100 | 66.67 | 31 |
| inbound/admin-http/routes/forms/get-submission.ts | 58.67 | 100 | 50 | 31 |
| inbound/admin-http/routes/seo/put-settings.ts | 41.51 | 100 | 66.67 | 31 |
| inbound/admin-http/routes/redirects/update.ts | 53.13 | 100 | 50 | 30 |
| inbound/admin-http/routes/integrations/deliveries.ts | 62.82 | 100 | 50 | 29 |
| inbound/admin-http/routes/integrations/list.ts | 65.48 | 100 | 50 | 29 |
| inbound/admin-http/routes/redirects/hits.ts | 42 | 100 | 66.67 | 29 |
| inbound/public-http/routes/content/posts/get-by-slug.ts | 64.63 | 100 | 50 | 29 |
| inbound/admin-http/routes/seo/get-entry.ts | 45.1 | 100 | 66.67 | 28 |
| inbound/admin-http/routes/database/timeline.ts | 66.67 | 100 | 33.33 | 27 |
| inbound/admin-http/routes/menus/get-by-id.ts | 48.08 | 100 | 66.67 | 27 |
| inbound/admin-http/routes/publish-content/import.ts | 91.06 | 60.98 | 86.67 | 27 |
| inbound/admin-http/routes/redirects/get-by-id.ts | 38.1 | 100 | 66.67 | 26 |
| inbound/admin-http/routes/seo/get-entry-analyze.ts | 45.83 | 100 | 66.67 | 26 |
| inbound/admin-http/routes/system/observability-status.ts | 69.05 | 77.78 | 60 | 26 |
| inbound/admin-http/routes/database/restore-points.ts | 88.32 | 47.37 | 72.73 | 25 |
| inbound/admin-http/routes/forms/get-by-id.ts | 51.92 | 100 | 66.67 | 25 |
| inbound/admin-http/routes/integrations/delete.ts | 59.68 | 100 | 66.67 | 25 |
Full table: raw/route-coverage-per-file.json (213/333 under 100% lines). classify-coverage-gaps.ts could not run (needs development/coverage/lcov.unit.info from test:cov:server tiers; not produced) — NOT RUN.
### Jini per-package coverage (lines/branches/functions %)
| pkg | L | B | F |
|---|---|---|---|
| admin | 99.91 | 99.92 | 99.95 |
| agent-plugins | 99.32 | 99.65 | 99.72 |
| agent-runtime | 99.89 | 99.48 | 99.7 |
| agentic | 100 | 100 | 100 |
| analytics | 100 | 99.05 | 97.84 |
| capability-providers | 100 | 100 | 100 |
| chat | 100 | 99.7 | 100 |
| cli | 100 | 100 | 100 |
| cms | 99.97 | 99.75 | 100 |
| commerce | 4.01 | 39.7 | 39.7 |
| cookie-consent | 99.79 | 99.88 | 99.37 |
| core | 99.01 | 99.59 | 99.64 |
| daemon | 99.89 | 99.17 | 99.31 |
| db | 99.55 | 99.21 | 98.52 |
| desktop-host | 99.91 | 99.3 | 100 |
| devops | 100 | 100 | 100 |
| diagnostics | 94.74 | 98.92 | 98.1 |
| http-kit | 100 | 99.19 | 100 |
| infra | 100 | 99.01 | 100 |
| integrations | 99.98 | 99.92 | 99.82 |
| mcp | 99.88 | 99.33 | 100 |
| memory | 100 | 100 | 100 |
| oauth | 100 | 99.89 | 100 |
| platform | 99.97 | 99.73 | 99.64 |
| protocol | 100 | 98.8 | 100 |
| registry | 100 | 100 | 100 |
| sandbox | 99.78 | 98.59 | 100 |
| search | 100 | 100 | 100 |
| server | 99.73 | 97.96 | 94.19 |
| sidecar | 100 | 100 | 100 |
| sqlite | 100 | 100 | 100 |
| ui-kit | 96.68 | 99.83 | 99.28 |
| ui | 99.8 | 99.99 | 99.93 |
| user-management | 100 | 100 | 100 |
| vibecoding | 96.41 | 92.09 | 91.61 |
Notable: commerce 4.0/39.7/39.7 (60 files at ~0), vibecoding 96.4/92.1/91.6, ui-kit 96.7, diagnostics 94.7, server F94.19 (threshold 100). Thresholds failing: agent-runtime (B99.48<99.9, F99.7<100), server.
### Jini files under 100 (193 files; top 40 by uncovered lines; all in raw/jini-files-under-100.json)
| file | L | B | F |
|---|---|---|---|
| packages/commerce/src/payments/ledger/rows.ts | 0 | 100 | 100 |
| packages/commerce/src/payments/ledger/repo.memory.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ledger/repo.sql.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/accounting/apply-evidence.ts | 0 | 0 | 0 |
| packages/commerce/src/catalog/repo.ts | 0 | 0 | 0 |
| packages/commerce/src/catalog/repo.rows.ts | 0 | 0 | 0 |
| packages/diagnostics/src/web-evidence/__tests__/web-evidence-playwright.port-check.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/accounting/plan-evidence.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ledger/migrations/0001_payments_ledger.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ingest/worker.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/common.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/capture-void.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/intent.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/refund.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/tools/money-tools.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/testkit/lipay-fake.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/reconciler.ts | 0 | 0 | 0 |
| packages/commerce/src/catalog/checkout.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/tools/catalog.ts | 0 | 100 | 100 |
| packages/ui/scripts/generate-agent-icon-data-uris.mjs | 0 | 0 | 0 |
| packages/commerce/src/payments/state/status.ts | 0 | 100 | 100 |
| packages/commerce/src/payments/testkit/provider-conformance.ts | 0 | 0 | 0 |
| packages/commerce/src/http/payments-webhook.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/plugin-contribution.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ingest/receive.ts | 0 | 0 | 0 |
| packages/commerce/src/money/money.ts | 0 | 100 | 100 |
| packages/commerce/src/payments/provider-module-guard.ts | 0 | 100 | 100 |
| packages/commerce/src/payments/ops/operator.ts | 0 | 0 | 0 |
| packages/commerce/src/catalog/status.ts | 0 | 100 | 100 |
| packages/core/src/args-convention.typecheck.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/contract/risk.ts | 0 | 100 | 100 |
| packages/vibecoding/src/node/project.ts | 85.96 | 84.86 | 73.46 |
| packages/commerce/src/payments/ops/reconcile-attempts.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/ops/grants.ts | 0 | 100 | 100 |
| packages/commerce/src/payments/ledger/migrations/0002_payments_operator_actions.ts | 0 | 0 | 0 |
| packages/commerce/src/payments/tools/input.ts | 0 | 0 | 0 |
| packages/commerce/src/catalog/storefront.ts | 0 | 100 | 100 |
| packages/ui-kit/scripts/headless-smoke.mjs | 0 | 0 | 0 |
| packages/commerce/src/payments/provider-registry.ts | 0 | 100 | 100 |
| packages/commerce/src/catalog/errors.ts | 0 | 100 | 100 |

## §3 Complexity
Tovu counts above (raw/tovu-complexity.json). Concentration: apps/website 791 msgs, admin 318, desktop 97, content/agent-plugins 58. Expected ~0 was NOT met for the full sonarjs set, but the two hard rules are complexity=5 and cognitive-complexity=6. Jini: raw/jini-complexity.error.log — eslint aborts, a flat-config object sets sonarjs/cognitive-complexity (via --rule) for files whose config lacks the sonarjs plugin (likely packages/cms/forms or a non-TS glob match); NOT MEASURED.

## §4 Architecture
check:boundaries 167 errors / 528 warnings (695 total, 5534 modules). check-architecture: propagation cost 15.98% (runtime 3.19%), back-edges to root 0, module cycles 28 (all listed as new vs baseline, e.g. assistant<->features/agent-plugins, features/*<->platform), largest runtime SCC 38 modules, API surface 817 (was 393), deep-import edges 2584. madge: website 111 cycles (largest component 61 files around contracts/core/tool-metadata/*), admin 176 and desktop 169 (largest component 75 files, centred on website/src/assistant/* and features/agent-plugins/*, pulled in via admin/desktop importing website sources). Raw: raw/madge-*.json, raw/tov-arch.log, raw/tov-bound.log.

## §5 NOT RUN / caveats
- classify-coverage-gaps.ts (needs test:cov:server unit/integration tiers); check-route-coverage-diff not run.
- s00 and s04 shards timed out at 3000 s (partial TAP only, no lcov); s05-s07 were killed by a worker restart at ~min 123 and rerun (2700 s each).
- Playwright/e2e not run; Chromium symlinks made but no test needed it.
- Tovu coverage depressed by the 0036 bootstrap failure; Jini complexity unmeasured; Jini per-package tests ran with --maxWorkers=2.
- Admin first pass failures were ENV (peer deps); the table reports the rerun.
