Software Architect(Direct): Selected Software Architect for the package boundary, behavior-preserving extraction, and release sequencing.

**1. What exists**

Paths below use `T` = Tovu clone, `J` = Jini clone; `M` = `J/packages/platform/src/mail`, `B` = `T/apps/website/src/server/runtime/boot`. Brace lists name exact files.

- **The basic engine is already in Jini.** Reuse its [provider registry and contract](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/provider.ts:56), [mailer/ledger/suppression/capture ports](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/ports.ts:12), [delivery policy](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/policy.ts:161), [feedback ingest exports](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/index.ts:15), and [injected SMTP transport](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/smtp.ts:7).
- `ProviderRejectedCode` already includes `forbidden`: [core/provider-registry.ts:193](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/core/src/provider-registry.ts:193). No new rejection taxonomy is needed.
- **Remaining runtime ownership is Tovu’s resolver:** explicit lane selection, credential rotation, concurrent resolution, invalidation, cached status and domain requirements: [resolve-mailer.ts:219](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/runtime/boot/resolve-mailer.ts:219).
- Its catalog combines Jini built-ins with trusted plugin contributions and Tovu credential labels: [mail-provider-catalog.ts:113](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/runtime/boot/mail-provider-catalog.ts:113). Keep this host assembly; inject its catalog into Jini.
- **Do not substitute Jini’s existing policy decorator unchanged.** Tovu adds fresh test-mode reads, approval checking, persistent provider limiters, activity observation and indexed batch keys: [mail-delivery-policy.ts:71](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/runtime/boot/mail-delivery-policy.ts:71). Jini’s current decorator keeps different batch-key behavior: [policy.ts:186](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/platform/src/mail/policy.ts:186).
- Domain fallback already exists: sending key first, one account-key retry **only for `rejected/forbidden`**: [mail-domain-read.ts:16](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/runtime/boot/mail-domain-read.ts:16). Jini’s adapter contract lacks Tovu’s optional `domainReadConnection`.
- The host account binding enforces workspace, plugin ownership, enabled state and static credentials: [mail-plugin-account-token.ts:12](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/server/runtime/boot/mail-plugin-account-token.ts:12). It stays in Tovu.
- Vendor domain reads and restricted-key normalization already belong to the Resend plugin: [domains.mjs:22](/Users/la/Programming/tovu-integration-clones/tovu-integ/content/agent-plugins/resend/lib/domains.mjs:22); its account connection is [declared here](/Users/la/Programming/tovu-integration-clones/tovu-integ/content/agent-plugins/resend/adapters/resend.mjs:173).
- SQL adapters already implement Jini’s ledger/capture contracts. Activity and suppression-administration contracts remain embedded in [activity.repo.ts:25](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/features/mail/activity.repo.ts:25) and [suppression-admin.repo.ts:15](/Users/la/Programming/tovu-integration-clones/tovu-integ/apps/website/src/features/mail/suppression-admin.repo.ts:15).
- The [deferred extraction note](/Users/la/Programming/tovu-integration-clones/tovu-integ/ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md:3) explicitly preserves credential isolation and requires package publication/adoption.

Read-only inspection; no tests executed. Graph MCP was unavailable; the local Jini graph predates these mail changes. Architecture chapters 13/14 were read from the canonical Tovu checkout because they are absent from this clone.

**2. Design**

- Extend **`@jini-ai/platform/mail`**, with its existing registry and policy as owners. No new package, registry, container or delivery lifecycle.
- Jini owns the remaining generic resolver, status cache, safe provider projection, dynamic delivery wrapper, purpose-gate probe, sender-domain verdict and permission-only domain-read fallback.
- Inject ports for catalog loading, settings, credential resolution/metadata, guarded HTTP, clocks, diagnostics and observation. Keep Tovu’s labels, category, recovery wording and credential-error translation in host adapters.
- Credential fingerprints remain exactly `id:vaultRevision:updatedAt`; metadata reads never decrypt. Preserve fingerprint-before-key resolution, invalidation generations, single-flight behavior and cached-provider behavior during metadata-store faults.
- Move activity/read, observation, capture-read and suppression-admin **contracts**, preserving their shapes. Keep SQL, transactions, retention, cursor semantics and migration history in Tovu.
- Activity `use` is host vocabulary: Jini permits a host-specified string type; Tovu retains its existing union and idempotency-prefix classifier.
- Extend the existing policy decorator only enough for the dynamic wrapper to reuse its dispatch loop. Tovu opts into `key:index`; existing Jini callers retain their current default.
- Keep Tovu’s sign-in resend decision injected. Preserve approval comparison, suppression/order/hash semantics, capture refusal, sequential batches and observation-failure handling.
- Each plugin implements its domain HTTP calls and declares its read-account connection. Jini invokes that contract without vendor branches.
- Preserve sending-key-first behavior. Retry once only on `forbidden`; never retry invalid credentials, missing domains, timeouts or network failures with the account key.
- The replacement credential uses the plugin-declared HTTPS origin. It never enters the sending mailer. Tovu continues enforcing ownership and refusing OAuth MCP tokens.
- Preserve both plugin mail/HTTP ABIs through host adapters. Jini receives correctly shaped ports; replace the current cross-ABI casts at that boundary.
- `features/mail-status` retains permissions, confirmations, owner checks, test-message content, readiness-by-product-use, tools and routes. `mail-dns-status.ts` retains DNS planning, projection and tracking; consume Jini’s provider verdict through its port.
- New Jini boundaries use `(requiredObj, optionalObj = {})`; dependencies are ports. Changed functions must meet CCN ≤ 10 without changing execution order.
- No credential re-entry, setting changes, route changes or database migration. Any subsequently discovered schema requirement returns through ADR-066 TypeScript migrations.

**3. Codex build shards, with tests**

**1 — Freeze the contract before moving code.**
Files: `T/ADS-memory/reports/mail-engine-extraction/spec.md`, `adr.md`; `B/__tests__/mail-engine-parity.unit.test.ts`.
Record source SHAs after the active 0.6.11 release settles; revise the ADR-037 ownership record through Coordinator.
Tests: reuse existing resolver/lifecycle/policy suites; add only missing deterministic parity cases. Freeze serialized results, messages, headers, hashes, keys and ordered effects. No production runtime changes.

**2 — Jini contract foundation. Depends on 1; no publish yet.**
Files: `M/{ports,types,adapter-module,provider}.ts`; `M/__tests__/engine-contracts.test.ts`.
Add the optional domain-read declaration, neutral catalog/credential facts, status/verdict types, approval/test-mode types and missing persistence/observation contracts. Retain existing exports and signatures.
Tests: existing provider validation plus old-adapter compatibility, optional declaration, host activity vocabulary and body-free activity contract fixtures.

**3 — Jini domain checks. Depends on 2.**
Files: `M/{domain-read,sender-domain-verification}.ts`; `M/__tests__/{domain-read,sender-domain-verification}.test.ts`.
Move the existing fallback and sender-verdict behavior onto ports; retain separate status and requirements reads and existing deadlines.
Tests: every verdict; successful first read; forbidden fallback; absent/failing account lookup; no fallback for unauthorized/not-found/unknown; unchanged sending context; exact timeout and safe-error outputs.

**4 — Jini delivery wrapper and readiness probe. Depends on 2; parallel with 3.**
Files: `M/{policy,delivery-wrapper,purpose-gate-probe}.ts`; `M/__tests__/{policy,delivery-wrapper,purpose-gate-probe}.test.ts`.
Move the wrapper around the existing policy; share the existing decorator loop. Move the probe by continuing to call the real purpose gate.
Tests: indexed batch keys and ordered partial results; dynamic test mode; approval drift; capture without sink; shared limiter lifetime; injected resend policy; observer/logger faults; unchanged existing decorator defaults; probe performs no delivery.

**5 — Jini resolver and status. Depends on 3; may overlap the remainder of 4.**
Files: `M/{resolve-mailer,mail-status-cache,mail-provider-configuration}.ts`; `M/__tests__/{resolve-mailer,resolve-mailer-lifecycle,mail-status-cache,mail-provider-configuration}.test.ts`.
Extract the existing resolver, cache and projection against shard-2 ports. Host-supplied facts/copy replace Tovu imports.
Tests: first boot remains unconfigured despite saved keys; local/production behavior; key rotation/deletion; concurrent resolution/invalidation; metadata-store faults; TTL/refresh limits; safe DTOs; failed-send precedence; workspace-scoped requirements; byte parity.

**6 — Integrate exports and release 0.6.12. Depends on 3–5; serial release ownership.**
Files: `M/index.ts`; `J/.changeset/mail-engine-extraction.md`; `J/CAPABILITIES.md`; `J/packages/platform/source-map.md`.
Use the existing fixed-release tooling for generated manifest/changelog/lock updates; no parallel shard edits release metadata.
Tests: platform mail suite, typecheck, boundary guard, strict complexity and packed-export validation; install packed packages into a Tovu validation checkout.
Publish the tested release set as **0.6.12**, after 0.6.11. Confirm registry exports before Tovu adopts them.

**7 — Tovu repository contract adoption. Requires published 0.6.12 and dependency adoption in 8.**
Files: `T/apps/website/src/features/mail/{activity.repo,attempts.repo,capture.repo,suppression-admin.repo,index}.ts`.
Replace locally owned generic interfaces with Jini imports/re-exports. Preserve host use classification and every SQL statement.
Tests: existing repository dialect suites on SQLite and PostgreSQL/PGlite; concurrent reserve/reclaim; activity feedback precedence; body exclusion; suppression revision/audit atomicity; capture round-trip.
No new migration; existing migration checksums must remain unchanged.

**8 — Tovu runtime cutover. Requires published 0.6.12.**
Files: `T/{package.json,package-lock.json}`;
`B/{resolve-mailer,mail-provider-catalog,mail-domain-read,sender-domain-verification,mail-delivery-policy,mail-provider-configuration,mail-status-cache}.ts`;
`T/apps/website/src/platform/mail/{ports,adapter-module,mail-status,sender-domain-verification,purpose-gate-probe}.ts`;
`T/apps/website/src/features/agent-plugins/mail-adapter-registry.ts`;
`T/apps/website/src/platform/http/{client,index}.ts`;
`B/__tests__/mail-engine-adoption.unit.test.ts`;
`T/ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`.
Adopt 0.6.12, convert old entrypoints into thin bindings/re-exports, and adapt plugin create/domain HTTP calls explicitly. Keep account-token resolution, trusted loading and product copy.
Tests: unchanged existing resolver/policy/composition suites; parity fixture from 1; real bundled Resend adapter with fake guarded HTTP; cross-workspace/plugin, disabled-account and OAuth refusals; provider/status/DNS/test-send routes; Email admin tests.
After verification, mark the survey item extracted and adopted.

**Parallelism and landing order:** `1 → 2 → (3 ∥ 4) → 5 → 6 → (7 ∥ 8)`. Shard 5 can run alongside unfinished 4. Shards 7/8 have disjoint source ownership; 8 installs dependencies first. They land together as one deployable Tovu cutover.

Jini additions remain unused until publication. Tovu keeps its current working implementation throughout preparation. Rollback reverts the Tovu adoption unit and lockfile; unchanged data needs no rollback migration. Never shadow-send real messages to compare engines.

**4. Release verification**

Run affected package tests, typechecks, boundary checks and CCN gates on **macOS and Windows**, using Node-compatible test invocation. Verify packed artifacts without workspace links. Exercise owner sign-in without mail, provider selection, credential replacement, test capture/redirect, suppression, feedback, activity and DNS status. Deterministic fixtures must match exactly; do not regenerate expected outputs from the extracted implementation.

**5. Cut list**

- No new mail package, registry, retry scheduler, queue, event bus or DI framework.
- No SQL extraction, schema consolidation, table renaming, backfill or retention changes.
- No vendor HTTP implementation or vendor status-code interpretation in Jini core; retain plugin ownership and the existing injected SMTP seam.
- No bulk rewrite of callers, plugin manifests, admin screens, routes or composition roots.
- No change to existing Jini batch defaults, payload hashes, approval bytes, error wording or fallback eligibility.
- No general-purpose cache project, new dependency, live-email benchmark or unrelated cleanup.
- No edits folded into the 0.6.11 release currently being cut.

**6. Owner questions**

None. Coordinator must refresh source SHAs and verify the completed 0.6.11 release before dispatch; the ownership and 0.6.12 scope are decidable from the brief and inspected implementations.
