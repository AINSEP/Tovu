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
