# integrations Overview

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
it signs at Stage B, potentially in a later process/tick than Stage A's fan-out. `repo.memory.ts`
adds a `DeliveryEnvelopeStore` side-channel (NOT part of the reviewed port surface) as a stand-in
seam so `enqueueDelivery` and `processDueDeliveries` are independently testable now. The real
answer — re-hydrate from the core event outbox by `event_id`, add a payload column to
`webhook_deliveries`, or something else — is an open decision for whoever owns ADR-036 next.

## Future direction

- Wire `subscriptions.ts`'s `isAllowedTarget` to the real `core/origin` egress allowlist
  (ADR-040) once that module lands; it is currently an injected function so this library
  doesn't have to guess `src/origin`'s shape.
- Wire `signing.ts`'s `WebhookSigner` to `KeyringPort.deriveSigningSecret()` for derive-not-store
  signing secrets (ADR-036 §5), including the rotation-overlap dual-signature case
  (`previousSecretVersion`) — `verifySignature` already accepts a header carrying multiple `v1=`
  values, but nothing in this task's scope constructs one yet.
- SQLite adapters for `WebhookSubscriptionRepoPort` / `WebhookDeliveryRepoPort` (the other half
  of each ADR-006 rule-of-two); the real guarded `HttpClientPort` transport is `src/http`'s job.
- The deferred `integration_secrets` / `SecretSealerPort` outbound-connector half (ADR-036 §8).
