# merge-2026-10-21 REPORT
Branch `cloud/merge-2026-10-21` in both repos. Jini base b3c4144b, Tovu base e0c935bb5. Ran 23:04Z–~00:40Z. main untouched, nothing force-pushed.

## Merged (merge commit)
Jini: provfix e298c3fc · storage e6886e6d · mediagen df7aa104 · analytics c5cb6b6d · email-dns dde62e8b · search c3ce309b · commerce 91afd7db · plugins 532d5f6b · comments 37cb5ba8 · cov-J1 a0ffaf0b · cov-J2 d1cbf566 · cov-J3 ac0c09be · fix-memory 7fb45e0b (last). Merge fix: 9cee44e4 (chat ledger default clock).
Tovu: provfix 6c30dbac4 · storage 464b1f98d · mediagen 622d1d51f · analytics 2b5f7ef0f · email-dns 44cf3e4ee · search b2871ca8d · commerce 8263b6ddc · fix2-scheduled 7d4d9c97a · plugins 6be2c77c7 · comments 1e703249b · cov-T1 b069c4b08 · cov-T2 e5b7bf405 · cov-T3 d767c0f14 · fix-memory 5da0923e8 (last).
Merge fixes: 3c1945a8f (0027/0028 checksums), 475b943fb (lost `});`), 0e38ee684 (duplicate import), 8a64ac557 (outbox `Pick<enqueue>`), 840855975, b42c943b4, 461c9141a (tests expecting lists a sibling branch extended).
Skipped: none. fix-memory: its REPORT (on the Tovu branch, covering both repos) was present at merge time, and the Jini branch held every commit that REPORT lists. Not merged (not in the list): Tovu fix-scheduled (superseded by fix2), fix-briefs, fix-tovu*.

## Conflicts and how they were resolved
- CHANGELOG.md (Jini core, agent-plugins): kept both sides' lines.
- Jini platform mail/index.ts: exports from both sides kept. cms consent/express/index.ts: kept `?? DEFAULT_CONSENT_COOKIE_NAME`, because `currentRecord` requires a string.
- Jini agent-plugins lifecycle/set-enabled.ts (vs cov-J1): fix-plugins side, as the rules require.
- Tovu serve.ts / index.ts / serving-app.ts: every background loop is kept and stopped: postGoLiveSweep, webhookDeliveryWorker, domainBindingSweeper, siteSearchMaintenance. Tests (serve-command-wiring, serve-export-teardown, serving-app-boot-wiring) extended to cover all of them.
- Tovu deps.ts: kept both sides' imports and registrations. One duplicate import removed later (0e38ee684).
- Tovu html-document-store.ts: published-page edits emit `entry.updated` (search) AND run the go-live catch-up (scheduled). Columns are the union of both sides.
- Tovu settings tool-registrations.ts: mail denials and the comments-provider denial both kept.
- Tovu features/agent-plugins/** (comments vs plugins): fix-plugins side. Comments added nothing else under that path.
- tool-metadata.baseline.json (search, comments): structured JSON 3-way merge, no scalar conflicts. Projection test passes.
- Tovu media blob-store.s3.test.ts: stays deleted, because fix-storage retired S3BlobStore and cov-T2 had only edited the file.
- Tovu newsletter deps.test.ts (add/add vs cov-T3): HEAD's kept. cov-T3's kept beside it as `deps-bundles.test.ts`.
- Tests both sides appended to (cov-T2/T3 vs features): both tests kept.
- Shared provider registry: every new registry uses core `createProviderRegistry` except Jini capability-providers `createCommentsProviderRegistry` and commerce `createKernelProviderRegistry`. Neither was a trivial swap. Listed for the owner, left unchanged.

## Migration renumber map (Tovu content DB)
`0023_search_index` → `0027_search_index`; `0024_search_index_retired` → `0028_search_index_retired`. Files, ids, registrations, the fresh-db bootstrap, step tests ("0027 follows 0026"), drift/types/parity comments and the runner.postgres pins (90 tables) are all updated. Checksums re-pinned. email-dns keeps 0023–0026. No other collisions in either repo. Jini commerce keeps 0001/0002/0004; the runner does not need contiguous numbers.

## OWNER ITEM: legacy LiPay dropped
Jini 353a84e7: deleted `0005_legacy_lipay_import.ts`, its checksum, its `sql.ts` exports, the `legacyLipay` option of `migrateCommercePayments`, and its test. Kernel untouched. Tovu 0e593e4a8: `activateLipay` drops the `legacyLipay` option, and the import test is removed. A dev database that already recorded 0005 in `commerce_payments_migrations` may need a fresh ledger.

## Dependencies / lockfiles
Tovu root package.json now has the union of both sides: `@jini-ai/search ^0.1.0` (search) and `@jini-ai/capability-providers ^0.4.1` (comments/plugins). `npm ci` and `npm install` fail with E404 because @jini-ai/search is unpublished, so package-lock.json is left as merged. For verification, deps were installed with search removed temporarily, then `link:jini` was run. admin `npm ci` passes. Jini `pnpm install --frozen-lockfile` passes, so pnpm-lock is consistent.

## RELEASE ORDER (Jini → npm; bump every changed package, none bumped yet)
Unpublished: @jini-ai/search 0.1.0, @jini-ai/payments-stripe 0.1.0, @jini-ai/charts-recharts 0.1.0. Every other changed package is still at the version already on npm, so each needs a bump. Dependency order:
core → agentic → platform → ui → ui-kit → agent-plugins → db → http-kit → cms → admin → oauth → integrations → agent-runtime → analytics → artifacts → capability-providers → charts-recharts → diagnostics → chat → sidecar → cli → commerce → daemon → desktop-host → devops → mcp → memory → payments-stripe → plugins → registry → sandbox → search → server → user-management → vibecoding.
Then Tovu: `npm install` to regenerate package-lock (needs search published).
