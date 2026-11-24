# webhooks Overview

Owns the outbound webhook subsystem (ADR-036): subscription CRUD, HMAC-signed delivery on the
outbox pattern, and retry/backoff to a dead-letter state. The outbound-connector/secret-sealer
half (`integration_secrets`, `SecretSealerPort`) is a deferred v1 seam — types/ports exist, no
runtime logic lands here yet.

## Responsibilities

- validate and persist webhook subscription edits (`subscriptions.ts`)
- fan a delivered domain event out to matching active subscriptions, idempotently
  (`delivery.ts`'s `enqueueDelivery`)
- claim due deliveries, run the `webhooks.beforeDispatch` hook chain, sign, and POST
  (`delivery.ts`'s `processDueDeliveries`)
- compute the exact `Tovu-Signature` header and verify it (`signing.ts`)

## Rules

- Keep webhook business rules inside this library, not in Express routes or admin shells.
- Repositories stay behind `WebhookSubscriptionRepoPort` / `WebhookDeliveryRepoPort`
  (`ports.ts`); `HttpClientPort` is imported from `../http` (ADR-038), never redeclared here.
- Signing secrets are never persisted — they are a `Buffer` parameter today (`signing.ts`),
  passed in by whatever resolves them; production wiring is
  `KeyringPort.deriveSigningSecret()` once that port's home is finalized (ADR-036 Round-3 fold
  notes `KeyringPort` needs its own ADR-041; not this task's job to build).
- A `webhooks.beforeDispatch` contributor that throws, rejects, or returns `{ send: false }`
  fails the whole delivery attempt closed — it never causes a fallback dispatch of the
  unfiltered envelope. See `delivery.ts`'s `runBeforeDispatchHooks` doc comment.
- `deleteSubscription` never row-deletes; it soft-disables (`status: "disabled"`,
  `disabledAt` stamped) for audit durability, matching that the port has no `delete` method.

## Known gap (flagged for the Architect, not fixed here)

`WebhookDeliveryRecord` (types.ts) carries no payload/data column, matching ADR-036 §2's DDL
sketch — but the delivery worker still needs the original event's `data` to build the envelope
it signs at Stage B, potentially in a later process/tick than Stage A's fan-out. `@jini-ai/integrations/webhooks/site/repo.memory`
adds a `DeliveryEnvelopeStore` side-channel (NOT part of the reviewed port surface) as a stand-in
seam so `enqueueDelivery` and `processDueDeliveries` are independently testable now. The real
answer — re-hydrate from the core event outbox by `event_id`, add a payload column to
`webhook_deliveries`, or something else — is an open decision for whoever owns ADR-036 next.

## Built, not "future direction"

**Corrected 2026-08-29** — this section previously claimed these were unbuilt; they were not.
SQLite adapters for both ports — `SqliteWebhookSubscriptionRepo implements WebhookSubscriptionRepoPort`
and `SqliteWebhookDeliveryRepo implements WebhookDeliveryRepoPort` — already exist and are live-wired
into the composition root (`server/runtime/composition/deps.ts`). **Deviation from every sibling
feature's convention worth knowing**: they live at `platform/db/sqlite/webhook-repo.sqlite.ts`, not a
co-located `repo.sqlite.ts` the way `features/post/repo.sqlite.ts` and others do (the in-memory
adapters moved to `@jini-ai/integrations/webhooks/site/repo.memory`; callers import that subpath and the
`DeliveryEnvelopeStorePort` type from `@jini-ai/integrations/webhooks` directly). Not fixed here; flagged so the next person who
touches webhook persistence doesn't have to rediscover it.

## Future direction

- Wire `subscriptions.ts`'s `isAllowedTarget` to the real `core/origin` egress allowlist
  (ADR-040) once that module lands; it is currently an injected function so this library
  doesn't have to guess `src/origin`'s shape.
- Wire `signing.ts`'s `WebhookSigner` to `KeyringPort.deriveSigningSecret()` for derive-not-store
  signing secrets (ADR-036 §5), including the rotation-overlap dual-signature case
  (`previousSecretVersion`) — `verifySignature` already accepts a header carrying multiple `v1=`
  values, but nothing in this task's scope constructs one yet.
- The deferred `integration_secrets` / `SecretSealerPort` outbound-connector half (ADR-036 §8).

## Wiring

- `RuntimeMode` (the type) is imported from `@jini-ai/core/contracts/site/core-runtime-mode`; `resolveRuntimeMode` (the value) still comes from `#src/contracts/core/runtime-mode`, which the composition root calls and passes down.

### Forwarding lines removed

`delivery.ts` re-exports nothing from `@jini-ai/integrations/webhooks`; `computeBackoffMs`,
`MAX_DELIVERY_ATTEMPTS` and the delivery option/result types are imported from there. `ports.ts` was a pure
forward of the webhook ports (`RootKeyHandle` as `SiteKeyHandle`, the repo ports) and of the outbound
`HttpClientPort`; it is gone, importers take the ports from `@jini-ai/integrations/webhooks`,
`RootKeyHandle` where they used `SiteKeyHandle`, and the HTTP types from `platform/http/ports.js` /
`@jini-ai/core/primitives`. `index.ts` now keeps only the `WebhookDeliveryRecord` forward and the site-key lines
that route registrations (`routes/integrations/list.ts`, `routes/system/site-key.ts`,
`routes/system/deployment-overview.ts`, `routes/publish-trust/handshake.ts`) still import from it. The file
header of the removed `ports.ts` carried these notes (kept verbatim):

> @file Canonical Jini webhook port exports with Tovu's outbound HTTP policy (ADR-036/ADR-038).
> Webhook dispatch is core outbox orchestration, not an extra mediator/port (ADR-006/ADR-009).
> Repo contracts are workspace-scoped; adapters own durable claims and deduplication.
>
> Site-key custody: raw key bytes remain outside portable content.db and never cross the SDK/ABI
> surface (ADR-024); handles name the active generation. Signing secrets are deterministically
> derived per workspace/subscription/version, never stored. Rotation requires receivers to
> re-copy signing material and export to rewrap sealed credentials. Other consumers use generic
> derive because analytics/unsubscribe contexts cannot fit the webhook-specific derivation shape.
> purpose MUST affect HKDF and stay domain-separated from deriveSigningSecret; info alone would
> make that namespace decorative and allow cross-purpose collisions.
>
> Recoverable outbound credentials are sealed under the site key; content.db holds ciphertext.
> New seals require AAD. Opens require the byte-identical binding or authentication fails, so rows
> cannot transplant ciphertext across workspace/provider/credential scope. GCM authenticates AAD
> without storing it; callers re-derive it from context. Absent open AAD remains valid for old
> unbound rows; per-store aad_version/backfill policy belongs to each credential store.
>
> Delivery retry state stays in a distinct table because each endpoint retries independently of
> the source event outbox. Durable enqueue may atomically co-persist the envelope with its record;
> delivery.ts documents why the following envelopeStore.save remains safe for both adapter forms.
> listBySubscription orders newest-first by createdAt/id before applying the limit.
> Integration-secret persistence is a seam for outbound connectors, not ownership of their runtime.

## Wiring (delivery)

The delivery binding is owned by `@jini-ai/integrations/webhooks/site/delivery`. Tovu injects its wire
header names (`TOVU_WEBHOOK_HEADERS` in `wire-headers.ts`: `tovu-signature`, `tovu-delivery-id`,
`tovu-event-id` — byte-identical wire values) as `deps.headers` in
`server/runtime/composition/webhook-delivery-worker.ts`; `__tests__/delivery.test.ts` pins them on the wire.
