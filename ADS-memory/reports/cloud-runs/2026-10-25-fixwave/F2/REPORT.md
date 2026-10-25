# F2 — Jini data (L2) + Jini runtime/infra (L9) fix wave — REPORT (in progress)

## RUN LOG
## 2026-10-25T21:34Z — STARTED
Jini code branch `cloud/fixwave-1025-F2` from origin/cloud/overnight-1024-jini @ 3e2fbae8. Read BRIEF.md, RUN-PROTOCOL.md, COMMON.md, TEST-ANTIPATTERNS.md, L2 + L9 REPORT.md. Plan: protocol (registry.ts, delegated-result.ts) → sidecar (json-ipc stale-socket NOCOV, port, supervisor, daemon-registry) → L2 security/no-coverage (owner-store/service authorize guard, backup INVALID_BACKUP, plugins sql repo, trust-certificates) → L9 top-10 security guards (http-kit loopback, devops every/some, e2b path guard). Setup (Node 24, pnpm install + build) running.

## 2026-10-25T21:50Z — PROGRESS
- Setup OK (Node 24.22, pnpm install + `pnpm -r build`). Stryker 9 + vitest-runner installed out-of-tree at /root/stryker (no lockfile change in Jini).
- protocol: registry.ts 51.9→100 %, delegated-result.ts 74.7→95.4 % (4 equivalents left). run-context absent-key test added.
- sidecar: json-ipc 59.4→88.8, port 78.1→100, supervisor 82.2→91.6, daemon-registry 85.8→95.0 (first re-score; more tests added since).
- **SOURCE BUG** platform `createValidatingLookup` (asset-cache.ts:141): null/undefined entry in an `all:true` DNS answer threw TypeError instead of refusing. Red test 5719b6b2 → fix c65174ad.
- db owner-store: vault authorize guard deny tests + 37-case malformed-backup table.
- plugins `host/sql/repo*.ts` "0 %" in L2 is a Stryker-sandbox artifact: the contract test resolves `../../../../../db/package.json` relatively, which breaks in `.stryker-tmp`. Locally it is 100 % lines/branches (10 tests). Not a test gap.
- http-kit: loopback peer/origin look-alike tables, strict bearer gate tests.

## 2026-10-25T22:09Z — PROGRESS (re-scored so far; Stryker 9, vitest runner, perTest, StringLiteral excluded, ignoreStatic OFF, mutate = touched files only)
| file | before (lane) | after |
|---|---|---|
| protocol/registry.ts | 51.9 | 100.0 |
| protocol/delegated-result.ts | 74.7 | 95.4 (4 equivalent) |
| protocol/run-context.ts | 93.3 | 97.8 |
| sidecar/json-ipc.ts | 59.4 | 92.4 |
| sidecar/port.ts | 78.1 | 100.0 |
| sidecar/supervisor.ts | 82.2 | 92.1 (line 99 conjuncts equivalent: attemptSpawn re-checks the same guard) |
| sidecar/daemon-registry.ts | 85.8 | 95.0 |
| sandbox/node-worker.ts | 85.8 | 97.2 |
| sandbox/e2b/wrap-e2b-sandbox.ts | (10 surv) | 95.8 (path-escape guard fully killed) |
| http-kit/local-daemon-request.ts | 87.8 | 92.6 |
| http-kit/api-security-middleware.ts | 91.0 | 95.5 |
| http-kit/verified-origin/origin.ts | 89.8 | 95.8 |
| http-kit/verified-origin/configured-origin.ts | 87.7 | 96.3 |
| devops/checks/coverage/floors.ts | 79.2 | 100.0 |
| devops/checks/coverage/lcov.ts | 75.8 | 94.9 |
| devops/deploy/node.ts | 75.4 | 77.2 (remaining = equivalent: platform lookup refuses non-string/non-public entries first; dispatcher close flags) |
| devops/dns/node/wire.ts | 87.8 | 94.9 |
| agentic/core/site-guide/topic-schema.ts | 88.6 | 98.3 |
| agentic/skills/install/install-service.ts | 88.4 | 94.8 |
| core/origin-validation.ts | 96.6 | 98.0 |
| core/approval.ts | 91.1 | 92.5 |
| core/settings/write-service.ts | 88.8 | 91.0 (before clear()-partition tests; re-run pending) |
Notes: server/feature.ts 14 "capability flag" survivors are EQUIVALENT — the `true` values are never read (`isCapabilityId` uses hasOwnProperty); pinned the vocabulary anyway. L2 "plugins host/sql 0 %" is a sandbox-path artifact (relative `../db/package.json`), 100 % locally.
