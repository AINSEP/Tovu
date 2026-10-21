# All-files coverage

| Metric | TRUE: all files | RUNNER: records only |
| --- | --- | --- |
| lines | 4751/4965 (95.69%) | 4751/4957 (95.84%) |
| branches | 2079/2127 (97.74%) | 2079/2127 (97.74%) |
| functions | 437/455 (96.04%) | 437/453 (96.47%) |

Never-loaded files: **1** / 88

- NEVER-LOADED denominators are AST estimates (distinct executable statement start lines, function bodies, branch arms).
- LCOV lacks columns: functions/branches merge by source line and ordinal; different instrumentation layouts may not correspond.
- LOADED means a coverage record exists, including zero-hit include records.

## Exclusions (first matching group)

| Group | Files | Up to 5 examples |
| --- | ---: | --- |
| non-source | 1 | packages/core/src/__tests__/__snapshots__/origin-validation.characterization.test.ts.snap |
| dependencies/build/output | 0 |  |
| test/fixture | 91 | packages/core/src/__tests__/api-token-auth.test.ts, packages/core/src/__tests__/approval.characterization.test.ts, packages/core/src/__tests__/approval.test.ts, packages/core/src/__tests__/args-convention.test.ts, packages/core/src/__tests__/batch-approval.test.ts |
| declaration | 0 |  |
| generated | 0 |  |
| type-only | 13 | packages/core/src/agent-tools.ts, packages/core/src/fetch/types.ts, packages/core/src/gated-mutations/ports.ts, packages/core/src/native-regexp.ts, packages/core/src/primitives/http.ts |

## Packages / top-level areas

| Area | Files | Never loaded | Lines | Branches | Functions |
| --- | ---: | ---: | --- | --- | --- |
| packages/core | 88 | 1 | 4751/4965 (95.69%) | 2079/2127 (97.74%) | 437/455 (96.04%) |

## Files (largest uncovered line gap first)

| File | Status | Uncovered lines | Lines | Branches | Functions |
| --- | --- | ---: | --- | --- | --- |
| packages/core/src/primitives/sse.ts | LOADED | 75 | 1/76 (1.32%) | 0/0 (100.00%) | 0/4 (0.00%) |
| packages/core/src/args-convention.typecheck.ts | LOADED | 43 | 0/43 (0.00%) | 0/1 (0.00%) | 0/1 (0.00%) |
| packages/core/src/batch-tool-inputs.ts | LOADED | 35 | 105/140 (75.00%) | 40/54 (74.07%) | 10/13 (76.92%) |
| packages/core/src/settings/write-service.ts | LOADED | 15 | 586/601 (97.50%) | 161/170 (94.71%) | 18/18 (100.00%) |
| packages/core/src/model-facing-tool-errors.ts | LOADED | 11 | 56/67 (83.58%) | 23/23 (100.00%) | 6/8 (75.00%) |
| packages/core/src/compose.typecheck.ts | NEVER-LOADED | 8 | 0/8 (0.00%) | 0/0 (0.00%) | 0/2 (0.00%) |
| packages/core/src/target-scope.ts | LOADED | 8 | 45/53 (84.91%) | 39/39 (100.00%) | 4/5 (80.00%) |
| packages/core/src/tool-registry.ts | LOADED | 7 | 84/91 (92.31%) | 43/48 (89.58%) | 12/13 (92.31%) |
| packages/core/src/fetch/cache.ts | LOADED | 6 | 176/182 (96.70%) | 95/101 (94.06%) | 26/29 (89.66%) |
| packages/core/src/settings/repo.memory.ts | LOADED | 4 | 180/184 (97.83%) | 82/86 (95.35%) | 22/22 (100.00%) |
| packages/core/src/settings/errors.ts | LOADED | 2 | 25/27 (92.59%) | 2/2 (100.00%) | 2/3 (66.67%) |
| packages/core/src/api-token-auth.ts | LOADED | 0 | 15/15 (100.00%) | 10/10 (100.00%) | 4/4 (100.00%) |
| packages/core/src/approval.ts | LOADED | 0 | 152/152 (100.00%) | 115/115 (100.00%) | 31/31 (100.00%) |
| packages/core/src/bindings.ts | LOADED | 0 | 34/34 (100.00%) | 15/15 (100.00%) | 7/7 (100.00%) |
| packages/core/src/composition.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/contribution-registry.ts | LOADED | 0 | 11/11 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/core/src/daemon.ts | LOADED | 0 | 35/35 (100.00%) | 17/17 (100.00%) | 5/5 (100.00%) |
| packages/core/src/feature-flags.ts | LOADED | 0 | 10/10 (100.00%) | 8/8 (100.00%) | 1/1 (100.00%) |
| packages/core/src/fetch/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/gated-mutations.ts | LOADED | 0 | 4/4 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/gated-mutations/actor-identity.ts | LOADED | 0 | 28/28 (100.00%) | 9/9 (100.00%) | 2/2 (100.00%) |
| packages/core/src/gated-mutations/gateway.ts | LOADED | 0 | 110/110 (100.00%) | 40/40 (100.00%) | 11/11 (100.00%) |
| packages/core/src/gated-mutations/token.ts | LOADED | 0 | 66/66 (100.00%) | 37/37 (100.00%) | 13/13 (100.00%) |
| packages/core/src/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/naming.ts | LOADED | 0 | 27/27 (100.00%) | 19/19 (100.00%) | 3/3 (100.00%) |
| packages/core/src/origin-validation.ts | LOADED | 0 | 165/165 (100.00%) | 131/131 (100.00%) | 20/20 (100.00%) |
| packages/core/src/pack-lifecycle.ts | LOADED | 0 | 29/29 (100.00%) | 13/13 (100.00%) | 2/2 (100.00%) |
| packages/core/src/pack.ts | LOADED | 0 | 5/5 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/primitives/ids.ts | LOADED | 0 | 3/3 (100.00%) | 2/2 (100.00%) | 2/2 (100.00%) |
| packages/core/src/primitives/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/primitives/logger.ts | LOADED | 0 | 13/13 (100.00%) | 9/9 (100.00%) | 5/5 (100.00%) |
| packages/core/src/primitives/paths.ts | LOADED | 0 | 32/32 (100.00%) | 28/28 (100.00%) | 5/5 (100.00%) |
| packages/core/src/primitives/tasks.ts | LOADED | 0 | 4/4 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/primitives/time.ts | LOADED | 0 | 9/9 (100.00%) | 4/4 (100.00%) | 4/4 (100.00%) |
| packages/core/src/records.ts | LOADED | 0 | 19/19 (100.00%) | 12/12 (100.00%) | 5/5 (100.00%) |
| packages/core/src/redact.ts | LOADED | 0 | 160/160 (100.00%) | 68/68 (100.00%) | 11/11 (100.00%) |
| packages/core/src/registration-kit.ts | LOADED | 0 | 240/240 (100.00%) | 132/132 (100.00%) | 28/28 (100.00%) |
| packages/core/src/settings/agent-tools.ts | LOADED | 0 | 125/125 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/agent-value-write-tools.ts | LOADED | 0 | 145/145 (100.00%) | 118/118 (100.00%) | 17/17 (100.00%) |
| packages/core/src/settings/agent-writable-preferences.ts | LOADED | 0 | 56/56 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/agent-write-denylist.ts | LOADED | 0 | 8/8 (100.00%) | 4/4 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/change-feed.ts | LOADED | 0 | 29/29 (100.00%) | 14/14 (100.00%) | 2/2 (100.00%) |
| packages/core/src/settings/definitions-dispatch.ts | LOADED | 0 | 71/71 (100.00%) | 8/13 (61.54%) | 6/6 (100.00%) |
| packages/core/src/settings/dictionaries/index.ts | LOADED | 0 | 27/27 (100.00%) | 3/3 (100.00%) | 1/1 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ar.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.bn.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.de.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.es.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.fa.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.fr.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.hi.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.hu.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.id.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.it.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ja.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ko.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.pl.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.pt-BR.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ru.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.th.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.tr.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.uk.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.ur.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.zh-CN.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/dictionaries/settings-dialog.zh-TW.ts | LOADED | 0 | 25/25 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/ensure-definitions.ts | LOADED | 0 | 73/73 (100.00%) | 20/20 (100.00%) | 5/5 (100.00%) |
| packages/core/src/settings/express/cms-adapter.ts | LOADED | 0 | 115/115 (100.00%) | 55/55 (100.00%) | 17/17 (100.00%) |
| packages/core/src/settings/express/http-request.ts | LOADED | 0 | 37/37 (100.00%) | 21/21 (100.00%) | 4/4 (100.00%) |
| packages/core/src/settings/express/http.ts | LOADED | 0 | 130/130 (100.00%) | 120/120 (100.00%) | 23/23 (100.00%) |
| packages/core/src/settings/express/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/express/shared.ts | LOADED | 0 | 36/36 (100.00%) | 28/29 (96.55%) | 4/4 (100.00%) |
| packages/core/src/settings/express/stream.ts | LOADED | 0 | 109/109 (100.00%) | 87/87 (100.00%) | 12/12 (100.00%) |
| packages/core/src/settings/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/purge-service.ts | LOADED | 0 | 101/101 (100.00%) | 11/12 (91.67%) | 1/1 (100.00%) |
| packages/core/src/settings/settings.ts | LOADED | 0 | 168/168 (100.00%) | 101/101 (100.00%) | 19/19 (100.00%) |
| packages/core/src/settings/tool-registrations.ts | LOADED | 0 | 180/180 (100.00%) | 77/77 (100.00%) | 15/15 (100.00%) |
| packages/core/src/settings/types.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/settings/ui-tab-definitions.ts | LOADED | 0 | 61/61 (100.00%) | 2/2 (100.00%) | 1/1 (100.00%) |
| packages/core/src/surface-exchanges.ts | LOADED | 0 | 3/3 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/text/escape.ts | LOADED | 0 | 9/9 (100.00%) | 4/6 (66.67%) | 2/2 (100.00%) |
| packages/core/src/text/index.ts | LOADED | 0 | 1/1 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |
| packages/core/src/text/sanitize-untrusted-text.ts | LOADED | 0 | 72/72 (100.00%) | 54/54 (100.00%) | 9/9 (100.00%) |
| packages/core/src/token.ts | LOADED | 0 | 17/17 (100.00%) | 6/6 (100.00%) | 3/3 (100.00%) |
| packages/core/src/tool-input-errors.ts | LOADED | 0 | 7/7 (100.00%) | 1/1 (100.00%) | 1/1 (100.00%) |
| packages/core/src/tool-input-normalization.ts | LOADED | 0 | 142/142 (100.00%) | 136/136 (100.00%) | 20/20 (100.00%) |
| packages/core/src/tool-metadata.ts | LOADED | 0 | 45/45 (100.00%) | 37/37 (100.00%) | 3/3 (100.00%) |
| packages/core/src/tool-permissions.ts | LOADED | 0 | 21/21 (100.00%) | 6/6 (100.00%) | 4/4 (100.00%) |
| packages/core/src/tool-tokens.ts | LOADED | 0 | 2/2 (100.00%) | 0/0 (100.00%) | 0/0 (100.00%) |

## Full never-loaded list

- packages/core/src/compose.typecheck.ts

## Unmatched coverage records


## Coverage records excluded from denominator

- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/agent-tools.ts → packages/core/src/agent-tools.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/native-regexp.ts → packages/core/src/native-regexp.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/principal.ts → packages/core/src/principal.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/provider-catalog.ts → packages/core/src/provider-catalog.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/tool-metadata-types.ts → packages/core/src/tool-metadata-types.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/__tests__/fixtures/legacy-redactors.ts → packages/core/src/__tests__/fixtures/legacy-redactors.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/__tests__/fixtures/legacy-secret-shapes.ts → packages/core/src/__tests__/fixtures/legacy-secret-shapes.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/fetch/types.ts → packages/core/src/fetch/types.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/gated-mutations/ports.ts → packages/core/src/gated-mutations/ports.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/primitives/http.ts → packages/core/src/primitives/http.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/primitives/json.ts → packages/core/src/primitives/json.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/primitives/result.ts → packages/core/src/primitives/result.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/ports.ts → packages/core/src/settings/ports.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/principal-lookup.ts → packages/core/src/settings/principal-lookup.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/principal-lookup.typecheck.ts → packages/core/src/settings/__tests__/principal-lookup.typecheck.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/principal.fixture.ts → packages/core/src/settings/__tests__/principal.fixture.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/__tests__/write-tool-fixture.ts → packages/core/src/settings/__tests__/write-tool-fixture.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/express/contracts.ts → packages/core/src/settings/express/contracts.ts
- /tmp/cov-jcore/coverage-final.json: /home/user/Jini/packages/core/src/settings/express/__tests__/settings-fixture.ts → packages/core/src/settings/express/__tests__/settings-fixture.ts
