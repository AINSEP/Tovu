# Forms multi-destination: delivery contract

Status: RATIFIED by the coordinator 2026-10-20 (drafted by lot F2). Jini side: `packages/cms/src/forms/delivery/`
(Jini `cloud/forms-multidest` @ 40ee5379), exported from `@jini-ai/cms/forms`. Section 2 is the Tovu adapter ABI
lot F4 adds to `apps/website/src/features/form-destinations/types.ts`. Section 9 deviations from the brief/WIP are accepted.
Phase B (F8 M2, fixed in Jini F9J): a first attempt in flight now reads `pending`.

## 1. Jini generic types (`@jini-ai/cms/forms`)

```ts
const FORM_DELIVERY_EVENT = 'form.submission.delivery';      // outbox event of one child job

interface FormDeliveryBinding {
  readonly bindingId: string; readonly adapterId: string; readonly connectionRef: string;
  readonly enabled: boolean;
  readonly formIds?: readonly string[];                      // absent = every form, [] = none
  readonly config: Readonly<Record<string, unknown>>;        // adapter-owned, non-secret
}
interface FormDeliveryField { name; required; maxLength?; multiple?: true; label?; type? } // name = stable field id
interface FormDeliveryForm { slug: string; fields: readonly FormDeliveryField[] }
interface FormDeliverySubmission { id; answers; submittedAt }   // never the source IP
interface FormDeliverySnapshot { form: FormDeliveryForm; submission: FormDeliverySubmission }
interface FormDeliveryJob { binding; snapshot; idempotencyKey: string }  // outbox payload, frozen
interface FormDeliveryPlan { workspaceId; submissionId; formId; jobs: DomainEvent<FormDeliveryJob>[] }

type FormDeliveryErrorCode = 'authorization-required' | 'rate-limited' | 'configuration-invalid'
  | 'mapping-invalid' | 'resource-not-granted' | 'destination-limit' | 'outcome-unknown'
  | 'adapter-unavailable' | 'delivery-failed';
type FormDeliveryResult = { ok: true; reference?: string }
  | { ok: false; error: { code: FormDeliveryErrorCode; retryable: boolean; retryAfterMs?: number;
                          outcome?: 'not-applied' | 'unknown' } };

class FormDeliveryError extends Error { code; retryable; retryAfterMs?; outcome? }  // message === code
const FORM_DELIVERY_MAX_RETRY_AFTER_MS = 3_600_000;
```

Functions (all `(required, optional?)`):

| export | job |
|---|---|
| `planFormDeliveries({ deps, workspaceId, submissionId, formId })` | `deps.plans.once` returns the stored plan or builds + stores it (plan and ALL child jobs in one transaction). deps: `plans`, `bindings({workspaceId})`, `snapshot({workspaceId, submissionId, formId})`, `newId()`, `nowIso()`. |
| `deliverFormJob({ job, deliver })` | one attempt; throws only `FormDeliveryError`. |
| `createFormDeliverySubscriptions({ bus, plan, deliver })` | `.start()` (idempotent, returns a Promise) subscribes `form.submission.received` → `plan({workspaceId, submissionId, formId})` and `form.submission.delivery` → `deliverFormJob` around `deliver({workspaceId, job})`. |
| `formDeliveryRetryPolicy({ backoffMs, maxAttempts })` | policy object for the outbox per-event resolver (section 4). |
| `formDeliveryStatusFromOutbox({ row })` | pure status projection (section 6). |
| `withFormPullLease({...})`, `FORM_PULL_RECENT_MS`, `FormPullLeasePort` | pull admission (section 7). |
| `createFormPullTrigger({ run, onError })` | background runner with `run()` / `stop()` (section 7). |

## 2. Tovu adapter ABI (additive; plugins are `.mjs` and receive plain objects)

```ts
deliver?(required: {
  kit: FormDestinationKit;
  credential: FormDestinationCredential;   // resolved FRESH per attempt by FormDeliveryConnectionPort from binding.connectionRef; never stored in jobs
  form: FormDestinationForm;               // frozen at planning; fields gain OPTIONAL { label?, type? }
  submission: { id; answers; submittedAt };// frozen at planning; IP never included
  binding: FormDeliveryBinding;            // frozen at planning
  idempotencyKey: string;                  // stable per (submissionId, bindingId); identical on every retry
}, optional?: Record<string, never>): Promise<void | FormDeliveryResult>;
type FormDeliveryConnectionPort = (required: { workspaceId; connectionRef; adapterId }, optional?) => Promise<FormDestinationCredential | null>;
```

Credential scope (Phase B, F8 H2, fixed in F9A): a `FormDeliveryConnectionPort` returns null — so the
attempt fails as non-retryable `authorization-required` and the adapter is never called — unless the
connection is granted to the binding's `adapterId` (a custom credential's `worksFor` lists it). Each
attempt's `kit` exposes only `fetch`/`timeouts`/`now`, and `kit.fetch` reaches only the credential's
`baseUrl` origin and its optional `additionalHosts` (exact origin, http/https, no `user:pass@`); any other
URL rejects before a network call with `configuration-invalid` (non-retryable).
`FormDestinationCredential` gains optional `additionalHosts?: readonly string[]`. Plugins run in-process,
so this bounds the kit, not a plugin that calls `globalThis.fetch` itself (only a sandbox would).

`binding` and `idempotencyKey` stay optional in the TS type so receive-only adapters compile
unchanged; the push path always supplies them. The host spreads `job.snapshot` (`form`,
`submission`) plus `job.binding` and `job.idempotencyKey` into the call.

## 3. Error codes and what reaches the ledger

- Only the nine codes above ever reach the outbox `lastError` or a status read. The outbox stores
  `error.message` verbatim, so `FormDeliveryError.message` is always the bare code.
- Legacy `void` adapters: `undefined` = success. `{ ok: true }` = success. Anything else is a failure.
- A thrown error (adapter OR host code inside `deliver`) becomes `delivery-failed`, retryable; the
  original error is NOT kept as `cause` (its text may contain secrets).
- An unknown code (or a malformed `error` object) becomes `delivery-failed`, forced retryable.
- A recognised code is non-retryable only when `retryable === false` exactly.
- `retryAfterMs`: kept only when a finite number ≥ 0; clamped to 1 h. `outcome`: kept only when
  `'not-applied'` or `'unknown'`.
- Host-side refusals use the same class, e.g. `new FormDeliveryError({ code: 'adapter-unavailable', retryable: true })`,
  `{ code: 'authorization-required', retryable: false }` when the connection port returns null.

Suggested meaning per code: `authorization-required` (credential missing/revoked/expired, no
retry), `rate-limited` (retry, honour `retryAfterMs`), `configuration-invalid` (binding config
wrong), `mapping-invalid` (fields do not fit the destination), `resource-not-granted` (credential
valid but the target resource was not shared with it), `destination-limit` (destination full or
quota exhausted), `outcome-unknown` (request sent, result unknown; retry relies on the idempotency
key), `adapter-unavailable` (host could not load the adapter or it has no `deliver`),
`delivery-failed` (anything else).

## 4. Retry semantics

- The outbox worker owns attempts, scheduling, terminal state and restart recovery. A retry
  re-publishes the SAME child job (same id, same idempotency key); jobs are never recreated.
- Tovu registers, through F1's `retryPolicyForEvent` resolver, for `FORM_DELIVERY_EVENT` only:
  `formDeliveryRetryPolicy({ backoffMs: ({ attempts, random }) => computeBackoffMs({ attempts }, { random }), maxAttempts: MAX_DELIVERY_ATTEMPTS })`
  (the webhook backoff helper from `@jini-ai/integrations`; cms does not depend on it, hence injection).
  Every other event keeps the outbox defaults.
- `retryable({ error })`: `false` only for a `FormDeliveryError` with `retryable === false` → terminal at once.
  Any non-delivery error (e.g. a worker timeout) is retryable.
- `backoffMs({ attempts, random, error })`: `max(hostBackoff, error.retryAfterMs)`; `retryAfterMs`
  is already ≤ 1 h, so an adapter can lengthen a wait by at most an hour and never shorten it.
- `FormDeliveryRetryPolicy` is declared locally in cms and is structurally compatible with
  `OutboxRetryPolicy { maxAttempts; backoffMs({attempts, random, error}); retryable?({error}) }`.

## 5. Idempotency and the frozen payload

- One plan per (workspace, submission), stored with all its child jobs in one transaction; a
  replay of `form.submission.received` returns the stored plan even if settings changed. An empty
  selection is still recorded, so bindings added later never backfill.
- Selection: `enabled` and (`formIds` absent or contains the form id).
- Child job ids come from `newId()` at planning and are frozen in the plan.
- `idempotencyKey = JSON.stringify([submissionId, bindingId])`: identical across retries, replays
  and even an independently rebuilt plan. Adapters should pass it to the destination (header or
  dedupe column) when the destination supports it.
- Snapshot: the planner copies only `form.{slug, fields}` and `submission.{id, answers, submittedAt}`
  from the host reader, so a reader returning a whole row cannot leak the source IP.
  Snapshot is read only when at least one binding matched; a missing submission/form throws so the
  source event retries. Local deletion later does not remove copies already delivered.

## 6. Status derivation (`formDeliveryStatusFromOutbox`)

| outbox row | status | nextRetryAt | errorCode |
|---|---|---|---|
| `delivered` | `completed` | null | null |
| `failed` | `failed` | null | safe code of `lastError` |
| `pending`, attempts 0 | `pending` | null | safe code if any |
| `processing`, attempts ≤ 1 (first try in flight; the claim increments attempts before it runs) | `pending` | null | safe code if any |
| `pending`, attempts ≥ 1 | `retrying` | `nextAttemptAt` | safe code of `lastError` |
| `processing`, attempts ≥ 2 | `retrying` | null (in flight) | safe code of `lastError` |

`lastError` is re-sanitised (worker timeout text becomes `delivery-failed`). Tovu's repo calls this
function; it keeps no status table of its own.

## 7. Pull lease and trigger

- `FormPullLeasePort.claim({ workspaceId, receiverKey, token, nowIso, recentMs, leaseMs })` →
  `{ claimed: true } | { claimed: false, reason: 'already-running' | 'recent' }`, atomically:
  unexpired lease held → `already-running`; last start younger than `recentMs` → `recent`;
  else record `nowIso` as last start and hold the lease until `nowIso + leaseMs`. Expired = free
  (crash recovery). A failed pull still counts as a start.
- `release({ workspaceId, receiverKey, token })` clears only if `token` still holds the lease.
- `withFormPullLease({ leases, workspaceId, receiverKey, token, nowIso, leaseMs, trigger, pull })`
  → `{ ran: true, result } | { ran: false, reason }`. Automatic uses `recentMs = FORM_PULL_RECENT_MS`
  (60 000); manual uses 0 (bypasses `recent`, never `already-running`). Release runs in `finally`.
- `leaseMs` is the host's: it must exceed the bounded pull's worst case (pages × per-request
  timeout + ack), proved in a comment and a test next to the pull bounds in Tovu.
- `createFormPullTrigger({ run, onError })`: `run()` never rejects (errors go to `onError`, a
  throwing `onError` is swallowed); `stop()` refuses new runs and awaits live ones. No timers.

## 8. Example push adapter (`.mjs`)

```js
// A generic "append a row over HTTPS" destination. Plain objects in, FormDeliveryResult out.
const MAX_RETRY_AFTER_MS = 60 * 60 * 1000;

function retryAfterMs(response) {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
}

function failure(code, retryable, extra = {}) {
  return { ok: false, error: { code, retryable, ...extra } };
}

export default {
  async deliver({ kit, credential, form, submission, binding, idempotencyKey }, _optional = {}) {
    const row = Object.fromEntries(form.fields.map(field => [field.label ?? field.name, submission.answers[field.name] ?? '']));
    let response;
    try {
      response = await kit.fetch(`${credential.baseUrl}/tables/${encodeURIComponent(String(binding.config.table ?? ''))}/rows`, {
        method: 'POST',
        headers: { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({ submittedAt: submission.submittedAt, values: row }),
      }, { timeoutMs: 15_000 });
    } catch {
      // The request may have reached the destination; the idempotency key makes the retry safe.
      return failure('outcome-unknown', true, { outcome: 'unknown' });
    }
    if (response.ok) return { ok: true, reference: response.headers.get('location') ?? undefined };
    if (response.status === 429) return failure('rate-limited', true, { retryAfterMs: retryAfterMs(response), outcome: 'not-applied' });
    if (response.status === 401) return failure('authorization-required', false, { outcome: 'not-applied' });
    if (response.status === 403) return failure('resource-not-granted', false, { outcome: 'not-applied' });
    if (response.status === 400 || response.status === 422) return failure('mapping-invalid', false, { outcome: 'not-applied' });
    // Never put response text in the result: only the code reaches the ledger anyway.
    return failure('delivery-failed', response.status >= 500);
  },
};
```

## 9. Open points for ratification

- Subscriptions pass `formId` (from `payload.formDefinitionId`) to `plan`; the WIP used `formDefinitionId`.
- `createFormDeliverySubscriptions(...).start()` now returns a Promise (assignable to a `() => void` port).
- `FormDeliveryPlan` gained `formId` so the status tool can report it without a join.
- `withFormPullLease` and `FormPullLeasePort.claim` take `leaseMs` so the lease proof lives with the pull bounds.
