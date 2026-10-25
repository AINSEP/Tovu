**Verdict: APPROVE WITH CHANGES**

Reviewer: Opus 5.5 (software-architect skills loaded). Read-only. Trees: Tovu `tovu-integ` HEAD fcaf7e077, Jini `jini-int2` HEAD 877d21fd (0.6.11 versioned), member sign-in `tovu-signin` HEAD 15999a6ac (7 commits not yet in tovu-integ, merge-base e0d811ab0).
`T` = tovu-integ/apps/website/src, `B` = T/server/runtime/boot, `M` = jini-int2/packages/platform/src/mail.

The direction is right: extend `@jini-ai/platform/mail`, no new package, Tovu keeps the catalog, account-token binding, SQL, migrations, UI and routes. The plan checks out against the code on its main points. Jini already has the registry, policy, ports, purpose gate and SMTP. `readMailDomain` retries only on `forbidden` (B/mail-domain-read.ts:9-25). `domainReadConnection` exists only on Tovu's adapter type (T/platform/mail/adapter-module.ts:23), not on Jini's (M/adapter-module.ts:22-24). Resend declares it (content/agent-plugins/resend/adapters/resend.mjs:173). But the plan was written against a tree that does not have member sign-in yet, and it moves more than it needs to.

## Binding changes

1. **Baseline AFTER member sign-in merges into tovu-integ, not just after 0.6.11.** fix/member-signin edits the files this plan moves:
   - B/resolve-mailer.ts:1-2, 424-427: redacted `ToolInputError` for domain requirements
   - B/sender-domain-verification.ts:39-44: redacted `unknown` reason
   - B/mail-provider-catalog.ts:183-200: `safeResult`/`safeCall` scrubbing
   - new T/platform/mail/provider-error.ts
   - migration 0033 `mail_activity_attempts.message`
   - features/mail/{activity,attempts,capture}.repo.ts (capture redaction for sign-in mail)
   - features/domain-dns/mail-dns-status.ts
   - resend lib/{domains,errors}.mjs

   Shard 1 records SHAs only once fix/member-signin is merged. From shard 2 until shard 8 lands, those Tovu files are frozen (no edits). Shard 8 starts with `git diff <recorded-sha> -- <moved files>`, which must be empty; anything that shows up gets ported to Jini first.
2. **Move the sign-in redaction with the code that uses it.** `safeMailProviderText` and `credentialSecrets` (T/platform/mail/provider-error.ts) only import `redactSecrets` from `@jini-ai/core`, so they are generic. They go into `M/provider-error.ts`. Jini's domain-read, sender-verdict and resolver code must produce byte-identical redacted text and still throw `ToolInputError`. Tovu's provider-error.ts becomes a re-export, because `createProviderMailer` (which stays in Tovu) still uses it. Otherwise sign-in's "mask secret-shaped URL params" fix (9505ecb65) would silently fall out of the moved paths.
3. **Keep the `ResolvedMailer` surface identical** (B/resolve-mailer.ts:133-158: `mailer, ready, settle, status, describeProviders, invalidate, laneReady, senderDomainVerification, checkProvider, domainRequirements`). Sign-in's settings service calls `mailProviderControl.invalidate()` on every `core.mail` write, so a cleared provider stops sign-ins at once (signin: settings/shared.ts:168-176). The only Tovu caller is T/server/runtime/composition/site-mailer.ts:86, and B/resolve-mailer.ts becomes a thin binding to Jini. The new Jini entry takes `(required, optional)`. Today's `createResolvedMailer(deps)` takes one object (B/resolve-mailer.ts:219).
4. **Do NOT "replace the cross-ABI casts" or touch T/platform/http/{client,index}.ts.** Plugins call Tovu's positional HTTP shape `httpClient.send(request)` (resend.mjs:120, Tovu port T/platform/http/ports.ts:11). Jini's is `send({ request })` (jini core/src/primitives/http.ts:62). domains.mjs:58 sends `{ request, ...request }` to work with both. If Resend's kit got a Jini-shaped client, Resend sends would break. Jini's engine never calls `httpClient` itself; it only passes it through to the provider. Keep the existing casts byte-identical at the Tovu binding (B/resolve-mailer.ts:418, B/sender-domain-verification.ts:41, B/mail-provider-catalog.ts:201). Mail-port shape conversion reuses `toJiniMailer`/`toTovuMailer` (T/platform/mail/purpose-scoped-mailer.ts:20-36). No new adapters, and no plugin file changes.
5. **Sign-in's resend rule stays in Tovu, injected.** `resendPolicyFor` (B/mail-delivery-policy.ts:50-54: `module === "members"` gives `never`) is product logic. The Jini wrapper takes `resendPolicy` as a port. `MailTestModeSetting` (Tovu settings) becomes a structural Jini type with the same fields.
6. **No new option on `createPolicyMailer`.** It has no callers outside its own test (grep across Jini and Tovu: only M/policy.ts, M/index.ts, M/__tests__/policy.test.ts). The moved wrapper keeps its own 4-line `:index` loop (B/mail-delivery-policy.ts:112-117). Leave `createPolicyMailer` alone. Its shared-key batch (M/policy.ts:186-200) is a separate follow-up, so behavior does not change silently.
7. **Purpose-gate probe: export the gate's own predicate instead of moving the discarding-mailer probe.** Today's probe string-matches `MAILER_SEND_REFUSED_NO_DURABLE_PATH` (T/platform/mail/purpose-gate-probe.ts:16, 38-40). Jini already decides this in `checkGate` (M/purpose-scoped-mailer.ts:44). Export it as `isPurposeGateOpen(required)`. Tovu's probe becomes a 3-line call with the same true/false/throw outcomes.
8. **Domain check through the plugin's declared key.** The only Jini contract change is optional `domainReadConnection?: { serverId; baseUrl }` on M/adapter-module.ts `MailAdapterModule`, plus `readMailDomain` moved unchanged. The https-only origin check and the account lookup (B/mail-provider-catalog.ts:166-180) stay in Tovu, as does the OAuth refusal (B/mail-plugin-account-token.ts:12-26). The plan agrees; keep it that narrow.
9. **CCN and arg shape on arrival.** `createResolvedMailer` is a ~190-line closure factory (B/resolve-mailer.ts:219-410). In Jini it must pass `pnpm complexity:strict` (eslint `complexity` 10 plus `sonarjs/cognitive-complexity` 10, jini package.json:20). Split it into named units without reordering any await (fingerprint before decrypt, invalidation generation, single-flight).
10. **Release gate and Windows.** Per standing owner rule, the release gate is the published-package typecheck. Drop "install packed packages into a Tovu validation checkout" and any local Docker. Moved code is pure TS with no `node:fs`/`node:path`/process calls (enforce that in review), so Windows needs nothing beyond existing CI.

## Cut list

- **Shard 7 entirely.** Moving activity-read, capture-read and suppression-admin contracts into Jini, and repointing features/mail/*.repo.ts, is churn: no Jini code consumes those interfaces. Sign-in just changed exactly these repos (0033 `message`, capture redaction). The Jini wrapper's `observe` port is structural, so Tovu's `createMailAttemptObserver` already satisfies it. This also removes the SQLite/PG dialect suites from the run.
- **From shard 2:** the persistence/observation "missing contracts", host `use` vocabulary, and body-free activity fixtures.
- **From shard 1:** `spec.md` and `adr.md`. This review plus the plan is the spec. Keep the parity test, plus a 3-line ownership note in SURVEY.md at the end of shard 8.
- **From shard 5:** `mail-provider-configuration.ts`. It is Tovu's DTO over `CustomCredentialSetRecord` and Tovu labels (B/mail-provider-configuration.ts:1-5). Keep it in Tovu and inject it as a `describeProviders` port.
- **From shard 8:** T/platform/http/{client,index}.ts and "adapt plugin create/domain HTTP calls" (see change 4).
- **The `key:index` opt-in flag** on the existing decorator (change 6).
- **The shard-4 move of purpose-gate-probe.ts** (replaced by the export in change 7).

## Corrected build order (Codex shards; Codex runs no tests; the central cloud run executes the listed commands)

`G0 sign-in merged + 0.6.11 published → 1 → 2 → (3 ∥ 4) → 5 → 6 (publish 0.6.12) → 8`

1. **Parity freeze (Tovu, no publish).** Files: `B/__tests__/mail-engine-parity.unit.test.ts`; record SHAs in SURVEY.md. Golden outputs from the post-sign-in tree, covering:
   - status DTO
   - redacted errors
   - batch keys
   - approval-drift refusal
   - capture refusal
   - forbidden-only fallback

   Test: `node --import tsx --test --test-concurrency=1 apps/website/src/server/runtime/boot/__tests__/{mail-engine-parity,resolve-mailer,resolve-mailer-lifecycle,mail-delivery-policy,mail-status-cache,mail-plugin-account-token}.unit.test.ts apps/website/src/server/runtime/boot/__tests__/sender-domain-verification.test.ts`
2. **Jini contracts (no publish).** Files: `M/{adapter-module,ports,types,provider-error}.ts`, `M/__tests__/{engine-contracts,provider-error}.test.ts`. Contents: `domainReadConnection?`, neutral credential-fact/status types, test-mode and approval types, redaction helpers.
   Test: `pnpm --filter @jini-ai/platform exec vitest run --maxWorkers=2 src/mail`
3. **Jini domain checks.** Files: `M/{domain-read,sender-domain-verification}.ts` plus tests. Same test command.
4. **Jini delivery wrapper and gate predicate** (parallel with 3; no file overlap). Files: `M/{delivery-wrapper,purpose-scoped-mailer}.ts` plus tests. `policy.ts` is untouched. Same test command.
5. **Jini resolver and status cache.** Files: `M/{resolve-mailer,mail-status-cache}.ts` plus tests, ported from the Tovu suites (lifecycle, rotation, invalidation, single-flight, TTL, failed-send precedence).
   Test: same command, plus `pnpm --filter @jini-ai/platform typecheck && pnpm complexity:strict && pnpm guard`
6. **Export, changeset, publish 0.6.12** (serial; Jini publish). Files: `M/index.ts`, `.changeset/mail-engine-extraction.md`, `CAPABILITIES.md`, `packages/platform/source-map.md`. Gate: the published-package typecheck. Publish and tag are gated in the dispatch.
7. **Cut.**
8. **Tovu cutover** (needs published 0.6.12; one landing unit). Files: `package.json`, `package-lock.json`, `B/{resolve-mailer,mail-domain-read,sender-domain-verification,mail-delivery-policy,mail-status-cache}.ts` as thin bindings, `T/platform/mail/{adapter-module,provider-error,purpose-gate-probe,sender-domain-verification,mail-status}.ts` as re-exports, `B/__tests__/mail-engine-adoption.unit.test.ts`, SURVEY.md. Then `npm run link:jini` per standing rule.
   Test (central): the shard-1 command, plus
   - `node --import tsx --test --test-concurrency=1 "apps/website/src/features/mail-status/**/*.test.ts" "apps/website/src/features/domain-dns/__tests__/mail-dns-status.test.ts" "apps/website/src/features/members/**/*.test.ts" "apps/website/src/server/__tests__/routes/member*.test.ts" "apps/website/src/server/__tests__/routes/members-public*.test.ts" "apps/website/src/server/inbound/admin-http/routes/settings/__tests__/mail-cache-invalidation.unit.test.ts" "content/agent-plugins/resend/__tests__/*.test.mjs"`
   - then PR CI typecheck

   Sign-in tests are in the set on purpose: the cutover must not change auth mail.

No broken middle: Tovu is untouched until 8, and rollback is reverting 8 plus the lockfile. No migrations.

## Owner questions

None. Two coordinator notes:
- Shard 6 needs a publish gate in its dispatch. Agents may publish per standing rule, but name it.
- The `createPolicyMailer` shared-key batch bug (change 6) is a separate one-line follow-up. Mention it; don't fold it in.
