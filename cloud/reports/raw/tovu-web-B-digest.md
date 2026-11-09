# tovu-web-B digest (shards 2, 5, 8; node:test; Node 24)

| shard | exit | files (run / file-level not-ok) | tests pass / fail / skip / todo / cancelled | duration (s) |
|---|---|---|---|---|
| 2 | 1 | 384 / 5 (serve-export-teardown, tool-registrations.postgres, vault-read-parity.postgres, init-site.postgres, open-site-store.postgres) | 4095 / 19 / 0 / 0 / 19 (of 4133) | 1878 |
| 5 | 1 | 383 / 1 (runner.postgres.test.ts) | 3907 / 9 / 2 / 0 / 0 (of 3918) | 1722 |
| 8 | 1 | 383 / 0 | 4506 / 21 / 5 / 0 / 0 (of 4532) | 2251 |

All three printed full runner summaries; no timeouts (all well under 3600 s). The runner's "fail" totals differ slightly from the not-ok entries below (suite/file wrappers), so every not-ok is listed.

## Failing tests (paths relative to /home/user/Tovu/apps/website/src)

### Shard 2
- cli/__tests__/integration/serve-export-teardown.integration.test.ts (whole file) — test failed (child died with signal SIGTRAP, exitCode null) — **unclear**: no test-level assertion; file crashed. Likely load/Chromium/native-process related; not determinable without rerun.
- features/api-connections/__tests__/shared-bindings.postgres.test.ts › PostgreSQL persists only the consumer reference across pools; a copied reference cannot grant access — failed to drop fixture database "tovu_shared_oauth_binding_fixture": psql: ... /tmp/.s.PGSQL.5432 No such file or directory — environment (no Postgres)
- features/database-transfer/__tests__/tool-registrations.postgres.test.ts › first copy runs headlessly; replacement waits for Copy; the password never shows — postgres: psql request failed — environment
- ... › Cancel writes nothing, and a used planId is gone — postgres: psql request failed — environment
- ... › the model never passes a connection string: no tool takes one, and the plan asks for the private form first — postgres: psql request failed — environment
- ... › the private form saves a reachable destination, and neither the form, its result nor the log shows the password — postgres: psql request failed — environment
- ... › a malformed or unreachable address is refused in the form, nothing is saved, and the password is never quoted — postgres: psql request failed — environment
- ... › database_transfer_status reports the saved destination, this process's last run and the copy found there — postgres: psql request failed — environment
- features/database-transfer/__tests__/tool-registrations.postgres.test.ts (file) — postgres: psql request failed (pg-test-db.ts:23) — environment
- features/navigation/__tests__/repo.compare-and-set.postgres.test.ts › postgres: two writers on the same base version, B blocked on A's row lock — A lands, B gets the version conflict — failed to drop fixture database "tovu_menu_cas_pg_fixture": psql ... PGSQL.5432 — environment
- ... › postgres: two creates of one id, B blocked on A's uncommitted insert — A lands, B gets the version conflict — same — environment
- platform/db/__tests__/parity/vault-read-parity.postgres.test.ts › vault read parity [postgres] — failed to drop fixture database "tovu_vault_parity": psql ... PGSQL.5432 — environment
- ... › vault hot paths [postgres] — same — environment
- ... (file) — same — environment
- ... CANCELLED subtests ("test did not finish before its parent and was cancelled"), 19 total, all downstream of the above: the transcript covers every golden key and nothing else; site-assistant; personal-execution; media-provider; custom; publish-peer; database-destination; vendor (with the folded publish_credential_sets); source-control; mcp-env (enabled configs); mcp-auth (server views); isolation: a second and an empty workspace see only their own rows; isolation: personal keys stay per principal and per workspace; order: custom-credential and peer lists; order: vendor and source-control lists, defaults first-class; order: MCP server views and enabled configs; vendor group default repository lookup: one LIMIT 1 read on the default index, no group scan; publish compatibility selection: one inventory per kind and one selected row read; MCP server list: statement count does not grow with the number of servers — environment (no Postgres)
- platform/site-dir/__tests__/integration/init-site.postgres.test.ts › a Postgres database holding one foreign table is refused by name, before any folder is made (+ file) — failed to drop fixture database "tovu_init_site_occupied": psql ... PGSQL.5432 — environment
- server/__tests__/assistant-byok-routes.test.ts › /api/admin/v1/assistant/byok-turn sends a metadata note then loads guidance through the real delegated tool surface — Expected values to be strictly deep-equal: actual [{event:'error',payload:{code:'500',message:'stub provider respond() threw'}}] vs expected [] — unclear (likely product bug or stale test: stub provider's respond() throws in the route; same area as shard 8 BYOK failures 3575 / 502-507, suggesting a recent agent-plugin guidance change; not env-related)
- server/__tests__/routes/forms-submit.test.ts › POST /forms/:slug/submit: AC-13 — a honeypot-tripped request returns the identical 201 accepted response — Missing expected rejection (FormRateLimitExceededError). (test line 305) — unclear: test expects the Nth request to hit the rate limit but it did not; possibly test-order/shared in-memory limiter state or timing under load, else stale test/product bug
- server/runtime/composition/__tests__/open-site-store.postgres.test.ts › a failed preparation closes the pool: no session on the site's database survives the rejection — failed to drop fixture database "tovu_open_site_store_failure": psql ... PGSQL.5432 — environment
- ... (file) — The "path" argument must be of type string ... Received undefined (Object.rmSync) — environment (cleanup of an unset fixture path after the Postgres setup failed)
- server/runtime/composition/modules/__tests__/route-modules.unit.test.ts › module 'forms-admin': registers exactly its routes, in order, and nothing else — actual has extra 'GET /api/admin/v1/workspaces/:workspaceId/forms/_providers' — stale test (route exists in server/inbound/admin-http/routes/forms/providers.ts; expected list not updated)

### Shard 5
- assistant/__tests__/mcp-ui-allowlist-completeness.test.ts › every surfaceExchanges.open(...) call names a toolId constant this scan can resolve — actual ['cli/commands/import-local.ts:151: file'] vs expected [] — product bug or stale test (a new surfaceExchanges.open call in cli/commands/import-local.ts:151 is not resolvable by the scan; not env)
- features/deployments/deploy-targets/__tests__/no-vendor-in-core.boundary.test.ts › real core tree has only reviewed pattern exceptions, each with its exact current total — Vendor knowledge belongs in its plugin. Uncovered file/vendor/count pairs: (apps/admin/src/lib/admin-nav-i18n.ts: commerce 22; apps/admin/src/panels.tsx: commerce 4; assistant/host-contracts.ts commerce 1; bundled-catalog.ts commerce/composio/formspree/charts-recharts 1 each; anthropic 100 -> 121; google 13 -> 159; ...) — stale test (reviewed-exceptions allowlist not updated for new vendor mentions) / product boundary drift
- platform/db/migrations/__tests__/commerce-catalog-step.test.ts › [postgres] activation creates exactly the borrowed catalog once without importing historical rows — connect ENOENT /tmp/.s.PGSQL.5432 — environment
- platform/db/migrations/__tests__/runner.postgres.test.ts › two connections migrating at once apply a step exactly once — failed to drop fixture database "tovu_migrations_pg_fixture": psql ... PGSQL.5432 — environment
- ... › the content history through the current head applies on real Postgres — same — environment
- ... › the chat history lands in ai_chat with its own ledger there; public gets no chat table — same — environment
- ... (file) — same — environment
- server/inbound/public-http/routes/commerce/__tests__/settlement.integration.test.ts › [postgres] member purchase settles only from signed paid evidence and survives relay redelivery — connect ENOENT /tmp/.s.PGSQL.5432 — environment
- server/runtime/composition/__tests__/webhook-delivery-worker.shutdown.test.ts › a receiver trickling bytes forever is cut off by the total deadline through the guarded client — actual 'fetch timed out after 60ms: https://example.com' vs expected '.../hooks' (test line 166) — product bug or stale test (the guarded client's timeout message now omits the path; not env)

### Shard 8
- contracts/core/events/__tests__/forms-notification-restart.integration.test.ts › postgres: persisted notifications survive restart, honour 429 delay and stop uncertain resend — failed to drop fixture database "tovu_mail_restart_outcomes": psql ... PGSQL.5432 — environment
- ... › postgres: restart after acceptance before ledger mark does not send twice — "tovu_mail_restart_acceptance" same — environment
- features/agent-plugins/__tests__/unit/bundled-automatic-relevance.unit.test.ts › Auto suggests only relevant bundled plugins: Design a new theme for this site — actual ['tovu-theme'] vs expected ['tovu-theme','ui-ux-design'] — stale test or product bug (ui-ux-design plugin no longer auto-suggested)
- ... › ...: Design a new theme for this site — just tell me which plugins you'd load, don't change anything. — same shape — same
- ... › ...: Deploy this site to Vercel — Expected values to be strictly deep-equal (plugin list mismatch) — same
- ... › ...: Import my old WordPress site — same — same
- ... › ...: Design a theme inspired by Vercel — same — same
- features/api-connections/__tests__/api-connection-slice.test.ts › vertical slice: connect -> public callback -> plugin access token -> form-delivery credential — Invalid URL (new URL at test line 161 showSignIn, called from connect.ts:163) — unclear: test's showSignIn receives a non-absolute URL; could be stale test vs connect.ts change; possibly env var for base URL unset
- ... › security: a form-delivery credential stays on the job's frozen account, for the attempt and for every later request — Invalid URL — same
- (features/... post repo, test #1511) › two connections: a concurrent appendRevision waits for the open one and chai... — failed to drop fixture database "tovu_post_repo_pg_fixture": psql ... PGSQL.5432 — environment
- server/inbound/admin-http/__tests__/dev-auth-boot-owner.unit.test.ts › boot redemption rejects a missing owner before minting a session — actual {code:'INTERNAL_ERROR', error:'The request could not be completed...', errorId} vs expected details.failure {step:'auth-boot-session'} — stale test or product bug (error shape changed to generic internal error)
- ... › boot redemption rejects a disabled owner before minting a session — same — same
- ... › boot redemption rejects a member owner before minting a session — same — same
- ... › boot redemption refuses a minted session that Jini cannot validate before se[tting]... — same — same
- server/inbound/admin-http/__tests__/owner-passkey-http.integration.test.ts › real HTTP/browser TOTP enrollment and passkey registration/login withhold co... — browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1228/... — environment (no Chromium)
- server/inbound/assistant/__tests__/integration/component-catalog-routes.integration.test.ts › the real daemon answers component-catalog search, describe, and a 404 over real HTTP — expected the daemon to start listening, but it exited: [agent-daemon] failed to start standalone daemon requires its site binding — unclear: daemon needs a site binding env/config; could be missing env in this container or a stale test after a daemon startup change
- server/inbound/public-http/routes/site/__tests__/integration/site-title-preservation.integration.test.ts › AC-12 (REQ-07, T-W3): with the definition registered and the pin held open, a pre-existing site renders Tovu Demo Site, never its display name — Express request did not finish (in-process-http.ts:29 timeout) — unclear: possible load-induced timeout (4-core box shared with other lanes) vs real hang; rerun alone to tell
- server/runtime/composition/__tests__/external-mcp-oauth-loopback-wiring.unit.test.ts › ../../../inbound/assistant/agent-daemon-server.ts: desktop accepts a loopback OAuth callback; hosted requires HTTPS — "must have one OAuth ports call; 0 !== 1" — stale test (source scan finds no OAuth ports call in agent-daemon-server.ts; code moved)
- server/runtime/composition/__tests__/process-root-parity.test.ts › daemon dev mode passes bypass in the executor's options bag — ReferenceError: pluginIds is not defined (eval of daemon source, test line ~378) — stale test (daemon source expression now references pluginIds, which the test's evaluation context does not supply; agent-daemon-server.ts:133 shows siteTools.preflight returning pluginIds)
- server/runtime/composition/modules/__tests__/agent-daemon-core-rpc.integration.test.ts › an accepted memory-mode answer reaches CLI launch through the site's attempt authority — actual null vs expected 'cli-session' — unclear (likely same daemon-change family as above; stale test or product bug)
- server/runtime/composition/modules/__tests__/assistant-byok.inputs-pin.test.ts › BYOK repeats pinned guidance while retaining good picks around failures (reported, not fixed) — input did not match /Relevant agent plugins for this request:/ — stale test / product change (prompt no longer includes that header; related to bundled-automatic-relevance failures)

## Type/lint errors
None (test runs only; no tsc/lint was run).

## Root-cause groups
- Environment, no Postgres (/tmp/.s.PGSQL.5432): shard 2 (about 14 tests + 19 cancelled subtests + 4 files), shard 5 (7), shard 8 (3).
- Environment, no Chromium: owner-passkey-http (1).
- Stale/product drift (likely not env): route-modules forms-admin, no-vendor-in-core, mcp-ui-allowlist, webhook-delivery timeout message, dev-auth-boot-owner x4, bundled-automatic-relevance x5, oauth-loopback-wiring, process-root-parity, assistant-byok inputs-pin.
- Unclear: serve-export-teardown (SIGTRAP), assistant-byok-routes, forms-submit AC-13, api-connection-slice x2, component-catalog-routes (site binding), site-title-preservation (timeout, possibly load), agent-daemon-core-rpc.

## Did not run
- Skipped by runner: shard 5: 2, shard 8: 5 (skip reasons not inspected). No timeouts; all files in shard lists were executed.
