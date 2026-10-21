# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 171/174 (98.28%) | 171/173 (98.84%) |
| branches | 150/156 (96.15%) | 150/156 (96.15%) |
| functions | 61/65 (93.85%) | 61/65 (93.85%) |

Never-loaded files: **1** / 15

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| non-source | 2 | apps/admin/src/features/observability/QUERIES.md, apps/admin/src/features/observability/recent-errors.css |
| dependencies/build/output | 0 |  |
| test/fixture | 12 | apps/admin/src/features/observability/__tests__/Observability.unit.test.tsx, apps/admin/src/features/observability/__tests__/observability-i18n.unit.test.ts, apps/admin/src/features/observability/__tests__/observability-visuals.unit.test.tsx, apps/admin/src/features/observability/__tests__/queries-panel.unit.test.tsx, apps/admin/src/features/observability/__tests__/recent-errors-panel.unit.test.tsx |
| declaration | 0 |  |
| generated | 0 |  |
| type-only | 2 | apps/admin/src/features/observability/hooks/observability-status-port.hooks.ts, apps/admin/src/features/observability/hooks/recent-server-errors-port.hooks.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| apps/admin | 15 | 1 | 171/174 (98.28%) | 150/156 (96.15%) | 61/65 (93.85%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| apps/admin/src/features/observability/index.ts | NEVER-LOADED | 1 | 0/1 (0.00%) | 0/0 (0.00%) | 0/0 (0.00%) |
| apps/admin/src/features/observability/queries-panel.tsx | LOADED | 1 | 2/3 (66.67%) | 3/3 (100.00%) | 1/3 (33.33%) |
| apps/admin/src/features/observability/tool-gaps-panel.tsx | LOADED | 1 | 3/4 (75.00%) | 9/13 (69.23%) | 2/3 (66.67%) |
| apps/admin/src/features/observability/hooks/observability-status-dependencies.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 5/5 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/recent-server-errors-dependencies.hooks.ts | LOADED | 0 | 12/12 (100.00%) | 7/7 (100.00%) | 5/5 (100.00%) |
| apps/admin/src/features/observability/hooks/use-observability-status.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 4/4 (100.00%) | 3/4 (75.00%) |
| apps/admin/src/features/observability/hooks/use-observability-tab.hooks.ts | LOADED | 0 | 10/10 (100.00%) | 7/7 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-queries-tab.hooks.ts | LOADED | 0 | 5/5 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-error-item.hooks.ts | LOADED | 0 | 6/6 (100.00%) | 0/0 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/observability/hooks/use-recent-server-errors.hooks.ts | LOADED | 0 | 21/21 (100.00%) | 10/10 (100.00%) | 9/9 (100.00%) |
| apps/admin/src/features/observability/observability-i18n.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| apps/admin/src/features/observability/observability-visuals.tsx | LOADED | 0 | 8/8 (100.00%) | 7/7 (100.00%) | 7/7 (100.00%) |
| apps/admin/src/features/observability/Observability.tsx | LOADED | 0 | 12/12 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| apps/admin/src/features/observability/recent-errors-panel.tsx | LOADED | 0 | 9/9 (100.00%) | 36/37 (97.30%) | 6/6 (100.00%) |
| apps/admin/src/features/observability/recent-errors-rules.ts | LOADED | 0 | 66/66 (100.00%) | 35/36 (97.22%) | 11/11 (100.00%) |

## Full never-loaded list

- apps/admin/src/features/observability/index.ts

## Unmatched coverage records

- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/fetch-query-provider.test-helper.tsx
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/__tests__/fetch-query-render.tsx
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/apply.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/registry.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/use-admin-theme.hooks.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/admin-themes/classic/manifest.json
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/hooks/admin-locale-dependencies.hooks.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/hooks/use-admin-appearance-snapshot.hooks.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/hooks/use-admin-locale.hooks.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/admin-boot-scope.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/admin-dev-origin.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/api.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/i18n-common.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/ledger-slice.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/page-lifecycle.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/router.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/server-reconnect.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/settings-effective-reads.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/settings-refresh-bus.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/settings-tabs.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/site-url.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/fetch-query/adapter-context.ts
- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/lib/fetch-query/provider.tsx

## Coverage records excluded from denominator

- /tmp/cov-admin-obs/coverage-final.json: /home/user/Tovu/apps/admin/src/features/observability/recent-errors.css → apps/admin/src/features/observability/recent-errors.css
