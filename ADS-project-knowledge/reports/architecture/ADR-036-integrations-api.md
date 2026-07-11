# ADR-036: Integrations / API — Outbound Webhooks on the Outbox, Derived-Not-Stored Signing, API Keys Reused from Identity

- Status: ACCEPTED 2026-07-10 (autonomous Opus 4.8 sweep agent, design-only draft → cleared `/audit-work` gate: 3-round audit under `TM-admin-sweep-001`, Codex + Gemini/agy + Fable internal verifier; round 1 FAIL → Round-3 fold → round 2 FAIL (1 converged blocker) → Round-4 fold → round 3 unanimous PASS, scores 9.1-10.0, zero blockers)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-009** (outbox is the async side-effect spine — webhooks are its canonical example), **ADR-021** (reuses `api_keys` + `authorize()` + flat permission strings; adds no new identity mechanism)
- Relates: ADR-006 (`HttpClientPort` rule-of-two; dispatch is core code, not a port), ADR-007 (workspace-scoped rows + composite FKs), ADR-012 (portable install-dir → the secret-egress problem), ADR-022 (core-owned tables reuse the write-chokepoint/ULID/attribution discipline), ADR-023 (the ext path for *third-party* integration plugins, not the core subsystem), ADR-024 (§1 core-mediated webhooks are the Tier-1 declarative primitive; §3 async/serializable ABI; the deferred secret-store invariant), ADR-025 (origin isolation lineage), ADR-027 (§6 SSRF policy — mirrored in the egress direction; §A6 export `--blobs` — mirrored as `--secrets`), ADR-028 (its secret path is explicitly *gated on this ADR*)
- Sources: the section brief (todos.md "Admin Section Spec Sweep" → Integrations / API); competitor-lite: `other-repos-specs/shopify_specs/tovu-interpretation/webhooks-and-events.md`, `other-repos-specs/wordpress_specs/wp-root/integrations.md`, `other-repos-specs/directus_specs/api/access-control-and-automation.md`

## Context

Tovu needs an **Integrations / API** admin section: outbound webhook subscriptions, reliable
signed delivery, and API-key issuance/scoping. The owner named **WEBHOOKS as the priority** —
outbound subscriptions delivered reliably through the outbox, signed, with retry.

Three prior decisions already carry most of the load, so this ADR is mostly *assembly plus one
genuinely new hard problem*:

1. **ADR-009** already built the outbox (`enqueue → claimPending → publish → markDelivered`) and
   named **webhooks** as a first-class async-side-effect use case. The delivery machinery is not
   new infrastructure; it is a second consumer of the existing spine.
2. **ADR-021** already ships `api_keys` in v1 (hashed at rest; resolve to a `kind='api_key'`
   principal; scoped via a frozen issuance-snapshot policy; `apikey.manage`). The "API" half of
   this section is therefore a **surface over an accepted mechanism**, not a new one — this ADR
   adds no identity table and no new credential type.
3. **ADR-024 §1** classifies "on publish, core POSTs to a configured URL" as a **Tier-1
   declarative primitive** and lists **webhook dispatch** among the core-mediated primitives core
   *must* ship for the Tier-1 "install from anyone" on-ramp to hold (`reports/audits/20260708-
   plugin-catalog-demand-audit.md`, condition #1). Webhook dispatch is therefore **core**, not a
   bundled plugin.

The one genuinely hard, decide-now problem is **secret material in a portable folder**. ADR-024
froze the invariant *"plugin secrets never plaintext in the site folder, since folders travel with
copies/backups/exports"* and deferred the mechanism. ADR-028 (settings) then **explicitly gated its
secret path on "the Integrations ADR."** A webhook signing secret is the exact trap: HMAC signing
needs the shared secret **recoverable** on every delivery (you cannot sign with a one-way hash),
yet the `content.db` that holds it is copied, synced, and exported. This ADR must resolve signing
without leaving a usable secret in the portable folder — inside the accepted ADRs.

## Decision

### 1. Placement — `integrations` is a Tier-2 core library (§3.5)

`integrations` is a **Tier-2 core library**, not a Tier-3 bundled plugin. The §3.5 placement rule:
tier-2 is "anything ≥80% of sites need and *plugins must build on*." Webhook dispatch is precisely
that — ADR-024 §1 makes it a **core-mediated primitive a Tier-1 declarative plugin depends on**
("subscribe topic X → POST a shaped payload to a templated URL"). A Tier-1 plugin cannot depend on
a *disableable* Tier-3 plugin for its dispatch and still be "installable from anyone"; the primitive
must be always-present core. It is also built directly on the outbox kernel spine (ADR-009), and it
is **security-critical** (signing, SSRF egress, secret handling) — a "one library, one policy"
surface like `text` (§3.5). Rejected: **integrations-as-a-bundled-plugin** (breaks the Tier-1
dependency and would re-implement the outbox worker) and **folding webhooks into `identity`**
(identity owns *credentials*; delivery/retry/signing is a distinct concern on a different spine).

**Division of labor (no overlap):** `identity` (ADR-021) owns API-key **issuance & scoping**
(`api_keys`, `ISSUE_API_KEY`, the frozen policy snapshot). `integrations` owns the **webhook
subsystem** and is the **admin/AI surface** that presents both webhooks and (identity's) API keys
under one nav section. The section is a *view composition*; the API-key mechanism stays in identity.

### 2. Data model — core-owned tables, ADR-022 discipline (NOT ADR-023)

For a **core** library, tables are ordinary core tables executed by core's own migration engine
(ADR-015) — the ADR-027 (`asset_blobs`) / ADR-028 (settings) pattern. **ADR-023's core-mediated
declarative path is for *third-party* integration plugins** that want their own subscription
tables; it is **not needed for the core subsystem** (this directly answers the brief's "own-tables
via the ADR-023 path *if needed*" — it is not). Three core-owned tables (full DDL sketch in the
design report):

- **`webhook_subscriptions`** — `(workspace_id, id ULID)`, `owner_principal_id`, `label`,
  `target_url`, `topics` (JSON array of catalog-validated topics), `secret_version`,
  `previous_secret_version`, `status ∈ {active, paused, disabled}`, `created_by_principal_id`,
  `created_by_plugin_id`, timestamps, `disabled_at`. **No secret column** — signing material is
  derived (§4), never stored.
- **`webhook_deliveries`** — `(workspace_id, id ULID)`, `subscription_id`, `event_id`, `topic`,
  `status`, `attempts`, `next_attempt_at`, `last_response_status`, `last_error`,
  `signed_with_version`, timestamps, `dead_at`. **Outbox-shaped** but a *distinct* table (§4).
- **`integration_secrets`** — sealed outbound credentials; **v1 = seam only** (§8).

Reuses (adds nothing to): **`api_keys`** (ADR-021).

Discipline inherited from ADR-022: **single write chokepoint** for subscription mutations (with a
CI canary asserting no side-door writes), **ULIDs**, **workspace-scoping with composite
`(workspace_id, id)` FKs** (ADR-007/021 §4), **`pluginId`/actor attribution** at the chokepoint
(ADR-022 amendment / ADR-024). **Explicitly narrowed (stated, not silent, mirroring ADR-027 §2
INV-3):** `webhook_deliveries` is high-churn operational machine state — delivery writes do **not**
generate content revisions and are not on the revisioned audit path; the CI canary permits the
delivery worker as the single writer of that table.

### 3. Reuse API keys wholesale from ADR-021 — no new credential

The "API" surface issues/scopes keys **entirely** through ADR-021's `ISSUE_API_KEY` / frozen-policy
snapshot / `apikey.manage`. A key's authority to manage webhooks is just `webhooks.*` permissions
in its frozen policy (§6), clamped to the issuer at issuance (ADR-021 INV-07). **No new permission
name for key management** — reuse `apikey.manage` (ADR-021 §3 "one permission language"). The API
section adds only presentation: list keys, show non-secret prefixes, last-used, revoke. Nothing in
this ADR relaxes ADR-021.

### 4. Webhook delivery/retry/signing on the outbox (ADR-009) — the core of the design

**Two-stage, both on the outbox pattern:**

- **Stage A — fan-out (a core outbox subscriber).** The existing outbox worker delivers each
  `DomainEvent` to the in-process bus. A core subscriber `webhookFanout` matches the event's topic
  (= its `name`, e.g. `post.published`) against **active** subscriptions
  (`WebhookSubscriptionRepoPort.findMatching`) and **enqueues one `webhook_deliveries` row per
  matched subscription** — in the same handler, idempotently keyed on `(event_id, subscription_id)`
  so an outbox re-delivery cannot double-enqueue (ADR-009: handlers stay idempotent).
- **Stage B — delivery worker (`processWebhookDeliveries`, mirrors `processOutbox`).** Claims due
  `pending`/retry-eligible rows, runs the `webhooks.beforeDispatch` filters (§7), signs, and POSTs
  via `HttpClientPort`.

**Why two tables, not one:** one event fans out to **N endpoints, each retrying on its own backoff
clock**. Per-endpoint HTTP-retry state (attempts, `next_attempt_at`, last response) is a different
lifecycle from internal event delivery and must not be crammed into the shared event outbox. This
keeps the fast, crash-safe event spine unpolluted and gives each endpoint independent retry — it is
the same "outbox for async side effects" pattern (ADR-009 §2), applied a second time with a
webhook-specific projection.

- **Signing (Stripe-shaped, timestamped).** Header
  `Tovu-Signature: t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, `${t}.${rawBody}`))>`. The timestamp
  bounds replay (receiver rejects outside a tolerance window). The signer signs the **exact bytes**
  the transport sends (no re-serialization between sign and send). Idempotency headers
  `Tovu-Delivery-Id` + `Tovu-Event-Id` let receivers dedupe — semantics are **at-least-once**
  (stated honestly).
- **Retry/backoff/DLQ.** Exponential backoff **with jitter**, capped attempts (default 8 over ~ a
  day), then `status='dead'` (dead-letter) + a `webhook.delivery.dead` internal event surfaced in
  admin. Dead deliveries are **retained**, never dropped, and manually **redeliverable**
  (`webhooks.redeliver`). Ordering is **best-effort per subscription**, not strictly ordered in v1.
- **SSRF / egress safety.** Every outbound request is checked against a **`WebhookEgressPolicy`** —
  the egress mirror of ADR-027 §6's `MediaIngressPolicy`: `https` allowlist (a `devHostAllowlist`
  exempts localhost for self-hosted testing), **resolve-then-connect IP pinning + re-verify per
  redirect hop**, deny RFC1918/link-local/loopback/metadata (169.254.169.254), redirect cap,
  connect timeout, response-size cap. Enforced inside the `HttpClientPort` adapter so there is one
  egress chokepoint.

### 5. Signing secrets are DERIVED, never stored (resolves the portable-folder trap)

No per-subscription signing secret is persisted. On each delivery the worker derives it:
`HKDF(rootKey, info = `${workspaceId}:${subscriptionId}:v${version}`)`. The **install root key
lives OUTSIDE `content.db`** — via `KeyringPort` (env var now → OS keychain next, rule-of-two) — so
the portable `content.db` never carries usable signing material (satisfies ADR-024's secret
invariant *by construction* for the priority feature). The subscriber is shown the derived secret
**once** at creation, exactly like an API key. **Rotation** mints `version+1`; both generations
sign during an overlap window (`Tovu-Signature` carries two `v1=` values) so a receiver migrates
without dropped deliveries.

### 6. Permissions — flat strings in the ADR-021 catalog

Core-registered, catalog-validated (ADR-021 §3), enumerable via `tovu permissions list`:
`webhooks.read`, `webhooks.create`, `webhooks.update`, `webhooks.delete`, `webhooks.rotate_secret`,
`webhooks.redeliver`, `webhooks.manage`; and (for the deferred outbound-credential surface, §8)
`integrations.read`, `integrations.manage`. **API-key management reuses `apikey.manage`** (§3) — no
new string. Every webhook mutation flows through the SPEC-001 gateway → `authorize()` → change-set,
so subscription create/update/delete are **audited and revertible** (ADR-008); no back door for the
admin screen or the AI tools (they share the gateway handlers — the §3.5 dogfood rule / ADR-027
INV-6).

### 7. Hooks & events (ADR-009 §3, shaped to the ADR-024 §3 ABI)

- **New domain events** (topics others — including webhooks — can subscribe to):
  `webhook.subscription.created|updated|deleted`, `webhook.delivery.succeeded|failed|dead`.
- **One hook, `webhooks.beforeDispatch`** — an **async, serializable** filter (ADR-024 §3: async +
  serializable-only, no live objects) that may redact/transform the outbound envelope's `data` or
  **veto** the delivery (fail-closed default = send). Explicit **priority + deterministic order**
  (ADR-024 §7). This is the **Tier-1 declarative-webhook seam** (ADR-024 §1): a declarative plugin
  declares a subscription + payload shape and core dispatches it. Any templating in a declarative
  subscription (URL/payload) is a **computed field and MUST use ADR-022's total/bounded-cost
  expression language** (ADR-024 §5) — no arbitrary code in a Tier-1 webhook.
- The **topic namespace is the domain-event catalog** (`{entity}.{action}`). v1 exposes the events
  that exist (`post.*`, `workspace.*`, and whatever `media`/others emit); the catalog grows with
  features (the Shopify-webhooks note's "define a catalog" recommendation).

### 8. v1 scope — webhooks IN, outbound connectors deferred (with named seams)

**IN v1:** webhook subscriptions CRUD (gateway-audited), the two-stage outbox delivery
(fan-out subscriber + delivery worker), HMAC signing with derive-not-store secrets + rotation,
retry/backoff/jitter/DLQ + manual redelivery, `WebhookEgressPolicy` SSRF guard, the
`webhooks.beforeDispatch` hook, the `webhooks.*` permission catalog, the API-key management view
(over ADR-021), and the `webhook.*` event additions.

**DEFERRED (each with a named seam already in the types/schema):**
- **Outbound integration connectors** (paste a third-party token → call their API). The seam is
  `integration_secrets` + `SecretSealerPort` + `integrations.*` permissions. Sealed credentials
  require the *recoverable* secret-store ADR-024 defers — hence deferred here too (v1 ships the
  sealed-table shape, not a connector runtime).
- **Inbound webhooks / receiving** (external systems POST *into* Tovu). Different trust surface
  (auth, replay, idempotent ingestion) — out of scope; the priority is outbound.
- **Delivery-log retention/GC** — deliveries are a bounded append-only log; the GC window is owned
  by the **pending Storage/Backups snapshot primitive** (as ADR-027 §5 deferred its grace window),
  not decided here.
- **Per-subscription rate limiting / circuit breaking** beyond the fixed retry cap.
- **Secret-egress on export** — `tovu build`/clone/export MUST take `--secrets=strip` (default) or
  `--secrets=rewrap` (re-seal under the destination root key), the egress analog of ADR-027 §A6
  `--blobs`; a bare export carrying sealed secrets **fails loudly**. Signing secrets need no such
  flag (they are derived, not stored) but **change when the root key changes** — receivers re-copy.

## Consequences

- **The owner's priority (webhooks) is a first-class core primitive**, delivered on the accepted
  outbox spine rather than as new infrastructure — reliable, replayable, crash-safe by inheritance
  (ADR-009).
- **ADR-024's secret invariant holds for the priority feature by construction** — signing secrets
  are derived from a root key outside the portable folder, so `content.db` alone never signs.
- **ADR-028 is unblocked** — its secret path was gated on "the Integrations ADR"; this ADR supplies
  the `KeyringPort` + `SecretSealerPort` seam and the derive-not-store pattern.
- **No security rule relaxed:** API keys stay exactly as ADR-021 defined; every webhook mutation is
  `authorize()`-gated and change-set-audited; egress is SSRF-guarded like media ingress; the ADR-024
  §3 ABI shapes the one hook.
- **DX/latency cost, accepted:** two tables and two workers instead of one; a signed POST per
  (event × subscription); a root key that must exist outside `content.db` before signing works
  (first-boot must provision it). At-least-once means receivers must dedupe.
- **Rejected alternatives** (see design report): store signing secrets in `content.db` (breaks
  ADR-024); overload the core event outbox with HTTP-retry state (couples two lifecycles); a
  `WebhookDispatchPort` (only one dispatcher — fails ADR-006 rule-of-two, and ADR-009 rejected a
  mediator layer); integrations-as-a-bundled-plugin (breaks the Tier-1 dependency).

## Open

- **Root-key management is the crux (audit first).** Env var vs OS keychain vs operator passphrase
  for the `KeyringPort` root key — and whether "derive-not-store from a root key outside
  `content.db`" is the accepted v1 answer or whether it **reopens ADR-024's deferred secret-store**
  (it is intended to *supply the seam ADR-028 asked for*, not reopen ADR-024 — needs the owner's
  confirmation). What happens on a **lost/rotated root key** (all signatures change; every receiver
  must re-copy) needs an operator story.
- **HMAC (symmetric) vs asymmetric (Ed25519) signing.** Asymmetric lets receivers verify with a
  **public** key — nothing secret to store on their side, and arguably cleaner portability — but
  core still stores/derives a private key, and the receiver-ergonomics win is real. HMAC chosen for
  v1 (ubiquitous, Stripe-shaped); flag for the audit.
- **Two-stage delivery (two tables) vs one.** Argued for two (independent per-endpoint retry);
  pressure-test whether a single enriched outbox suffices at self-hosted scale.
- **Signed payload = full event data vs a thin `{id, topic}` "fetch-to-read" pointer.** Thin
  pointers avoid leaking data to a mis-typed URL but force receivers to call back (needs an API key)
  — decide per the security posture.
- **`HttpClientPort` ownership.** §3.5 names it a core port; confirm it is minted here vs owed by an
  earlier lib, so two libraries don't define it twice.
- **Delivery-log retention** — bounded how, and does it truly belong to the Storage/Backups
  primitive (as assumed) or need an interim cap now?

## Record

Design-only sweep artifact — **no peer debate, no external audit** (unlike ADR-021/022/024/027,
which each ran a swarm debate + audit). This is a single-agent draft grounded in the accepted ADRs
and the section brief, produced to the ADR-027/ADR-022 depth benchmark as a *structural* target
only. It **owes a debate + audit before ACCEPTED**. Companion design report + Implementation
Proposal: `ADS-project-knowledge/reports/section-designs/20260710-integrations-api-design.md`.
Compile-checked typed interfaces: `src/integrations/{types,ports,index}.ts` (typecheck clean against
the real repo types; see the report).

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-036 + round-2. PROPOSED; owes per-ADR audit.
- **Import `HttpClientPort` + `EgressPolicy` from ADR-038** (stop declaring them locally). `EgressPolicy` allowlists derive from `core/origin` (ADR-040), not per-module host settings.
- **Fix crypto-comment drift:** HKDF `workspaceId` belongs in the info string; the comment "fail-closed default = send" is actually fail-**open** — correct it.
- Root-key management remains the **audit-first** crux (owner call).
- **Permission namespace:** `admin.integrations.manage`.
- **Wave 1** (needs ADR-038 homed + both Wave-1 blockers ruled).

---

## Round-3 audit fold (TM-admin-sweep-001, 2026-07-10)
External audit (Fable F2, F5) found the `beforeDispatch` hook-failure fix only corrected a mislabeled comment without pinning actual fail-closed behavior, and found `KeyringPort` has three cross-ADR consumers but no crosscutting home. Folded:

1. **`beforeDispatch` failure is fail-closed by behavior, not just by label.** §7 is corrected: on any `webhooks.beforeDispatch` contributor error or timeout, the delivery attempt **fails** (retryable, rides the existing backoff) — it never dispatches a partially-filtered or un-redacted envelope. The prior Round-2 fold only corrected the *label* ("fail-open" was mislabeled "fail-closed") without pinning the behavior itself; under the old wording a throwing redaction hook would silently ship the unredacted (possibly PII-bearing) payload. Per ADR-024 §7, default is fail-closed; an availability escape (deliver un-redacted rather than skip) must be an explicit, operator-visible per-subscription opt-in, never the default.
2. **`KeyringPort` homed as a crosscutting Tier-2 primitive.** `KeyringPort` (§5: root-key custody + HKDF derivation) is not integrations-local — Newsletter's unsubscribe-token derivation (ADR-034 fold) and Analytics' salt derivation (ADR-035 Round-3 fold) both consume it, the same multi-consumer-single-home problem ADR-037/038 were minted to fix. `lib/keyring/` is a **Tier-2 core primitive** owning `KeyringPort` (root-key custody, HKDF derivation API, rotation story); Integrations, Newsletter, Analytics, and Settings' gated secret path all consume it. A dedicated ADR-041 is the eventual proper home; until written, this ADR §5 is the canonical shape and other consumers cite it directly (not a silent duplicate).

---

## Round-4 audit fold (TM-admin-sweep-001, 2026-07-10)
Round-2 re-audit — three independent auditors (Codex R2-002, Gemini/agy gemini-r2-001, Fable R2-002) converged on the same gap in the Round-3 fold above: claiming `KeyringPort`'s shape is "unchanged from this ADR's §5" cannot be true simultaneously with Analytics and Newsletter actually consuming it, because §5's only derivation method (`deriveSigningSecret`) is hardwired to the webhook-subscription info-string shape (`workspaceId:subscriptionId:version`) and cannot express Analytics' `analytics-salt:{workspaceId}:{utcDate}` or Newsletter's `consent_revision_id`-carrying unsubscribe payload. Folded:

1. **`KeyringPort` gains a generic derivation method.** §5's `KeyringPort` is corrected from "shape unchanged" to: `deriveSigningSecret` stays exactly as declared (the webhook-specific method), and a new method is added — `derive(input: { workspaceId: UUID; purpose: string; info: string }): Promise<Uint8Array>` — for crosscutting consumers whose payload doesn't fit the webhook shape. `purpose` namespaces the caller (`'analytics-salt'`, `'newsletter-unsubscribe'`); `info` is the caller-owned, fully-formed HKDF info string. Same root-key-never-crosses-the-interface custody guarantee as `deriveSigningSecret` — implemented in `src/integrations/ports.ts`.
2. Analytics' salt derivation (ADR-035) and Newsletter's unsubscribe-token derivation (ADR-034) both cite `KeyringPort.derive()`, not `deriveSigningSecret()`, going forward.
