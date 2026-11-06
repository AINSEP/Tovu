# tests-tovu-site

Status: in progress. Started 2026-11-06 19:48 UTC; hard stop 21:48 UTC.

Branch: `cloud/tests-tovu-site` in both repositories. Bases: Tovu `b34b9cb7a`, Jini `3a41ec5b6` from `origin/cloud/combine`.
Loaded COMMON, job instructions, Software Architect, Programmer and TDD personas.

Rebuilding Jini and relinking Tovu before the full root/website test suite. Logs are under `/workspace/work/tests-tovu-site/`.
Assigned suites: `TEST_CONCURRENCY=2 npm run test:ci`, `npm run typecheck`, `npm run typecheck:tests`, `npm run complexity` in Tovu.

Investigating known metadata fixture drift, asset-only CLI export failures and mail descriptor/provider ID validation mismatch. No tests or quality checks will be skipped, weakened or disabled.

## Bugs found

Pending investigation.
