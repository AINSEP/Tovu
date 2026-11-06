# Commerce cloud job — 2026-11-05

Status: PARTIAL, blocked by execution-environment loss. Stages 2–5 feature work and focused verification were committed and pushed. The final Jini-first relocation of reusable worker/drain logic was written locally but remains uncommitted and unverified. Do not treat that relocation as delivered.

Instructions used: Jini `origin/cloud-plans-1105:cloud/jobs/COMMON.md`, `cloud/jobs/commerce.md`, `cloud/plans/C-commerce-plan-result.md`, and `cloud/plans/TRIM.md`. The commerce job explicitly authorizes stages 2–5 and overrides the trim hold. Exact bases: Jini `6f507852d`, Tovu `e327c07c8`. Only `cloud/commerce` was pushed in either repository. No main push, force-push, merge, deployment, npm publication, live payment, or owner-data operation occurred.

The shell disconnected around 11:41 AM PST. `exec_command` then reported “No usable execution environment is available”; `wait_for_environment` reported that the environment was neither ready nor starting. The managed status endpoint still reported running/connected, which did not restore shell access. Reports were therefore saved through the GitHub contents API on the already-authorized branches. The two-hour hard stop is 12:48 PM PST (20:48 UTC).

Delivered behavior:

- Durable credential-free intent dispatch snapshots, original provider idempotency/correlation keys and callback URLs, atomic concurrent recovery claims, at most three recovery attempts, and provider-defined replay retention (Stripe: 23 hours). Recovery completion and evidence application commit atomically. Legacy rows without a snapshot remain visibly unresolved; provider extras and snapshots above 16 KiB are not eligible for automatic replay.
- Dormant `@jini-ai/agent-plugins/commerce` payload and Node server subpath, with no Stripe-plugin import. Existing provider leases, sealed settings and versioned activation readers are reused. Catalog setup/status tools use existing authorization.
- Activation-only eight-table catalog migration through the existing ADR-066 runner, with its own migration history. New indexes coexist with archived index identities; money columns use BIGINT for safe numeric parity. Historical migration checksums and legacy rows are preserved.
- Authenticated pending-order creation and payment/resume of the same owned order. Workspace/member/account/mode and return URLs are host-controlled. Purchase requests must originate at the configured deployed shop; desktop product views link there. Return/cancel pages read ledger truth.
- Raw signed webhooks before JSON parsing, durable inbox/outbox processing and idempotent order projection. One database owner schedules settlement; native PostgreSQL uses a dedicated session lock with liveness checks, while local stores use the existing owner lock. Disable stops new purchases and retains settlement drain, including restart and late-webhook wake-up.
- A bounded two-query storefront (at most 24 product/price summaries), currency-aware display, and a small shared checkout script. Double submission, uncertain outcomes and reloads retain the order ID. Unavailable/definitively failed orders offer an explicit new-order action; no automatic fresh charge follows a timeout or 5xx.
- Legacy store/payment executable modules and the demo store route moved intact into test fixtures. All test assertions remain; historical manifests and namespace/portability declarations remain in production.

Verification completed before the uncommitted relocation:

| Check | Result |
| --- | --- |
| Jini full recursive workspace build after repairing installed dependencies | PASS |
| Subsequent commerce build, agent-plugins typecheck, DB build/typecheck | PASS |
| Affected commerce payments tests | 436/436 PASS |
| Real PostgreSQL recovery plus memory/SQLite cases | 22/22 PASS, including 7 PostgreSQL cases |
| Stripe kernel/provider/currency tests | 85/85 PASS |
| Catalog/server/setup/status/origin tests | 53 PASS |
| Checkout browser tests | 18 PASS |
| Storefront projection/mapping/money tests | 16 + 12 + 6 PASS |
| Plugin isolation / manifest validation / payload dry run | 2 PASS / 1 PASS / four payload files, zero test files |
| Tovu purchase + signed settlement HTTP tests | 10/10 PASS across SQLite, PGlite and PostgreSQL 17 |
| Actual host activation/restart/merchant-transition integration | 2/2 PASS across SQLite/PGlite |
| Additional host/provider/worker/settings/drain/origin tests | 66 PASS |
| Catalog migration, archive coexistence and >int32 money | 3/3 PASS across SQLite/PGlite/PostgreSQL |
| Migration checksum tests | 4/4 PASS |
| Tool-catalog integration / purchase markup gates | 2 PASS / 5 PASS |
| Retired plugin and route tests | Five plugin test files PASS; 8 route tests PASS |
| Changed production function complexity/cognitive complexity <=10 | PASS |
| Full Tovu TypeScript check | FAIL only at unchanged publish-credentials/store.ts:410 |

No tests, rules or checks were disabled, skipped, deleted or weakened to produce these results. Updated product fixtures use the new catalog adapter; retired-runtime tests use the unchanged moved fixture implementations.

Principal commands (run in the container; PostgreSQL was disposable and local):

```sh
# Initial user command, then explicit tracking ref because the checkout's fetch refspec is narrow.
git -C /workspace/Jini fetch origin cloud-plans-1105
git -C /workspace/Jini fetch origin cloud-plans-1105:refs/remotes/origin/cloud-plans-1105
git -C /workspace/Jini show origin/cloud-plans-1105:cloud/jobs/COMMON.md
git -C /workspace/Jini show origin/cloud-plans-1105:cloud/jobs/commerce.md

# Setup scripts specified by COMMON were absent. Installed snapshot links were incomplete.
# pnpm 10.33.2 was installed in a workspace-local npm cache; pnpm 11 is incompatible.
# The pnpm store was copied to /workspace/work/pnpm-store because the default store is read-only.
cd /workspace/Jini
CI=true PATH=/workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin:$PATH pnpm --store-dir /workspace/work/pnpm-store --cache-dir /workspace/work/pnpm-cache install --ignore-scripts --no-frozen-lockfile --fetch-retries=0
PATH=/workspace/work/npm-cache/_npx/ed17c428e728397e/node_modules/.bin:$PATH pnpm -r --workspace-concurrency=2 --if-present run build
npm --prefix packages/commerce run build

cd /workspace/Tovu
JINI_PACKAGES_DIR=/workspace/Jini/packages npm run link:jini
npm --cache /workspace/work/npm-cache run agent-plugins:compose
npm --prefix packages/contracts run build
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
COMMERCE_PG_URL=postgres://postgres@127.0.0.1:55432/commerce_test node --import tsx --test apps/website/src/server/inbound/public-http/routes/commerce/__tests__/purchase.integration.test.ts apps/website/src/server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts

cd /workspace/Jini/packages/commerce
./node_modules/.bin/vitest run -c vitest.kernel.config.ts src/payments/ledger/__tests__/migrations.vitest.test.ts src/payments/ledger/__tests__/rows.vitest.test.ts src/payments/ledger/__tests__/memory.vitest.test.ts src/payments/ledger/__tests__/sqlite.vitest.test.ts src/payments/ops/__tests__ src/payments/__tests__/kernel/provider-contract.vitest.test.ts src/payments/__tests__/kernel/provider-module-guard.vitest.test.ts --maxWorkers=2 --minWorkers=1
COMMERCE_PG_URL='postgres://postgres@127.0.0.1:55432/commerce_test?options=-csearch_path%3Dcommerce_payment_recovery' ./node_modules/.bin/vitest run -c vitest.kernel.config.ts src/payments/ops/__tests__/intent-recovery.vitest.test.ts --maxWorkers=1 --minWorkers=1
COMMERCE_PG_URL='postgres://postgres@127.0.0.1:55432/commerce_test?options=-csearch_path%3Dcommerce_payment_recovery' ./node_modules/.bin/vitest run -c vitest.kernel.config.ts src/payments/ledger/__tests__/postgres.vitest.test.ts --maxWorkers=1 --minWorkers=1

cd /workspace/Jini/packages/provider-plugins
node /workspace/Jini/node_modules/vitest/vitest.mjs run src/payments-stripe/__tests__/payments-stripe-kernel.test.ts src/payments-stripe/__tests__/provider.test.ts src/payments-stripe/__tests__/amount.test.ts --maxWorkers=2 --minWorkers=1
```

Further focused commands were direct `node --import tsx <test-file>` runs for Tovu's commerce worker, settings, drain, origin, composition and provider-host files; Vitest with `-c vitest.kernel.config.ts` for commerce catalog/browser/money files; and ESLint with `--no-inline-config --rule '{"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10]}'` on changed production files. The final relocation's additional direct Jini tests/build command did NOT start after the transport disconnected; no success is claimed for it.

Observed failures left open, each independently:

- Existing PostgreSQL ledger `listOpenAttempts({ops:[]})` emits `IN ()`; the ledger contract passed 54/55. Recovery cases all passed. No unrelated query fix was made.
- Existing Tovu TypeScript error: `apps/website/src/features/deployments/publish-credentials/store.ts:410`, optional string passed as a required ID. The file is unchanged from the base.
- Existing stage-1 retention snapshot normalizes SQLite's renamed double-quoted identifiers but leaves expected backticks. The populated-archive case fails on SQL spelling only; rows, indexes, references, bookkeeping and archive names show no difference. Historical migration/test files were not changed.
- Existing commerce-strip parity goldens omit `owner_recovery_codes`, already present in base migration 0039. Two parity assertions remain failing; goldens were not weakened.
- Route fixtures emitted unrelated charts-recharts integrity warnings. Product rendering assertions passed.
- Real deployed HTTPS callback reachability and live provider acceptance were not exercised; deployments/live data were forbidden and no real payment credentials were used.

Final unfinished work in the detached workspace:

- Jini `packages/commerce/src/payments/ingest/settlement-worker.ts`: reusable scheduling/ownership state machine, with injected ports; `payments/kernel.ts` export.
- Jini `packages/commerce/src/catalog/merchant-drain.ts`: reusable original merchant query/selection and configuration shape; `catalog/repo.ts` export.
- Tovu `commerce-worker.ts` reduced to the local owner-lock/timer adapter, `commerce-drain.ts` reduced to reexports, and `commerce-settings.ts` aliases the generic configuration type.
- A disabled-drain migration guard in Tovu composition was being tightened so an existing payments ledger does not create an absent catalog while commerce is off.
- These local edits were not committed, built or tested after relocation. Prepared direct Jini test files in the failed tool call were not persisted. Inspect the actual diff before continuing.

Resume by restoring the SAME execution environment, checkpointing those explicit paths, then building Jini commerce before Tovu tests (new exports are otherwise absent). Pull/rebase `origin cloud/commerce` before pushing; this report was committed remotely while the local shell was unavailable. Rerun the retained worker/drain/composition assertions, direct Jini engine/SQL tests, touched-package TypeScript and complexity checks. Update this report and push only `cloud/commerce`. Cleanup of disposable Docker container `commerce-pg-1105` could not be confirmed after disconnect; stop it on resume. No production service was deployed.

State cost, before relocation (the move preserves it): default-off does one settings-definition ensure, versioned activation read and table metadata probe, with no commerce DDL, credentials, provider HTTP or recurring timer. Active/draining ownership runs at most once/5 seconds, with <=25 inbox rows and <=25 outbox rows per cycle and one PostgreSQL liveness probe. Reconciliation scans 3 bounded categories x2 modes/minute, <=10 rows each (<=60 candidates; current intent subset <=20). Merchant transitions/restarts read <=1 pending scope/snapshot; unchanged configuration skips that query. PostgreSQL reserves one pool connection and needs pool capacity >=2. First buyer submission makes order+pay calls; retries make only pay, with one small sessionStorage write and no UI polling. Payload budgets are design estimates, not measured traffic.

Pushed code head for Tovu: `a534998c66a183212e6fc320d8aee7d556003f23` on `cloud/commerce`. The report itself is a later documentation commit.

All pushed code commits in Tovu for this job, oldest first:

- `cedb0f943641060f77d6b80f3fc189e7b35a6ac4` feat(commerce): migrate opt-in host catalog on activation
- `daff468ed9b7c1109b5c7c98b97d32933f99c7aa` feat(commerce): attach payment leases through existing provider host
- `a82a23f7b34470aeb90674e5b1167aba5783ccb3` feat(commerce): render catalog products using their own currency
- `16f1e98347f55bb24250958fd363d4925072e4e5` feat(commerce): add member-owned purchase and read-only return routes
- `18dceaedde01a94a766e931a7f70821203c94898` fix(commerce): coexist with archived catalog indexes
- `f94c369a4f40a70d2276fa0ef3d94e712d46ec28` fix(commerce): keep storefront failures specific and legacy runtime unused
- `d49e401a0cb3fe592a11befe89eaf61ee42a0805` refactor(commerce): retire dormant legacy runtime to test fixtures
- `d21c2d4355702357a16a6a7c1383062eabb6fba5` fix(commerce): reject ambiguous member cookies and expose host ports
- `cffc6688605ce0b18545e22158d8ee5f55313528` test(commerce): prove signed SQL checkout settlement and relay recovery
- `c8c038b04fa5559dae25c06f0ec58ae8ed01ed96` feat(commerce): add product detail purchase form
- `a75d31b008cb9037cf427b6cee0d62a6f6dcb4bf` feat(commerce): mount opt-in checkout and raw signed webhooks
- `ab0719514e26d5a5045324eea629eecac1c97f30` test(commerce): type borrowed SQL fixtures at migration boundary
- `7fc1cafeb14881e1724a8489c651e0575132ec4e` refactor(commerce): keep purchase control activation gate small
- `4485fbdbc3ac0d397fb97b530479826be5cf14b2` feat(commerce): connect catalog tools through host runtime
- `305e17b85691b084891bcfe2a063917a1a0e1d51` test(commerce): verify settlement on isolated native PostgreSQL schema
- `6a305e03cc5571b25340f1affbd7f1c9fdd6a05c` test(commerce): bind checkout requests to trusted fixture origin
- `9823a62d495e329d63bfce1892ee4937f6de01de` feat(commerce): compose activation-gated scoped payments and single settlement owner
- `74bf7d797d894550317f78ad96123663e63b90b4` fix(commerce): open deployed shop from desktop product views
- `cdf49a30954e30bccdc7f9709611b0527070c7c7` fix(commerce): accept purchases only at the deployed shop origin
- `fecdb3960f4ec7c4e0e6a5a3aaa9fbb25a75d683` feat(commerce): expose explicit new-order recovery control
- `0eec5c2ee15b319080612eb68c0c010922bac68b` fix(commerce): preserve original payment drain and fail over worker ownership
- `2f122ebd4cd7c16c2d49b5aadea9369cc34522b2` test(commerce): verify host activation and disabled restart settlement
- `55421924d54a04a5c9def364e3da013fb8f57f80` test(commerce): require actionable warning for enabled unconfigured checkout
- `959fe9b94107598d0b744d81502b73ea79692285` test(commerce): keep product cacheability fixture on catalog adapter
- `f72a63342d0bdecea66dac7485c0f83ba9b48ef7` fix(commerce): persist safe catalog money in bigint columns
- `e58a3fb97071abbf5b72dc17fb8d069a55252627` fix(commerce): wake durable webhook drain and validate deployed checkout origin
- `a534998c66a183212e6fc320d8aee7d556003f23` test(commerce): keep legacy store port confined to cache test fixtures
