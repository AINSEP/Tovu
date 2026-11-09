# Digest: jini-tests-J1

Run valid (second run, after the runner-flag fix). All 19 packages finished with exit 0; no timeouts.

| suite/package | exit | files pass/fail | tests pass/fail/skip | secs |
|---|---|---|---|---|
| ui | 0 | 653/0 | 8915/0/0 | 405 |
| cms | 0 | 327/0 | 3968/0/0 | 124 |
| core | 0 | 115/0 | 1857/0/0 | 32 |
| mcp | 0 | 90/0 | 1559/0/0 | 31 |
| integrations | 0 | 88/0 | 1981/0/0 | 25 |
| commerce (3 parts) | 0 | p2: 3/0; p3: 71 pass, 1 skipped | p1 node:test 52/0/0; p2 10/0/0; p3 1408/0/1 | 48 |
| plugins | 0 | 57/0 | 776/0/0 | 29 |
| vibecoding | 0 | 22/0 | 360/0/0 | 14 |
| search | 0 | 12/0 | 320/0/0 | 4 |
| sidecar | 0 | 17/0 | 245/0/2 | 7 |
| sqlite | 0 | 4/0 | 9/0/0 | 24 |
| registry | 0 | 19/0 | 355/0/0 | 8 |
| protocol | 0 | 10/0 | 106/0/0 | 3 |
| analytics | 0 | 14/0 | 197/0/0 | 5 |
| artifacts | 0 | 14/0 | 204/0/0 | 4 |
| infra | 0 | 14/0 | 144/0/0 | 7 |
| plugin-catalog | 0 | 1/0 | 65/0/0 | 2 |
| plugin-fixture-provider | 0 | 1/0 | 2/0/0 | 3 |
| memory | 0 | 15/0 | 332/0/0 | 5 |

Totals: 22865 tests passed, 0 failed, 3 skipped (commerce counts its 3 parts together).

## 2. Failing tests
None.

## 3. Type/lint errors
None (this lane runs tests only; no tsc/lint).

## 4. Classification
Nothing to classify. Noisy-but-passing log lines (expected, from tests exercising error paths): jsdom "Not implemented: navigation/window.open" in ui; deliberate error logs in cms (forms outbox/notify), mcp (corrupted JSON, federation timeout).

## 5. Did not run
- commerce: `src/payments/ledger/__tests__/postgres.vitest.test.ts` (1 test) skipped by design (`describe.skip` unless `COMMERCE_PG_URL` names a disposable Postgres) - environment.
- sidecar: 2 tests skipped in `src/__tests__/index.test.ts` via `it.skipIf(isRoot)` (chmod-based permission tests; box runs as root) - environment.
- Nothing timed out or was killed.
- Other jini-test-*.txt files in the raw dir (admin, chat, daemon, agent-runtime, sandbox, etc.) belong to other lanes and are not covered here.
