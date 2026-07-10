# Section Design — Integrations / API (Webhooks-first)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; **no peer debate, no external audit**)
- Companion ADR: `ADS-project-knowledge/reports/architecture/ADR-036-integrations-api.md` (PROPOSED)
- Typed interfaces: `src/integrations/{types,ports,index}.ts` (compile-checked — see §7)
- Owner priority for this section: **WEBHOOKS** (outbound subscriptions, reliable delivery/retry via the outbox, signing, API-key scoping)

---

## 1. Competitor-lite orientation

Quick teardown from the corpus (`other-repos-specs/`), not a deep mine — enough to place Tovu.

| Platform | Outbound webhooks | Signing | Delivery reliability | API keys / auth |
|---|---|---|---|---|
| **Shopify** | 150+ topics, `{entity}_{action}` + lifecycle (`ORDER_PAID`) + publication events; subscribe to explicit topics, no wildcard "everything" | HMAC-SHA256 over raw body, shared secret per app | async with retry; mandatory privacy webhooks | OAuth scopes per app |
| **WordPress** | none in core — plugins (WP Webhooks / Zapier) bolt it on; `wp-cron` pseudo-cron makes timing traffic-dependent | plugin-defined | plugin-defined, often none | Application Passwords (basic-auth-ish), REST cookie/nonce |
| **Directus** | Flows/automation "webhook" + "request URL" operations; event-driven triggers | optional, operator-configured | best-effort in the flow engine | static tokens + role/policy scoped access (the model ADR-021 borrows) |
| **Stripe** (reference) | topic subscriptions, dashboard + API | `Stripe-Signature: t=…,v1=HMAC` timestamped (replay-bounded) | exponential backoff, dead-letter, dashboard redelivery | restricted keys with per-resource scopes |

**Who did it best, and what Tovu should take:**
- **Stripe's signature scheme** (timestamped HMAC, `t=…,v1=…`, receiver tolerance window) is the
  clean anti-replay shape — adopted verbatim in ADR-036 §4.
- **Shopify's "explicit topics, predictable `{entity}.{action}` naming, publication events distinct
  from CRUD"** — adopted; Tovu's topic namespace *is* its domain-event catalog, so the webhook topic
  list is free (it is the event names that already exist).
- **Directus's roles→policies→scoped-tokens** — already Tovu's identity model (ADR-021); API-key
  scoping is *reused*, not reinvented.
- **WordPress is the anti-pattern**: webhooks as an unreliable plugin afterthought on pseudo-cron.
  Tovu's differentiator is that reliable delivery is **core, on the real outbox** (ADR-009), the
  same way `scheduler` fixes WP-Cron (§3.5).

The Shopify reconstruction note (`webhooks-and-events.md`) already concluded: *Tovu has the outbox +
event bus; the missing piece is external HTTP delivery + a defined event catalog.* This design fills
exactly that gap.

## 2. Tier rationale (§3.5)

**`integrations` = Tier-2 core library.** The placement rule: tier-2 is "≥80% of sites need it *and
plugins must build on it*." Two independent forces put webhooks there:

1. **ADR-024 §1 makes webhook dispatch a core-mediated Tier-1 primitive.** A declarative
   (zero-code) plugin is allowed to say "on `post.published`, POST to this URL." For that to be
   "installable from anyone," the dispatcher it leans on must be **always-present core**, not a
   Tier-3 plugin a user can disable. The plugin-catalog demand audit
   (`reports/audits/20260708-plugin-catalog-demand-audit.md`) named **webhook dispatch** as one of
   the core-mediated primitives the Tier-1 coverage number *depends on*.
2. **It rides the kernel outbox (ADR-009) and is security-critical** (signing, SSRF egress, secret
   handling) — a "one library, one policy" surface, like `text`.

**Why not Tier-3 bundled plugin?** That is the WordPress mistake, and it breaks force #1: a Tier-1
declarative webhook cannot depend on a disableable plugin. It would also re-implement the outbox
worker. **Why not fold into `identity`?** Identity owns *credentials*; delivery/retry/signing is a
different concern on a different spine. The clean split: **identity issues & scopes API keys;
integrations delivers webhooks and is the shared admin surface.**

Note the asymmetry the §3.5 rule intends: "when in doubt start as a bundled plugin (promotion is
easy, demotion is breaking)." Here there is **no doubt** — the Tier-1 dependency forces core. The
*outbound-connector* half (paste a token, call a SaaS) is genuinely plugin-shaped and is **deferred
as exactly that seam** (§6).

## 3. The design in prose

A site owner (or an AI agent acting as a delegated principal, or a Tier-1 declarative plugin) creates
a **subscription**: a label, an `https` target URL, and a set of **topics** drawn from the
domain-event catalog (`post.published`, `workspace.updated`, …). Creation runs through the SPEC-001
gateway → `authorize('webhooks.create')` → a change-set, so it is audited and revertible (ADR-008).
The owner is shown a **signing secret once** and never again — because the secret is not stored (§5).

When anything happens, core already emits a `DomainEvent` and the **outbox** already delivers it to
the in-process bus (ADR-009). Integrations adds a **fan-out subscriber**: for each delivered event it
looks up active subscriptions whose topics match and **enqueues one `webhook_deliveries` row per
match**, idempotently keyed on `(event_id, subscription_id)` so an outbox re-delivery can't
double-send. A separate **delivery worker** — a near-clone of the existing `processOutbox` — claims
due rows, runs the `webhooks.beforeDispatch` filters (a plugin may redact or veto), **signs** the
exact bytes it is about to send, and **POSTs** through the SSRF-guarded `HttpClientPort`. 2xx →
`delivered`. Anything else → `failed`, re-scheduled with exponential backoff + jitter; after the
attempt cap → `dead` (retained, manually redeliverable, and it emits `webhook.delivery.dead` for the
admin surface).

**Two tables, not one, on purpose.** The core event outbox is about fast, crash-safe *internal*
fan-out. A webhook is *one event → N endpoints, each with its own retry clock*. Cramming per-endpoint
HTTP-retry state into the shared event outbox couples two different lifecycles and pollutes the hot
path. So webhooks get their own outbox-shaped table and their own worker — the same ADR-009 pattern,
instantiated a second time. (Flagged as an open question for the audit, but this is the recommended
shape.)

**Signing without a stored secret.** HMAC needs the shared secret *recoverable* on every delivery —
you cannot sign with a one-way hash — but `content.db` travels with backups/exports (ADR-012), and
ADR-024 forbids plaintext secrets in the portable folder. Resolution: **derive, don't store.** Each
delivery derives its secret as `HKDF(rootKey, "${workspaceId}:${subscriptionId}:v${version}")`. The
**root key lives outside `content.db`** behind `KeyringPort` (env var now → OS keychain next), so the
portable file alone can never sign. The subscriber sees the derived secret once at creation.
**Rotation** bumps the version and dual-signs during an overlap window so no delivery is dropped
mid-migration. This is the seam ADR-028 was waiting on ("secret path gated on the Integrations ADR").

**Recoverable** outbound credentials (a pasted third-party token, needed for the *deferred* connector
half) are the harder case — they must round-trip, so they can't be derived away. Those are stored
**sealed** (`SecretSealerPort`, AEAD under the root key) in `integration_secrets`, and the
portability contract requires export to `--secrets=strip|rewrap` (mirroring ADR-027 §A6 `--blobs`).
v1 ships the table shape, not the connector runtime.

**API keys** are entirely ADR-021: issue via `ISSUE_API_KEY`, scope via the frozen policy snapshot,
manage with `apikey.manage`. The "API" tab in this section is a *view* — list keys, show prefixes and
last-used, revoke. A key that carries `webhooks.*` in its frozen policy can manage webhooks over HTTP;
that clamp is ADR-021's, unchanged.

## 4. Alternatives considered

- **Store the signing secret in `content.db`** (simplest). Rejected — violates ADR-024's
  never-plaintext-in-the-folder invariant; the exported/backed-up file would sign. Derive-not-store
  costs a `KeyringPort` and a root key that must exist before signing — accepted.
- **Asymmetric signing (Ed25519), receiver verifies with a public key.** Genuinely attractive
  (nothing secret on the receiver; arguably better portability) — but core still holds a private key,
  and HMAC is the ubiquitous, well-understood default. **Deferred to the audit as an open question**,
  not dismissed.
- **One enriched outbox table for both internal events and HTTP delivery.** Rejected — couples the
  fast internal fan-out lifecycle with slow, per-endpoint, independently-retrying HTTP delivery.
  Two tables keep each clean (ADR-009 §2 applied twice).
- **A `WebhookDispatchPort`.** Rejected — only one dispatcher exists, so it fails ADR-006's
  rule-of-two, and ADR-009 already rejected a mediator layer over the outbox. Dispatch is ordinary
  core code (like ADR-021's `authorize()`). The *transport* (`HttpClientPort`) and the *keyring* are
  the real ports (two adapters each).
- **Integrations as a Tier-3 bundled plugin** (the WordPress shape). Rejected — breaks the Tier-1
  declarative-webhook dependency (ADR-024 §1) and re-implements the outbox worker.
- **Skip the SSRF egress guard for v1.** Rejected — an operator- or agent-supplied URL pointed at
  `169.254.169.254` or an internal service is a classic SSRF; the guard is cheap and mirrors an
  already-accepted policy (ADR-027 §6). Non-negotiable in v1.
- **Full event data in every payload vs a thin `{id, topic}` pointer.** Left as an open question —
  thin pointers reduce data-leak blast radius on a mis-typed URL but force an authenticated callback.

## 5. Implementation Proposal

### 5.1 Modules to add (all under `src/integrations/`)

```
src/integrations/
├── index.ts                 # ✅ written — public barrel (ADR-009 §1)
├── types.ts                 # ✅ written — row/envelope/signature/hook types
├── ports.ts                 # ✅ written — HttpClientPort, KeyringPort, SecretSealerPort, repos
├── subscriptions.ts         # (P1) create/update/delete/rotate — gateway-audited command handlers
├── fanout.ts                # (P1) outbox subscriber: event → matched subs → enqueue deliveries
├── delivery-worker.ts       # (P1) processWebhookDeliveries(): claim → filter → sign → POST → mark
├── signer.ts                # (P1) HMAC-SHA256 timestamped signature over raw body (uses KeyringPort)
├── egress-policy.ts         # (P1) WebhookEgressPolicy default + validation used by the http adapter
├── repo.memory.ts           # (P1) in-memory adapters (rule-of-two "first" side; dev/tests)
├── repo.sqlite.ts           # (P2) Drizzle/SQLite adapters (rule-of-two "next" side)
├── http-client.undici.ts    # (P2) real HttpClientPort with resolve-then-connect SSRF pinning
├── http-client.memory.ts    # (P1) test-double HttpClientPort
├── keyring.env.ts           # (P1) KeyringPort over an env-var root key (rule-of-two "now")
├── keyring.keychain.ts      # (later) OS-keychain KeyringPort (rule-of-two "next")
├── catalog.ts               # (P1) core webhook.* permission + event-name registration
├── __specs__/               # behavior/state/errors specs (SPEC-0NN when promoted)
└── __tests__/               # contract tests incl. cross-workspace isolation (ADR-007 §4)
```

Server wiring (thin, existing patterns): `src/server/routes/admin/webhooks/*` (list/create/update/
delete/rotate/redeliver — mirrors `routes/admin/posts/*`) and the delivery worker registered next to
the outbox worker in `src/server/app.ts`.

### 5.2 Schema / DDL sketch (core-owned; Drizzle in `src/infra/db/schema.ts`)

```sql
CREATE TABLE webhook_subscriptions (
  id                      TEXT PRIMARY KEY,          -- ULID
  workspace_id            TEXT NOT NULL,
  owner_principal_id      TEXT NOT NULL,
  label                   TEXT NOT NULL,
  target_url              TEXT NOT NULL,             -- https; checked vs egress policy each send
  topics                  TEXT NOT NULL,             -- JSON array of catalog-validated topics
  secret_version          INTEGER NOT NULL,
  previous_secret_version INTEGER,                   -- non-null only during a rotation overlap
  status                  TEXT NOT NULL,             -- active | paused | disabled
  created_by_principal_id TEXT NOT NULL,             -- attribution (ADR-022 amend / ADR-024)
  created_by_plugin_id    TEXT,                      -- null = core/human
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  disabled_at             TEXT
  -- composite (workspace_id, owner_principal_id) FK -> principals(workspace_id, id)  [ADR-021 §4]
);
CREATE INDEX idx_whsub_ws        ON webhook_subscriptions(workspace_id);
CREATE INDEX idx_whsub_ws_status ON webhook_subscriptions(workspace_id, status);

CREATE TABLE webhook_deliveries (
  id                   TEXT PRIMARY KEY,             -- ULID
  workspace_id         TEXT NOT NULL,
  subscription_id      TEXT NOT NULL,
  event_id             TEXT NOT NULL,
  topic                TEXT NOT NULL,
  status               TEXT NOT NULL,                -- pending|delivering|delivered|failed|dead|canceled
  attempts             INTEGER NOT NULL DEFAULT 0,
  next_attempt_at      TEXT NOT NULL,
  last_response_status INTEGER,
  last_error           TEXT,
  signed_with_version  INTEGER,
  created_at           TEXT NOT NULL,
  delivered_at         TEXT,
  dead_at              TEXT
  -- composite (workspace_id, subscription_id) FK -> webhook_subscriptions(workspace_id, id)
);
-- idempotent fan-out: one delivery per (event, subscription)
CREATE UNIQUE INDEX uq_whdel_event_sub ON webhook_deliveries(workspace_id, event_id, subscription_id);
-- worker claim: due, retry-eligible rows
CREATE INDEX idx_whdel_claim ON webhook_deliveries(status, next_attempt_at);

CREATE TABLE integration_secrets (              -- v1 = seam only (deferred connectors)
  id                      TEXT PRIMARY KEY,
  workspace_id            TEXT NOT NULL,
  owner_principal_id      TEXT NOT NULL,
  name                    TEXT NOT NULL,
  sealed_key_id           TEXT NOT NULL,          -- root-key generation the value was wrapped under
  sealed_ciphertext       TEXT NOT NULL,          -- base64 AEAD
  sealed_nonce            TEXT NOT NULL,
  sealed_alg              TEXT NOT NULL,
  created_by_principal_id TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);
CREATE INDEX idx_intsec_ws ON integration_secrets(workspace_id);
```
Reuses `api_keys` (ADR-021) unchanged. **Write chokepoint + CI canary:** subscription mutations go
through the single `integrations/subscriptions.ts` repo layer (canary asserts no side-door writes);
`webhook_deliveries` is the one narrowed table (delivery worker is its sole writer — the ADR-027 §2
INV-3 narrowing, stated not silent).

### 5.3 Permission strings (ADR-021 catalog)

`webhooks.read`, `webhooks.create`, `webhooks.update`, `webhooks.delete`, `webhooks.rotate_secret`,
`webhooks.redeliver`, `webhooks.manage`; `integrations.read`, `integrations.manage` (deferred
connector surface). **API-key management → reuse `apikey.manage`** (no new string). Seed mapping:
`owner`/`admin` get `webhooks.manage`; `editor`/`viewer` get `webhooks.read` at most.

### 5.4 Hooks & events

- **Hook:** `webhooks.beforeDispatch` — async, serializable filter (ADR-024 §3 ABI); redact/transform
  or veto; explicit priority (ADR-024 §7). Tier-1 declarative-webhook seam (any templating uses the
  ADR-022 total/bounded expression language).
- **New events:** `webhook.subscription.created|updated|deleted`, `webhook.delivery.succeeded|failed|dead`.

### 5.5 Phased plan

- **P0 — seams (this PR).** `types.ts`, `ports.ts`, `index.ts` written + typecheck-clean. No runtime.
- **P1 — walking skeleton (in-memory).** `subscriptions.ts` (gateway-audited CRUD + rotate),
  `fanout.ts`, `delivery-worker.ts`, `signer.ts`, `egress-policy.ts`, `keyring.env.ts`,
  `http-client.memory.ts`, `repo.memory.ts`, `catalog.ts`. End-to-end: create a sub → emit
  `post.published` → assert a signed POST hit the test-double with a verifiable `Tovu-Signature`,
  retry on 500, dead-letter after the cap. Contract tests incl. cross-workspace isolation.
- **P2 — persistence + real transport.** `repo.sqlite.ts` (Drizzle migration), `http-client.undici.ts`
  with resolve-then-connect SSRF pinning, admin routes + the API-key management view.
- **P3 — hardening / deferred triggers.** `keyring.keychain.ts`; the `--secrets=strip|rewrap` export
  clause; delivery-log retention (once the Storage/Backups primitive lands); connector runtime over
  `integration_secrets` (own SPEC).

### 5.6 v1 scope cut (named deferred seams)

**IN:** subscriptions CRUD (audited), two-stage outbox delivery, HMAC derive-not-store signing +
rotation, retry/backoff/jitter/DLQ + manual redelivery, `WebhookEgressPolicy`, `beforeDispatch` hook,
`webhooks.*` catalog, API-key management view, `webhook.*` events.

**DEFERRED — each with the seam already in the types/schema:** outbound connectors
(`integration_secrets` + `SecretSealerPort` + `integrations.*`); inbound/receiving webhooks;
delivery-log retention/GC (Storage/Backups primitive); per-subscription rate-limit/circuit-breaker;
secret-egress export flag; OS-keychain keyring; asymmetric signing.

## 6. Deferred-connector seam (explicit)

The "paste a Stripe/Slack token → call their API" surface is genuinely plugin-shaped and needs
**recoverable** secrets (can't be derived away). It ships in v1 only as the shape:
`integration_secrets` table + `SecretSealerPort` (seal/open under a `KeyringPort` root key) +
`integrations.*` permissions + the `--secrets=strip|rewrap` export contract. The connector *runtime*
is gated on the recoverable secret-store ADR-024 defers, and gets its own SPEC.

## 7. Typed interfaces — compile status

Three files added under `src/integrations/` — **interfaces & types only, no feature logic**:
`types.ts` (rows, envelope, signature, hook, sealed-secret), `ports.ts` (`HttpClientPort` +
`WebhookEgressPolicy`, `KeyringPort` + `RootKeyHandle`, `SecretSealerPort`, the three repo ports),
`index.ts` (barrel). They import real core types (`DomainEvent`, `ISODateTime`, `JsonObject`, `UUID`)
from `src/core/ports.ts`.

**Typecheck: CLEAN.** `npx tsc -p tsconfig.json --noEmit` returns exit 0 with the new files included,
and the pre-change baseline was also exit 0 — so there is **no isolation caveat**: the new files
compile against the real repo types and introduce zero errors. (Dependencies had to be `npm install`ed
first — the fresh clone shipped without `node_modules`, which made the baseline fail on missing
`@types/node` until installed.)

## 8. Top open questions for the morning audit

1. **Root-key management (the crux).** Env var vs OS keychain vs operator passphrase for `KeyringPort`;
   is derive-not-store the accepted v1 answer, and does it *supply* ADR-028's awaited seam without
   *reopening* ADR-024's deferred secret-store? Lost/rotated-key operator story?
2. **HMAC vs asymmetric (Ed25519) signing** — receiver-ergonomics + portability tradeoff.
3. **Two-stage delivery (two tables) vs one enriched outbox** — pressure-test the coupling argument.
4. **Full-payload vs thin-pointer** webhook bodies — data-leak blast radius vs receiver callback cost.
5. **`HttpClientPort` ownership** — minted here vs owed by an earlier lib (avoid double-definition).
6. **Delivery-log retention** — Storage/Backups primitive vs an interim cap now.
