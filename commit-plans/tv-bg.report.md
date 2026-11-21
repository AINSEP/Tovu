DONE in the working tree: **T-B05, T-IMPORT-ABORT, B02-R, T-ANALYTICS-HOOKS, M5-T-SPLIT, M5-T**.

SKIPPED: **T-ANALYTICS-CONSENT**, ND-2 = NO.

Tests were written before bug fixes; execution and red/green confirmation remain with cloud. No commits or pushes: `.git` remained read-only. [COMMIT-PLAN.md](SCR/c-tv-bg/COMMIT-PLAN.md) records mutations, ledger expectations, deletions, and the split-only patch for its separate commit.

Files touched below use `W = apps/website/src`, `R = W/server/runtime/composition`:

```text
COMMIT-PLAN.md
W/assistant/tool-search-keywords.ts
W/cli/commands/deploy-config.ts
W/features/analytics/jini-adapters.ts
W/features/custom-credentials/tool-registrations.ts
W/features/deployments/deploy-ops/registry.ts
W/features/deployments/index.ts
W/features/site-backup/__tests__/integration/import-creates-new-site.integration.test.ts
W/platform/site-dir/init-site.ts
W/server/inbound/assistant/assistant-runtime-guidance.ts
W/server/inbound/public-http/middleware/site-cookie-consent.ts
W/server/inbound/public-http/middleware/__tests__/declared-consent.unit.test.ts
W/server/inbound/public-http/routes/site/analytics-ingest.ts
W/server/inbound/public-http/routes/site/__tests__/analytics-ingest.test.ts
R/analytics-providers.ts
R/browser-analytics-http.ts
R/browser-diagnostics.ts
R/__tests__/analytics-providers.unit.test.ts
R/__tests__/browser-analytics-http.unit.test.ts
R/__tests__/browser-diagnostics.unit.test.ts
R/site-deps/__tests__/identity-settings.characterization.unit.test.ts
```

REFRESH.md entries: none.

Chrome checks remain owed for M5-T and 1383. Choices unspecified by the cull: bridge/module exports use data constants; enablement uses two meaningful argument bags. The collector brief was retrieved read-only from the original local repository.
