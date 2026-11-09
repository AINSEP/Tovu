# Lane tovu-web-A digest (shards 1, 4, 7 of the Tovu website node:test suite)

Run sequentially, Node 24, no Postgres, no IPv6, no Chromium. No shard timed out (all exit 1 = test failures, none exit 124). Runner printed full TAP summaries for all three. node:test gives no per-file pass/fail count, so "files" is the number of files in the shard list; file-level `not ok` entries are listed below.

## 1. Summary table

| suite | exit | files (list size) / file-level fails | tests pass / fail / skip (+todo) | cancelled | duration (s) |
|---|---|---|---|---|---|
| tovu-web shard 1 | 1 | 384 / 2 (access-choice.postgres, member-external-identities.postgres; also seed/site-key files fail inside) | 4065 / 27 / 7 (+0) of 4099 | 0 | 2473 (TAP 2472.5) |
| tovu-web shard 4 | 1 | 383 / 2 (postgres-pool-error.postgres crashed at import-time fixture; form-delivery-repo.postgres) | 4821 / 21 / 3 (+0) of 4845 | 0 | 1880 |
| tovu-web shard 7 | 1 | 383 / 4 (copy-engine.postgres, ops.postgres, boot-site-dir.postgres, create-site-route-deps.postgres) | 4239 / 48 / 6 (+0) of 4293 | 0 | 1849 |
| **total** | | 1150 | 13125 / 96 / 16 | 0 | |

(Shard 1 TAP says skipped 7; only 6 `# SKIP` lines were greppable, fine.) Failure counts include the file-level `not ok` wrapper entries that node:test emits for files whose tests failed.

## 2+4. Failing tests with class and evidence

Root-cause groups first, every test listed.

### A. No Postgres (environment) - 59 entries
Evidence: `psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory` (fixture `failed to drop fixture database ...`, from /home/user/Jini/packages/db/src/pg-fixture.ts:92) or `postgres: psql request failed` (copy-engine pg-test-db.ts:23).

Shard 1 (13):
- access-choice.postgres.test.ts › independent connections cannot both apply an access decision from the same snapshot
- access-choice.postgres.test.ts (file-level)
- member-external-identities.contract.ts › [postgres] identity round-trip is scoped and independent of email or tokens
- … › [postgres] both natural keys reserve ownership, including unlinked rows
- … › [postgres] an id cannot move ownership, even during explicit reconnect
- … › [postgres] unlink survives stale callbacks and is idempotent and workspace-scoped
- … › [postgres] explicit connect reuses the marker row and can change the subject
- … › [postgres] conflicting concurrent inserts produce exactly one owner
- … › [postgres] listing orders multiple providers and active upserts retain a single row
- … › [postgres] records cannot mutate storage through input or output references
- member-external-identities.postgres.test.ts (file-level)
- seed-content-store.postgres.test.ts › runner-to-head, then prepare twice: one watermark row, one seeded workspace with its posts and presentation
- … › a restart never overwrites operator edits: edited, deleted and re-themed rows survive a second prepare byte for byte
- … › an existing workspace with the seed's SLUG but a different id is never seeded over: no second workspace, no demo posts
- … › two processes booting at once: the second prepare WAITS on the seed lock the first holds, then seeds nothing twice
- site-key-dependent-data.postgres.test.ts › findSiteKeyDependentData: Postgres (env) site - a clean database is no data; a sealed row is data
- site-key-dependent-data.postgres.test.ts (file-level)

(That is 17 lines; shard-1 Postgres total = 17, so shard 1 non-Postgres = 10.)

Shard 4 (10): kernel.postgres.test.ts › postgres: transactions commit, roll back and nest on a pooled connection; › two connections WITHOUT lockKey: both appends read the same latest row (the hazard is real); › two connections WITH lockKey: the second append waits and chains after the first; postgres-pool-error.postgres.test.ts (file-level; process crashed `failed to drop fixture database "tovu_kernel_pg_pool_error_fixture"`); form-delivery-repo.postgres.test.ts › postgres: two pulls racing for one receiver admit exactly one; the other is already-running; › postgres: a purge during an in-flight attempt is final; the attempt's outcome neither revives nor resends the job; form-delivery-repo.postgres.test.ts (file-level); resolve-workspace.postgres.test.ts › resolves the one workspace row and rejects an unknown explicit id.
(That is 8 lines.)

Shard 7 (29):
- copy-engine.postgres.test.ts (15 lines): the first site's copy lands in `tovu` with the same row count as SQLite for every copied core table, and leaves out logins and saved keys; a re-copy replaces the site's own copy and never appends; cross-site wipe regression: a copy aimed at a schema holding ANOTHER site's copy is refused inside the transaction; a schema someone else made (no marker) is refused and left untouched, and a new site is given its own schema instead; two sites share one database: the second gets `tovu_<site>`, each re-copy replaces only its own, and a site keeps its schema after `tovu` frees up; a row Postgres rejects rolls the whole copy back and names only the table; a count mismatch or rejected replacement preserves the earlier rows and marker; a setting marked secret stays behind (values at every scope and its history); ordinary settings are copied; T1: the copy carries the schema's indexes, foreign keys, checks, defaults and identity columns, and new rows number after the copied ones; T1: a source row whose parent is missing does not stop the copy; that foreign key is kept unvalidated and named in the result; T2: every table in the snapshot is copied or left out with a reason; a plugin's tables are copied from the snapshot's own layout; an unconfirmed first-copy plan cannot overwrite a copy created since planning; a Postgres site copy preserves publish backstop audit rows and their undo inverses; plus the file-level `copy-engine.postgres.test.ts`. First error: `postgres: psql request failed`.
- pg-fixture.unit.test.ts › psql() returns ok:true with stdout for a successful query - `false !== true`; › psql() returns ok:false with stderr populated, never throwing, for a failing statement; › recreateDatabase() throws the exact wrapped DROP message and never attempts CREATE when DROP fails; › recreateDatabase() + dropDatabase() happy path round-trips a real throwaway database (these call real psql against a server; same cause)
- ops.postgres.test.ts › Postgres copyTo is refused with what to do instead; › Postgres compactAndVerify refuses a missing ledger, then passes once it has a step; ops.postgres.test.ts (file-level)
- archive-legacy-commerce.postgres.test.ts › Postgres: concurrent upgrades archive once with stable relation identities; dumps restore all rows
- boot-site-dir.postgres.test.ts › bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db; › bootSiteDir honors an explicit Postgres workspace instead of the oldest; › createSiteRouteDeps reuses the store bootSiteDir opened (serve/export pass it as overrides.store); › bootSiteDir on a postgres site rejects an unknown --workspace and closes the store it opened; › createSiteRouteDeps refuses overrides.store without workspaceId (the pair rule covers the store too); boot-site-dir.postgres.test.ts (file-level)
- create-site-route-deps.postgres.test.ts › Postgres composition boot sequence preserves data across env, sealed-secret and wrong-key boots; create-site-route-deps.postgres.test.ts (file-level)

### B. No Chromium / Playwright browser (environment) - 13
Evidence: `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/...`
- Shard 1: playwright-browser.integration.test.ts › observes real rendered evidence from a real page
- Shard 4: render-form-layout.test.ts › a successful contact form is hidden by the emitted stylesheet in a browser; › contact form fallback error and success colors apply in both modes without theme tokens; › checkbox fields render inline before their label with only the emitted stylesheet
- Shard 7: preview-switcher-layout.test.ts › preview tag under the "sticky" theme at 1440px / at 390px, "fixed" theme at 1440px / at 390px, "hostile" theme at 1440px / at 390px (all: "pinned at the very top, centred, no gap, nothing hidden under it", 6 tests); › preview tag with more choices than fit a phone scrolls from the start instead of clipping the label; owner-passkey-browser.integration.test.ts › browser virtual authenticator verifies registration, assertions, UV, signatures, counters and local port changes

### C. `Invalid URL` / ERR_INVALID_URL in api-connections test support - 13 - UNCLEAR (likely stale test support or a changed sign-in link shape; not environment: no network or IPv6 involved)
Evidence: stack ends in `providerUrl` at apps/website/src/features/api-connections/__tests__/support/starting-browser.ts:34 (`new URL(link)` / `new URL(url)` on a value that is not an absolute URL); the helper only maps links captured via `host.signInHandoffs.issue`. Could not determine whether the product now emits relative/handoff links or the helper is out of date.
- Shard 1: agent-plugin-connections.vertical-slice.test.ts › vertical slice: connect -> public callback -> executable tool call -> admin-surface action, all through the composition; › vertical slice: a surface reads status, starts a pick sign-in, takes its callback field once, saves state, and a tool reads it; › security: the shared connection port refuses another workspace's target and reads no account for it; › security: a token a plugin kept in module scope is withheld in a LATER tool call, surface call and state write (one memory per generation); › security: one token memory across seams: a token a TOOL obtained is withheld from a surface answer; › security: one token memory across seams: a token a SURFACE handler obtained is withheld from a tool's output; › vendor neutrality end to end: a second provider plugin connects, stores sealed tokens, runs a confirmed write tool, a surface action and a push form delivery; › security: the composition gives the assistant's tool registrar and the admin screen's connections ONE frozen-account map, so an admin action the assistant runs is pinned
- Shard 4: surface-adapters.security.test.ts › workspace: every connection-ref operation names the port's workspace (connect, confirm, cancel, disconnect)
- Shard 7: connect-tool.api-connections.unit.test.ts › a declared API connection connects through the real host: waiting card, then connected card, status and connectionRef only; › API sign-in displays only the declaring plugin oauth card copy; › a failed connected-card update never turns a real connection into a tool failure; › with no poll interval or wait bound configured, the built-in defaults still let a finished sign-in connect

### D. Other failures (non-environment)
- Shard 1: agent-daemon-site-tools.unit.test.ts › plugin preflight sends only the live run id and closes after receiving its prepared prefix - ZodError `pluginIds Required` - **stale test**: source apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts:23 has strict schema requiring `pluginIds: z.array(z.string())`; test fake response (test line 139) returns only `{prefix, refusalPrefix}`.
- Shard 4: introspect-command.integration.test.ts › tovu introspect: exits 0 and prints valid JSON describing init/serve/export - matches the live CLI, not a hand-maintained doc - `introspect must list the real registered commands ...` actual has extra `'import-local'` - **stale test** (expected list lacks the new `import-local` command; the string does not occur in the test file).
- Shard 4: introspect-command.integration.test.ts › tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions - `Expected values to be strictly deep-equal` - **stale test**, same cause (new command not in expectation); not verified line-by-line.
- Shard 4: worker-import-graph.test.ts › handlebars-worker.ts source graph contains no @jini-ai package roots, including deferred imports; › handlebars-worker.ts loads no database, blob-store or agent packages; › liquid-worker.ts source graph contains no @jini-ai package roots, including deferred imports; › liquid-worker.ts loads no database, blob-store or agent packages - `names/loaded @jini-ai root barrels: /home/user/Jini/packages/cms/dist/core/form-collection.js -> @jini-ai/core` - **product bug** (in the Jini dependency: cms dist imports the `@jini-ai/core` root barrel; or Jini dist out of sync with Tovu's expectation).
- Shard 4: check-idle-motion.test.ts › the live tree has no idle-CPU offenders and no stale allowlist entries - offenders: bare `setInterval(` at apps/desktop/src/main/index.ts:994 and stale allowlist entry `.card.is-starting .state__dot ...` in apps/desktop/src/renderer/app.css - **product bug / stale allowlist** (live tree drift vs the check).
- Shard 4: dead-path-sweep.test.ts › dead-path sweep: no path reference outside the known-broken register resolves to nothing - 8 refs to `development/coverage/*` and `ADS-memory/.local-artifacts/*` missing - **environment** (untracked/gitignored generated dirs absent on this checkout).
- Shard 4: dead-path-sweep.test.ts › generated coverage artifacts are not reported as dead paths - `development/coverage/lcov.unit.info's parent directory should exist` - **environment** (no coverage dir generated).
- Shard 7: vendor-neutrality.test.ts › no generic seam file names the first provider - actual lists apps/website/src/features/agent-plugins/bundled-catalog.ts:43, :44 and api-connections/shared-owner.ts:81, expected `[]` - **product bug** (generic files name a provider) or stale test if intentionally allowed; not verified which.
- Shard 7: sqlite-create-site-app-module-identity.integration.test.ts › createSiteApp() on a SQLite composition adds no second copy of the serving app's event handlers - `sanity: forms analytics, forms notify and webhook fan-out each subscribe once  2 !== 3` - UNCLEAR (subscription count 2, expected 3; possibly a module changed its subscriptions or Jini dist skew).
- Shard 7: assistant-tool-exec.integration.test.ts › a committed write whose response is dropped is OUTCOME UNKNOWN, ran once, and blocks a blind repeat - `TypeError: lifecycle.waitForTerminal is not a function` - **product bug / dependency skew** (Tovu test calls a lifecycle API the linked Jini daemon build does not provide).
- Shard 7: bundled-agent-plugin-selection.test.ts › the composed bundled id set is pinned, and no id ships from both content and a package - actual includes extra `commerce`, `formspree`, `google-forms`, `stripe` - **stale test** (or Jini cms dist packaging more plugins); unverified.
- Shard 7: af-cli-characterization.unit.test.ts › web dev CLI attaches to the selected running site and opens its admin URL; › desktop dev CLI builds preload before watching and forwards Electron flags on normal exit - `ERR_MODULE_NOT_FOUND: /tmp/af-cli-*/development/scripts/compose-bundled-agent-plugins.mjs imported from .../dev.mjs` - **stale test** (test copies a fixed subset of scripts into a temp dir; dev.mjs now imports an extra script).

## 3. Type/lint errors
Not applicable (no tsc/lint run in this job).

## 5. Did not run
- Skips (all by the tests themselves): running as root so chmod-based permission tests skip (shard 1: 676, 2083, 2084, 3252, 3257, 3280, 3281; shard 4: writeFileAtomic blocked write INV-04, plus 2068 "a supplied local repro ZIP passes inventory and secret scanning" and an MCP step "no vault-backed MCP fake"; shard 7: SKILL.md unreadable (root bypasses chmod), 2 unreadable-live-file tests, 3 "no unadopted copy of tovu-dev / tovu-com / starter-theme-check on this machine").
- Nothing timed out or was cancelled (cancelled 0 in all shards). Every file in each shard list started.
- Not independent: the other shards (2, 3, 5, 6, 8+) belong to other lanes; shard 2/3 raw files appeared in the directory but were not touched.
- Raw files: /home/user/Tovu/cloud/reports/raw/tovu-web-shard{1,4,7}.{tap,spec,stdout}.txt and tovu-web-shard{1,4,7}-summary.txt.
