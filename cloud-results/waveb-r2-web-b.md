# Wave-B R2 web-b: second half of web-fail-files.txt (lines 57..end, sorted)

Branch `fix/wave-b-r2-web-b` (Tovu), based on `integ/wave-b-fixed` b28d38c6. Root `tsc --noEmit` = **0 errors** (was 1: form-submissions.ts:53). `tsconfig.tests.json` 123 errors (report said 142; none added).
Re-run of the 53 non-ENV files in scope: **all pass except 8 files, listed below** (before: 4 batches, 150 failing subtests; after: 13).
Runner: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=1 <files>`.

## Root causes fixed (SHA)
| root cause | where | fix |
|---|---|---|
| `createFormDestinationPort.loadRegistry` still `(workspaceId)` while the composition loader is `({ workspaceId })` | features/form-destinations/port.ts | port now object args (3f4729c8) |
| Jini `createOtelObservabilityPort` requires `{ helpers }` (errorType/redaction) -> `Cannot destructure 'errorType'` x27 | otel-sdk.ts fixture | fixture passes the helpers like Jini's own adapter (828e13cb) |
| `/me` registrar takes `{ app, deps }`, harness called `(app, deps)` -> `memberSessionRepo` of undefined x28 | member-password-auth.test | 8496a5e6 |
| list-cursor pattern: lists return `{ items, nextCursor }` (members route + `memberRepo.list`, trash member repo) | members-auth, member-oidc-*, trash member-adapter | 3ece3c04, d25ce635, 02473a20 |
| `resolveMcpJsonInjection({ daemonUrl, mintRunCredential })` object args -> `mintRunCredential is not a function` x11 | typed-tools integration fixture | 5936f9c1 |
| Jini hosted sign-in hands the same-origin PATH, not an absolute URL -> `Invalid URL` x15 | api-connections starting-browser | 5e9b2fcd |
| object-arg contracts: seo `transaction({ fn })`, publish-content `references({ entity })` / `inspect({ id })`, `moveToTrashOutcomeToError({...})`, tool `ctx.signal`, `sendMail({ mail })`, store `grant({ key, grantedAt })`, `waitForTerminal`, `wrap({ registration })`, `exitDaemon({ exitCode })` | seo, settings, theme, trash, mail, assistant tests | c6fb97b9, 02473a20, 3c5c4ea1, 3805cfeb, 3c03e497, 2fe9190d |
| Jini log-safety (bc545d4d, 8378f80d, 44ae8070): log lines/outbox errors are class-only, originals go to the host sink | webhooks tick, plugin host/runtime warnings, forms flash cookie, notify mail log, workspace outbox lastError, delegated-transport 500 wording | assertions updated to the new fixed wording (and now also assert the secret message is absent): 70412c1f, f078506b, 724dbb00, 34e8eb52, 47dd1347, 8aaed6d5 |
| migration 0042 (version columns, lost-update) | migrated-copy ledger 44, read-only fixture, share-database rows, historical workspaces fixture, forms authoring PUT bumps version | edb5f4ec, 47dd1347, 724dbb00 |
| chat 0000/0001 historical hash pins changed by wave B import-only type rewrite (1be21a4f; SQL untouched) | chat-package-adoption.sources.json | repinned, comment cites the commit (edb5f4ec) |
| forms client IP is normalized (`127.0.0.1`, no `::ffff:`) so the direct limiter call used another bucket | forms-submit | 724dbb00 |
| anonymous boot failures disclose only approved copy + errorId (no `details`) | dev-auth-boot-owner | asserts the contract instead of `details.failure` (4fff8979) |
| route inventory gained `GET /forms/_providers`; OAuth ports wiring no longer in agent-daemon-server (same on terra); notify subscriber now registers async and plans durable outbox jobs; `pluginIds` in run call | route-modules, external-mcp-oauth wiring, sqlite-create-site identity, process-root-parity | 3c03e497, e1d94f40, 7b6122d2, 2fe9190d |
| Jini 3665df68: a fresh query's top plugin is delivered in full, the "Relevant agent plugins" note is only for the rest | assistant-byok-routes, assistant-byok.inputs-pin | tests assert the new delivery (explicit-read coverage kept) (d899026d) |
| vault L005 catalog case lacked `provider` so it hit the earlier "no provider" guard | vault-l005 | add provider: 'host' (f078506b) |
| **real product bug**: Jini `EntityNotLiveError` now extends `ToolInputError`, so SEO PUT answered 400 instead of 409 ENTITY_IN_TRASH | seo/put-entry.ts error ladder | liveness check moved first; failing test proves it (d11aa414). Other ladders already had it first. |

## Left (8 files) and why
1. **form-delivery.security / form-delivery-vertical-slice / form-delivery-oauth (6 subtests) - needs a JINI change.** `@jini-ai/infra` outbox worker (worker.ts:135) now stores `describeErrorForLog(err)` = `"Error"` as the outbox `lastError`, so the allowlisted codes `authorization-required` / `rate-limited` / `delivery-failed` that `FormDeliveryError` carries never reach the ledger and every status reads `delivery-failed`. Real regression (user-visible form delivery status); Tovu only receives the already-flattened string, so it cannot fix it. Fix in Jini: register the `FormDeliveryError` class/codes in a describer the worker uses, or let hosts supply `describeError` to the worker.
2. **admin-local-boot-session-route, agent-plugin-set-enabled.integration, browser-provider.integration (5 subtests) - charts-recharts pin.** Jini provider-plugins is 0.7.1 (8f0a2f65); Tovu pins 0.7.0 + the integrity map (charts-recharts-source.ts) and `recharts-package-pin.unit.test.ts` fails the same way. `client/provider.js` bytes differ (+ licenses), so the unreviewed browser bundle must be re-reviewed/re-pinned by a human against the PUBLISHED 0.7.1 build. Not done unattended (trust pin). The two boot tests only fail on the extra `[plugin-runtime] bundled initialization failed` warning it causes.
3. **agent-daemon-core-rpc.integration (1)** - test-root wiring: `createRouteDeps()` (app.ts:1303) uses an in-memory `agentSessions` map, but Jini's durable `captureSession` now writes the conversation locator itself into the in-memory sqlite chat DB (verified: write logged, `getSessionId` null). Production deps.ts shares one `chat` kernel so it is consistent. Fix is to let `createInMemoryChatHistory` also return an `agentSessions` over its kernel; it needs FK-safe handling because existing tests set sessions for non-existent chats, so left rather than risk siblings.
4. **app-federation-reload.observability (1)** - nothing registers an `"agent-daemon"` roster listener any more (same on `refactor/terra`), so no `POST /api/federation/reload` is sent. Needs an owner decision: restore the listener or delete the obsolete test.

ENV files in scope (not run): playwright-browser, owner-passkey-http, render-form-layout.
