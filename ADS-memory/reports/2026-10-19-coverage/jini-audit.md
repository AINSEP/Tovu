# Jini coverage audit 2026-10-19

Real-code totals: lines% = covered/total over loaded real-code files plus never-loaded real files counted as 0 covered (denominator = non-blank/non-comment source lines). branches% = loaded files only.

| package | files | real | never-loaded real | zero real | real lines% | real branches% | type-only |
|---|---|---|---|---|---|---|---|
| admin | 368 | 331 | 0 | 24 | 96.4 | 92.7 | 37 |
| agent-plugins | 34 | 32 | 0 | 0 | 95.7 | 91.7 | 2 |
| agent-runtime | 134 | 128 | 0 | 8 | 95.7 | 95.2 | 6 |
| agentic | 48 | 44 | 0 | 1 | 99.6 | 95.6 | 4 |
| analytics | 6 | 5 | 0 | 0 | 98.2 | 98.9 | 1 |
| artifacts | 10 | 10 | 0 | 0 | 100.0 | 100.0 | 0 |
| capability-providers | 24 | 18 | 0 | 0 | 97.2 | 94.2 | 6 |
| charts-recharts | 9 | 9 | 0 | 0 | 100.0 | 89.0 | 0 |
| chat | 203 | 187 | 0 | 14 | 89.0 | 94.6 | 16 |
| cli | 16 | 16 | 0 | 0 | 100.0 | 99.1 | 0 |
| cms | 251 | 229 | 0 | 22 | 85.4 | 91.5 | 22 |
| commerce | 28 | 23 | 0 | 20 | 9.0 | 45.5 | 5 |
| core | 97 | 86 | 0 | 2 | 88.5 | 93.9 | 11 |
| daemon | 100 | 97 | 0 | 0 | 97.5 | 96.3 | 3 |
| db | 89 | 79 | 0 | 16 | 76.7 | 88.8 | 10 |
| desktop-host | 65 | 62 | 0 | 0 | 98.8 | 96.0 | 3 |
| devops | 53 | 46 | 0 | 0 | 97.9 | 89.8 | 7 |
| diagnostics | 34 | 30 | 0 | 0 | 98.6 | 93.9 | 4 |
| http-kit | 24 | 23 | 0 | 0 | 99.5 | 99.6 | 1 |
| infra | 11 | 9 | 0 | 0 | 100.0 | 100.0 | 2 |
| integrations | 57 | 52 | 0 | 0 | 98.9 | 96.0 | 5 |
| mcp | 53 | 50 | 0 | 0 | 98.9 | 96.0 | 3 |
| memory | 8 | 8 | 0 | 0 | 100.0 | 99.8 | 0 |
| oauth | 29 | 27 | 0 | 0 | 97.7 | 93.7 | 2 |
| platform | 79 | 71 | 0 | 3 | 97.6 | 93.5 | 8 |
| plugins | 44 | 41 | 0 | 7 | 91.0 | 87.5 | 3 |
| protocol | 11 | 6 | 0 | 0 | 100.0 | 100.0 | 5 |
| registry | 15 | 12 | 0 | 0 | 99.7 | 99.2 | 3 |
| sandbox | 12 | 10 | 0 | 0 | 98.8 | 97.4 | 2 |
| server | 16 | 16 | 0 | 1 | 97.8 | 98.6 | 0 |
| sidecar | 13 | 12 | 0 | 0 | 98.7 | 95.8 | 1 |
| sqlite | 1 | 1 | 0 | 0 | 100.0 | - | 0 |
| ui | 684 | 624 | 0 | 4 | 98.9 | 97.8 | 60 |
| ui-kit | 25 | 23 | 0 | 1 | 98.8 | 92.8 | 2 |
| user-management | 91 | 86 | 0 | 1 | 93.7 | 88.4 | 5 |
| vibecoding | 17 | 15 | 0 | 0 | 99.5 | 96.2 | 2 |

## Top 30 untested real-code files by size (non-blank source lines)

| lines | status | package | file |
|---|---|---|---|
| 762 | zero | commerce | src/payments/lipay-plugin.ts |
| 294 | zero | commerce | src/payments/providers/lipay-gateway.ts |
| 282 | zero | chat | src/store/runtime/durable-run-store.ts |
| 266 | zero | commerce | src/catalog/repo.ts |
| 230 | zero | agent-runtime | src/skills/chat-motion-overlay/assets/remotion-template/src/components/BubbleScene.tsx |
| 180 | zero | chat | src/store/runtime/run-ledger.ts |
| 180 | zero | commerce | src/catalog/repo.rows.ts |
| 161 | zero | cms | src/taxonomy/repo.memory.ts |
| 160 | zero | db | src/recovery/recovery-orchestrator.ts |
| 150 | zero | cms | src/taxonomy/agent-tools.ts |
| 100 | zero | cms | src/taxonomy/index.ts |
| 92 | zero | commerce | src/store/store-plugin.ts |
| 82 | zero | admin | src/seo/messages.en.ts |
| 76 | zero | chat | src/core/assistant-client/a2ui-action-poster.ts |
| 76 | zero | cms | src/comments/module.ts |
| 75 | zero | commerce | src/catalog/checkout.ts |
| 72 | zero | db | src/recovery/restore-point-create.ts |
| 69 | zero | db | src/recovery/degraded-banners.ts |
| 63 | zero | db | src/recovery/migrate-forward-execute.ts |
| 60 | zero | chat | src/core/assistant-client/attachment-liveness.ts |
| 56 | zero | plugins | src/host/sql/repo.ts |
| 54 | zero | commerce | src/http/payments-webhook.ts |
| 54 | zero | commerce | src/payments/credentials.ts |
| 53 | zero | cms | src/workspace/tool-registrations.ts |
| 52 | zero | commerce | src/catalog/webhook-inbox.ts |
| 51 | zero | chat | src/store/runtime/chat-expiry-sweep.ts |
| 51 | zero | commerce | src/catalog/status.ts |
| 50 | zero | cms | src/workspace/agent-tools.ts |
| 50 | zero | core | src/args-convention.typecheck.ts |
| 44 | zero | commerce | src/payments/state-machine.ts |

Total untested real-code files: 124

## Notes
- Coverage run with `--coverage.include='src/**/*.{ts,tsx}'`, so vitest v8 (`all` mode) reports unloaded files at 0%; zero packages have files missing from the report (never-loaded = 0 in every package, 124 real-code files at 0%). Failing-test runs used added `--coverage.reportOnFailure=true` and `--coverage.thresholds.*=0` (otherwise no report written / exit code 1 from package thresholds). memory, sandbox, sidecar exited 1 only from their own global 100% thresholds; their tests passed.
- Type-only detection: typescript.transpileModule yields no runtime statements. Commerce is the outlier: 20 of 23 real files at 0% (only 4 tests).
- Full logs: jini/<pkg>.log; reports: jini/<pkg>/coverage-summary.json.

## Packages with failing tests
| package | failing | first assertion |
|---|---|---|
| sqlite | 1/8 | src/__tests__/loads-without-driver.test.ts "packed old root loads without any driver..." AssertionError: node:internal/modules/run_main:105 (child node process crashed) |
| cli | 1/336 | core-redaction-migration.test.ts "keeps bounded text and recursive JSON output byte-identical": expected 'password=[redacted] alice@example.com…' to be '[redacted] alice@example.com 192.0.2.1' |
| platform | 1/1140 | source-boundaries.test.ts "platform source never references host source paths or aliases": expected [ Array(1) ] to deeply equal [] |
| user-management | 2/451 | users/__tests__/account-protections.ported.test.tsx "Roles header explains all four built-in roles on hover/focus": expected [ Array(1) ] to deeply equal [ …(4) ] |
| chat | 8/2294 | store/__tests__/loads-without-driver.test.ts (4 tests, +4 more): expected 'node:internal/modules/run_main:105 ...' to be '' (child node crash, same as sqlite) |
| cms | 3/2477 | identity-extraction.boundary.test.ts, integration-package.contract.test.ts: dependencies object (@jini-ai/core, dompurify, ...) != { '@jini-ai/core': 'workspace:^' }; subpath-isolation.contract.test.ts: expected [ …(2) ] to deeply equal [] |
