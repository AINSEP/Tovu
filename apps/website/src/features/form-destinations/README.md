# form-destinations

Where a site's form submissions go, as an Agent Plugin contribution category
(`tovu-form-destinations.json` plus a contained `.mjs` module). No vendor is named here; plugins
bring the vendors.

## Two directions

- **Receive** (`pull`/`ack`, optional `prepare`): a static export cannot run Tovu, so a receiver
  stores submissions at the host and Tovu pulls them back (`pull.ts`, `port.ts`, `select.ts`).
- **Push** (`deliver`): after a submission is safely in Tovu, each matching delivery binding gets
  its own durable outbox job that calls the destination's `deliver` (`deliver.ts`). One failing
  destination never blocks another, and retries reuse the same job and idempotency key.

## Push delivery in one paragraph

A site lists its destinations in the `core.forms/deliveryBindings` setting
(`features/settings/form-delivery.ts`): `{ bindingId, adapterId, connectionRef, enabled,
formIds?, config }`. `adapterId` is a destination id from this registry; `connectionRef` names a
saved connection, never a secret; `config` is the adapter's own non-secret settings (secret-shaped
keys or values are refused). When a submission arrives, Jini's planner (`@jini-ai/cms/forms`)
freezes the form (fields with label and type), the answers and the binding into one job per
binding. On every attempt `deliver.ts` loads the adapter, resolves the credential afresh, and calls
`deliver({ kit, credential, form, submission, binding, idempotencyKey })`. The adapter returns
nothing or `{ ok: true }`, or `{ ok: false, error: { code, retryable, retryAfterMs? } }` with one
of the contract's error codes. Only the code is ever stored; messages are dropped. Status per
binding (`forms_delivery_status`) is read from the same outbox rows. Delivery copies data out:
deleting a submission or a binding in Tovu does not remove copies a destination already has.

The full contract, with an example adapter, is `.cloud-coord/forms-multidest-contract.md`.

## Public API

- `types.ts`: the module ABI (`FormDestinationModule`, `FormDeliveryConnectionPort`, …).
- `registry.ts`: loads and validates contributed destinations.
- `deliver.ts`: `createFormDestinationDeliverer` (one push attempt).
- `connection-port.ts`: `createCustomCredentialConnectionPort` (a saved custom credential by id).
- `port.ts`, `pull.ts`, `select.ts`, `key-store.ts`, `rewrite-actions.ts`: the receive side.

## Extension points

- **A new destination**: a plugin ships a `.mjs` module with `deliver` and a descriptor without
  `receive`. Nothing in core changes.
- **A new connection kind** (for example OAuth): implement `FormDeliveryConnectionPort` and bind
  it in the site composition instead of, or beside, the custom-credential port. It must resolve by
  stable id within the given workspace, return null when there is no usable credential, and never
  cache or persist what it returns.
