# build-provfix REPORT — 2026-10-21 (branch cloud/build-provfix-2026-10-21 in Tovu + Jini)
Base: Tovu e0c935bb, Jini b3c4144b. Run 16:43–21:10Z (paused ~17:40–19:54 on a usage limit; owner extended the stop to 22:00Z). 3 subagents used (all opus). No review subagents.

## ITEM 3 — shared provider registry: DONE (priority) — Jini ddc1e606
- `@jini-ai/core/provider-registry` (also exported from the core root): `createProviderRegistry<T>({contract},{defaultProviderId?,validate?,seed?})` with register/contribute/get/has/list/getDefault/refusals, frozen entries, id grammar `^[a-z][a-z0-9_]{0,63}$`.
- Core registrations THROW `ProviderRegistryError`. Plugin `contribute()` never throws: a broken, duplicate or contract-mismatched contribution goes to `refusals()`. If core later registers an id a plugin already holds, core takes the id and records a `displaced_by_core` refusal.
- Shared types next to it: `ProviderResult<T>` (ok/rejected/unknown, with named codes) plus the `providerOk/Rejected/Unknown` constructors, `ProviderContext` {workspaceId, siteId?, providerAccountId?, mode test|live}, and `DomainRequirement` (purpose mail|site|tls, plus records). They live in core, not devops/dns.
- `defineProviderContribution()` and `contributeProviders()` are in `@jini-ai/agent-plugins/lifecycle`. They are not in core because core cannot import agent-plugins: agent-plugins already depends on core, so it would be a cycle. The wrapper is built on `defineExecutablePluginContribution` and checks the id before importing the module.
- The frozen contract and the migration notes are in `packages/core/docs/provider-registry.md`. CAPABILITIES.md and both CHANGELOGs (Unreleased) are updated.
- Tests: core 1239/1239, agent-plugins 1171 pass (+2 skipped, same as before). Typecheck clean.
- Coverage: provider-registry.ts and provider-contribution.ts are both 100/100/100.
- Checks: check-engine-boundaries, subpath-isolation, peer-ranges, package-layers and extensionless-imports are green. `pnpm guard` fails its self-test on the UNMODIFIED baseline too, and check-hardwiring reports 3 hits in packages/ui; both were already failing before this build.
- Release note: agent-plugins' `./lifecycle` now imports `@jini-ai/core/provider-registry`. Its core peer range (`^0.4.3`) must be raised once core 0.4.9 ships, or a host on core 0.4.8 will break.

### Migrating the 4 existing registries (not done, per instructions)
- Blocker for all four: they use hyphenated ids, and visitor-auth also allows dots. The frozen grammar allows only `_`. Each needs an id decision first (a `-`→`_` alias versus keeping a seam-local legacy grammar).
1. **media VendorAdapterRegistry**: keys are (providerId, routeKey). Use one registry per route key, or `T = Record<route, adapter>`. Builtins move to `seed`; drop the deprecated lazy singleton and build once at composition; plugin vendors use `contract:'media'`.
2. **visitor-auth**: the closest fit. `validatedCopy` becomes `validate`, and the error code `duplicate-provider` maps to `duplicate`.
3. **OAuthProviderRegistry**: today `register` silently replaces a duplicate and `get` throws. Keep a thin wrapper whose `get` throws `OAuthError` on undefined and that keeps `structuredClone`. Plugin providers there are descriptor-only (data), so they need a data contribution before `contribute`.
4. **commerce payments**: `refund`/capability checks become `validate`, and `get` returns undefined instead of null. Its local ProviderContext extends core's, and `PaymentError` maps onto ProviderResult. The ids are URL segments and env-var fragments (ADR-026 grammar), so this one comes last, after the commerce build that is in progress lands.

## ITEM 1 — mail sender identity: DONE — Tovu 9ea45028, c25f08ff (fixture follow-up), coverage tests 181e8c5b
- One resolver, `platform/mail/sender-identity.ts` (`createMailSenderIdentityResolver`), now used by members/write-service, newsletter/confirmation and composition/modules/forms.
- New ledger settings `core.mail.senderEmail` and `core.mail.senderName` (`features/settings/mail-sender.ts`). They are workspace-scoped (in Tovu a workspace is a site), default to empty, and need no schema change.
- Resolution order: a configured sender wins. With no sender, Console/memory mailers keep `*.local`. Any other mailer, including an unknown driver, throws `SenderIdentityNotConfiguredError` (code `mail_sender_not_configured`). The resolver waits for the boot-time mailer swap before it checks.
- Newsletter confirmations now send with `purpose:'transactional'` and `lane:'interactive'`.
- Tests: 172 targeted pass. The wider set ran 2095 tests with 29 failures: 20 were Postgres-only and 9 were outdated test fakes; after fixing the fakes those 67/67 pass.

## ITEM 2 — webhook delivery worker: DONE — Tovu e246de16
- New `composition/webhook-delivery-worker.ts`. `createServingApp` starts it, and both index.ts and `tovu serve` stop it at shutdown and in failure cleanup. Interval 15 s by default and injectable.
- One tick at a time: a tick that finds the previous one still running does nothing.
- Stop waits up to 1 s for a running tick.
- Errors log only name, message (URLs scrubbed, capped at 200 chars) and code.
- Outbound requests use a guarded client: https only, no private addresses, no redirects.
- Also fixed: the fan-out stored payloads in a private in-memory store the worker could never read. Both halves now share one envelope store.
- capability-inventory is updated.
- Tests: 14+1 new, 54 related pass.

## Coverage follow-up (commits 23eb23b0, 5b6eb364, 10c05373, becbc5cb, 5a4ee740); 17 new tests, none deleted or weakened
- 100/100/100: sender-identity.ts, mail-sender.ts, confirmation.ts, forms.ts, write-service.ts, both tool-registrations.ts, settings/index.ts, all 4 route deps.ts files, webhook-delivery-worker.ts, integrations.ts, serving-app.ts, capability-inventory.ts.
- serve.ts: 100/98.48/100. The one uncovered branch, `TOVU_STOP_ON_STDIN_EOF==="1"`, would need the real stdin and so a spawned-process test.
- app.ts (74/81/50) and deps.ts (95/71/54) are giant composition roots. They were not raised, but every line these commits added was confirmed executed.
- index.ts cannot be imported by a test by design; a source-reading test checks that it stops the worker.
- Typecheck: no new errors. tsconfig.tests.json had 135 error lines before and still has 135.

## LOCAL-RUN NEEDED
- Postgres: database-transfer tests, create-site-route-deps.postgres.test.ts, boot-site-dir.postgres.test.ts.
- Real boot (`tovu serve` and `npm run dev`): a webhook reaches an https receiver within about 15 s, and Ctrl-C shuts down cleanly.
- A real Resend/SMTP send with `core.mail.senderEmail` set, and with it empty (expect the named error).
- Spawned-process test for the serve stdin-EOF branch.

## Owner questions
1. The webhook worker now runs in every mode, while webhook routes are still blocked in production (REQ-07), so existing production subscriptions will now be delivered. Should the worker be gated in production too?
2. Deliveries left in `delivering` by a crash or shutdown are never reclaimed (`claimPending` only picks up pending rows). This was already true; should we add a stale-claim sweep?
3. The egress policy refuses http and localhost receivers, so local-dev webhooks retry until dead. Is that intended?
4. `core.mail.*` has no admin UI and no address validation. Add both? Should these settings be in PUBLISHABLE_SETTINGS?
5. Newsletter confirmations on the interactive lane now skip the durable-outbox check in production (before this they were refused). Is that OK?
6. With a real provider and no sender configured, sign-in and subscribe now return an error, the same for every address. Is that OK? And when only the address is set, should the display name default to the site title?
7. The four registries need the provider-id grammar decision above.
- Hygiene: Tovu tests leave an untracked `chat.db` at the repo root. It needs a gitignore rule or a test fix.
