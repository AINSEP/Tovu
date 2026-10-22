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

## Build / tsc / tests (cloud, node 24)
- Jini: `pnpm --no-bail -r build` passes (rc 0, run again after fix-memory). tsc --noEmit gives 0 errors in all 35 changed packages (36 configs). vitest --maxWorkers=2, per package: all green except chat and agent-plugins. Totals include admin 2783, agent-runtime 4092, cms 3924, ui 8665, daemon 3476, platform 2497, commerce 46+4+599, search 319, payments-stripe 145. Merge-caused failure: chat run-ledger default clock (cov-J2 clock vs fix-memory test), fixed in 9cee44e4. agent-plugins lifecycle-reconciliation: 2 timeouts under load 18; the file passes 9/9 alone. Not verified: a full chat run (252 of 255 files reported before the timeout).
- Tovu tsc, errors base→merge: root 21→9, e2e 11→9, tests 79→65, admin 2→4. 3 merge-caused errors fixed (475b943fb, 0e38ee684, 8a64ac557). All remaining new errors also exist on their source branch:
  - commerce/storage `ContentKernel`/`consentAudit` (app.ts, deps.ts, consent tests)
  - search provider tests
  - email-dns send-pipeline `records` private
  - comments/plugins orphan site-backups test
  - cov-T3 oauth-callback/site-consent
  - cov-T1 admin AssistantDock
- Tovu tests (node:test, concurrency 1–2):
  - Touched feature dirs: 889 of 1435 files, 11963/12069 pass, 65 fail.
  - server/runtime + server/__tests__ + migrations: 1723 pass, 5 fail, 213 cancelled at the 20-min cap. The cancelled publish-content files that were rerun pass 11/11.
  - Merge hot spots (serve wiring, boot wiring, tool-metadata projection, 0027/0028 steps, checksums, drift/types/parity, newsletter deps, lipay, agent-plugin routes): 150/150 pass.
  - Admin vitest: 552 files, 10039 pass.
  - Merge-caused failures fixed: 840855975, b42c943b4, 461c9141a. 461c9141a left a test title still saying the edit "announces nothing", though it now expects `entry.updated`.
- Pre-existing (fails on its source branch):
  - fix-comments: mcp-ui-tool-calls security allowlist and `comments_set_provider`; cross-site-read-catalog `comments_get_provider`.
  - fix-storage: publish-agent-tools and descriptor-fields (`mediaBucket`).
  - cov-T2: secret-scan-guard flags a PEM marker in backstop-preview.test.ts and in the cov-T2 REPORT.
  - fix-email-dns: pglite `postgres-baseline` "matches schema.postgres.ts at head" (confirmed in a worktree).
  - Integration base: stray `apply-loop.test.ts-e`.
  - Flaky under load: providers-tools L241 (passes 36/36 on rerun).
- Not run in the cloud: about 546 Tovu files (most of server/inbound, platform/site-dir, plus the full-suite run below); site-chat and desktop tests (react/electron not installed at the root); Jini chat full run.
- Leak found: a test writes `sites/tovu-dev/agent-plugins/` into the real repo tree. Removed, not committed.

## LOCAL-RUN NEEDED (combined)
- Tovu: the unrun files above, the full `npm test` suite (after `unlink:jini`), site-chat/desktop suites, `runner.postgres.test.ts` at head 0028 (90 tables); Jini chat full vitest on an idle machine. · PG: Tovu `runner.postgres.test.ts` + `migration-manifest-postgres.test.ts` per branch head (email-dns 0026, search 0024); renumber first [email-dns, search, providers-b] · PG: Tovu database-transfer `copy-engine` / `tool-registrations` `.postgres` tests [email-dns, provfix, cov-T2]
- PG: Tovu composition `*.postgres.test.ts`, `create-site-route-deps`, `boot-site-dir`, Postgres-site boot [mediagen, search, provfix, storage] · PG: Tovu post `repo`/`search-index`, navigation CAS, kernel `ops.postgres`, go-live.repo + outbox ON CONFLICT leg; pglite `postgres-baseline` schema mismatch [cov-T2, fix-scheduled, fix-content] · PG: Tovu site-dir `init-site.postgres` + `site-key-dependent-data.postgres` [cov-T3]
- PG: Tovu media providers integration, media-provider-credential-repo, media parity harness, webhook repo contract [providers-a] · PG: Jini commerce `ledger/__tests__/postgres.vitest.test.ts` (COMMERCE_PG_URL; 0002/0004, seq, reviveInbox...) + true concurrent-refund interleaving [commerce, commerce2, payments] · PG: Jini db `kernel`/`ops`/`postgres-pool-error`/transfer `copy-engine`+`order` postgres tests (`test:postgres`) [cov-J3, fix-coverage]
- PG: Jini `@jini-ai/chat test:postgres` + Tovu TOVU_CHAT_TEST_POSTGRES_URL suites (in-SQL append, run-ledger) [fix-memory] · PG: cms comments `repo.contract` pg adapter (entryId filter); search index-state store [comments, providers-b] · Playwright: Tovu desktop `src/renderer/websites-width.test.ts` (Chromium) [cov-T1, cov-T2, fix-coverage]
- Playwright: Tovu Starter `npm run test:visual`, admin comments journey, Agent Plugins pages [comments, fix-content] · Full single-process Tovu website suite (ended silently ~test 600) + full `npm test`/`pnpm -r test`, `typecheck:tests`, desktop typecheck+test; `unlink:jini` first [plugins, analytics, storage, cov-T2, fix-coverage, fix-scheduled] · Rerun load-sensitive admin tests under normal load: main-entry-signed-in, use-trash, widgets-swap, devtools-bundle [cov-T1]
- macOS: verify-find-in-page (also FIND_VERIFY_NATIVE_KEYS=1), verify-site-power, site-process-registry launchd tests [cov-T1] · Real boot (`tovu serve`, `npm run dev`): webhook hits https receiver in ~15s, clean Ctrl-C; spawned stdin-EOF test [provfix] · Real mail: fresh + upgraded boot keeps provider; `mail_set_provider`/`mail_send_test` real key; Resend Svix webhook; one-click unsubscribe; sender set/empty; newsletter vs rate-limited provider [email-dns, provfix]
- Live DNS: `dns_verify`/sweep via node:dns on a real domain; `include:["mail"]` with real Resend sender [email-dns] · Real Meilisearch v1.3+ conformance (filter escaping, task waits vs 3s budget); e2e publish -> `/api/search` [search, providers-b] · Real S3/R2/MinIO round trip: media via mediaBucket and env `s3`, share upload + verify [storage]
- Stripe sandbox: record real PaymentIntent/Refund/Dispute/Event payloads; ISK/UGX, real `whsec_`, 3DS next_action [commerce2] · Live vendors: analytics forwarder (Plausible/PostHog/GA4) + browser consent accept/reject/GPC; real media generation key [analytics, mediagen] · Scheduled-post e2e: schedule +2min, exactly one entry.published ~60s after go-live, restart across go-live; overlap on PG read-committed [fix-scheduled, fix-content]
- Memory soak: daemon heap over long screenshot-heavy chat (~60MB); website heap during 17-24MB turn [fix-memory]
## LOCAL VISUAL CHECK (combined)
- Starter blog post comments: thread + form light/dark/375px; no-JS submit -> `#comment-pending`; approve -> appears; 200+ "More/First comments" [comments] · `comments_set_provider {providerId:null}` confirmation card with pending count; thread hidden [comments]
- Admin MailStatusBanner `unconfigured` (light/dark, next to ServerRestartingBanner) and `ready` (no banner) [email-dns] · Assistant confirmation cards for `mail_set_provider` and `mail_send_test` [email-dns]
- Agent Plugins Installed tab: "Not for this Tovu version"/"Needs..." lines, Update panel (open/close, Updating..., alert, success), bundled rows no Update; dark + 375px [plugins, fix-content] · Agent Plugins disable dialog "X needs Y" lines + origin-aware copy [plugins]
- Agent Plugins Add tab (install mode) [fix-content] · Admin Media providers tab (plugin keys preserved; plugin vendors not listed) [mediagen]
- Admin storage connection: new `mediaBucket` / `mediaKeyPrefix` fields [storage] · Site store + product pages render identically after store-runtime move [payments]
- Desktop renderer tab close (possible infinite update loop) [cov-T1] · AdminThemes card preview resolves "system" via matchMedia like the picker [cov-T1]
## OPEN OWNER QUESTIONS (combined, deduplicated)
- Provider-id grammar for remaining registries (visitor-auth, OAuth, commerce payments use hyphen/dot ids) [provfix] · Search contract sign-off (`contract.ts`, `ports.ts`, `api.ts`) as frozen? [search] · Search: exclude `search_index_*` from DB transfer? `/api/search` before serving gate + consent OK? add `features/site-search` barrel? [search]
- Search: one serving process per site guaranteed (cross-process race)? revocation at next use or lifecycle hook? theme search block + Algolia still wanted? [search, providers-b] · Egress refuses http/localhost: local-dev webhooks retry to dead, no localhost Meilisearch - intended? [provfix, search] · Webhook worker now runs in production while routes blocked (REQ-07) - gate it? shutdown-interrupted attempt counts; lease in `next_attempt_at` OK? [provfix, providers-a]
- Mail: onboarding push SMTP or Resend? bulk = newsletter-only? purge `mail_capture` on a timer? [email-dns] · `core.mail.*` admin UI + validation, PUBLISHABLE_SETTINGS? no-sender error on sign-in/subscribe OK, name default site title? confirmations skip durable-outbox in prod OK? [provfix] · Mail quota continuation: `occurredAt` as due time, or add delayed-enqueue to outbox contract? [providers-b]
- DNS: may agents delete records (D4)? manual provider can never plan replace/delete OK? mixed-zone requests rejected not split OK? [email-dns, providers-b] · Comments: strip form on static export? real publish timestamp for legacy posts (closeAfterDays)? public reply control in v1? [comments] · Comments settings: global-scope reset now refused (was 500) OK? generic-route set -> 403 like clear/reset (now 400)? [fix-content]
- Scheduled posts: new go-live id re-announces historic scheduled posts on first boot - accept burst or deploy watermark? [fix-content] · Plugins: refuse uninstall while update pending? update-history retention? downgrades refused everywhere intended? make `enabled` required? engine manifest default namespace "tovu"? [plugins] · Analytics: forward `visitorHash`? forward when consent disabled? path redaction emails only - extend (phones, ids)? [analytics, providers-a]
- Storage/media: local-fs refuses symlinked subfolders in uploads OK? media credential save keeps unknown ids (e.g. xai-grok-imagine) or clean up? [providers-a] · Memory: `dropEventsOnEviction` for sqlite kernel? dedupe delegated tool_result (protocol change)? poll route + assistant-chats still load full transcript; cache media-rendition marker scan? [fix-memory] · Commerce: PGlite devDep for PG contract in CI? dispute close with changed amount - apply status, quarantine diff? alert when refunds+disputes > captured? deprecate capability-providers payments port? [commerce]
- Commerce: timed-out createIntent lookup by correlation id (Stripe metadata search)? alerts in writer tx vs outbox? floor on reconciler `olderThanMs`? [commerce2] · Commerce: core `moves-money` side-effect class? replay mints unused grant OK? non-signature verify failures -> 400 keep? durable MoneyGrantPort next lot? Lipay adapter now `PaymentsPort` OK? [commerce2, payments] · Classifier-denied security edits: remove agent-permission-mode.ts:36 arm? make deployment-overview `siteKey` required? vault-credential-recovery fallbacks kept [cov-T2, cov-T3]
- REGRESSION: secret-scan-guard fails on literal PRIVATE KEY marker in backstop-preview.test.ts:84 (fix edit denied) [cov-T2] · Coverage exceptions: electron fake for preload-speech.cts or exclude? provider-kit adapter required by Jini? featured-image-refusal `mock.module`; stray `apply-loop.test.ts-e`; orphan site-backups test [cov-T2, comments] · Possible bugs, fix?: use-agent-plugins.hooks:147 empties list; sites-mcp-server METHODS no hasOwn; duplicate `structure-max-files`; useConnectorAuthorization stale cancel wipes authError; asset-cache null TypeError; pglite moveStaleLock loses lock; admin redirects/seo copy binds singleton; dna-scaffold font quotes [cov-T1, cov-T2, cov-J1, cov-J3]
- Jini review flags: launch.ts `turnIndex` always 0; keep `CacheEntry.refreshAfterPending`? accept removals relying on cross-package invariants (transfer-tools refusal, run-lifecycle guards, authorize `no_grant`) [cov-J3] · Move Tovu helpers to Jini (merge-locale-overlays, parent-watchdog, dom-hook-harness, key-only-site-meta timestamp)? [fix-coverage] · web-clone: merge script-cli.mjs vs cli-args/main-guard; convert ~45 positional helpers to two-object? admin vitest without StrictMode re-run OK? [cov-J1, fix-coverage]
- Renderer `WorkspaceChatPane` has zero call sites but a test requires it - keep? [cov-T1] · Merge: point capability-providers `createCommentsProviderRegistry` and commerce `createKernelProviderRegistry` at core `createProviderRegistry`? [merge] · Merge: comments `comments_set_provider` fails the MCP-UI security allowlist test — add it, or keep it off? [merge, comments]
