# Failing tests (v3) — HEAD Tovu 90ed13f60, Jini f2d86eaf3

## Counts (vs v2)
- Jini vitest: 1 failing (NEW 1, ENV-suspect 1); v2 58 -> FIXED 58
- admin vitest: 0 failing; v2 10 -> FIXED 10 (create-site-admin-password.unit.test.tsx now passes)
- desktop node:test: 2 failing (both ENV: missing Playwright chromium, STILL); v2 8 -> FIXED 6
- website/plugins/packages/site-chat node:test: 126 failing entries (105 fail + 19 cancelled + file-level entries) vs v2 225
  - non-ENV: 3 (STILL 2 known credential, NEW 1); ENV: 123 (Postgres-only/psql 119, chromium 3, pg-fixture unit 1)
  - v2 non-ENV 103: FIXED 100, STILL 3 (2 credential + pg-fixture.unit psql-wrapped DROP, ENV)
  - No IPv6 failures this run.

## NEW (non-ENV)
- [NEW] website apps/website/src/server/inbound/assistant/__tests__/agent-daemon-server.attachment-binding.unit.test.ts :: Claude Local-CLI claiming and delegated discovery share the actual accepted-message binding :: AssertionError: the discovered opaque ref must pass the video tool's actual owner-scoped reader (false !== true) — deterministic (re-ran alone, fails)
- [NEW, likely ENV (running as root)] jini packages/plugins/src/host/__tests__/unit/install.unit.test.ts :: install lock and helpers lock creation rethrows faults other than EEXIST :: Error: promise resolved "{ warnings: [], …(13) }" instead of rejecting

## STILL (non-ENV, known/expected — owner security decision pending)
- [STILL] website features/identity/__tests__/default-credential-exposure.test.ts :: REGRESSION: the shipped admin UI source does not contain the seeded default password :: AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal
- [STILL] website features/identity/__tests__/default-credential-exposure.test.ts :: the credential checker CLI succeeds when invoked as the entry point :: AssertionError: check:default-credential — the seeded default password appears in ...
- create-site-admin-password.unit.test.tsx: PASSES now (not failing).

## ENV (separately)
- Postgres-only (no server, ECONNREFUSED/psql failed): *.postgres.test.ts in website — database-transfer (copy-engine, tool-registrations), entries/navigation repo.compare-and-set, kernel ops/postgres-pool-error, form-delivery-repo, resolve-workspace, init-site, init-storage, storage-move, move-site-storage, seed-content-store, migrations runner, forms/post repo, site-key-dependent-data, unreadable-owner-entries-repair, vault-read-parity (19 cancelled); plus pg-fixture.unit.test.ts (4) and postgres-baseline.test.ts (1, STILL ENV in v2).
- Missing Playwright chromium: desktop src/renderer/websites-width.test.ts (2); website render-form-layout.test.ts (3).
- IPv6 unavailable: createLocalNodeDaemon IPv6-loopback test is now SKIPPED (not failing; was a v2 STILL failure).
