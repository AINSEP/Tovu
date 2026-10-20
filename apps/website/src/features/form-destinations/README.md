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

## Credential scope

A binding can only use a credential its owner scoped to that destination, and the credential can
only travel to the hosts it was saved for:

- The connection port hands a credential to an adapter only when the credential's `worksFor`
  lists the binding's `adapterId`. Otherwise the attempt fails at once as `authorization-required`
  (not retried) and the adapter is never called. To connect a destination, add its id to the
  credential's "works for" list.
- Each attempt's adapter gets a kit with only `fetch`, `timeouts` and `now`. Its `fetch` reaches
  only the credential's `baseUrl` origin and its `additionalHosts`: the same exact-origin check
  `custom_credential_make_request` applies (http/https only, no `user:pass@`). Any other URL is
  refused before a network call with `configuration-invalid` (not retried). If a destination needs
  another API host, add it to the credential's additional hosts.

## Deleting a submission, stopping a destination

Permanently deleting a submission (a Trash purge of the submission, or of its form with every
submission it had) scrubs Tovu's own frozen copies in the same transaction: the answers in that
submission's delivery jobs are blanked, and jobs not yet finished are failed with
`delivery-failed`, so they never deliver afterwards. Copies a destination already received are
outside Tovu and stay there; remove them at the destination.

Disabling or deleting a binding only stops planning for submissions that arrive afterwards. Jobs
already planned keep their frozen binding and keep retrying on their schedule (up to 8 attempts
over about a day). To stop those too, delete or revoke the binding's saved credential (its
`connectionRef`): the next attempt finds no credential and fails at once with
`authorization-required`, without calling the destination.

## Public API

- `types.ts`: the module ABI (`FormDestinationModule`, `FormDeliveryConnectionPort`, …).
- `registry.ts`: loads and validates contributed destinations.
- `deliver.ts`: `createFormDestinationDeliverer` (one push attempt). It hands the connection port
  the job's frozen `binding` (`optional.binding`) and, when the composition gives it a
  `pluginState` reader, each adapter its own plugin's read-only settings (`optional.state`).
- `connection-port.ts`: `createCustomCredentialConnectionPort` (a saved custom credential by id).
- `port.ts`, `pull.ts`, `select.ts`, `key-store.ts`, `rewrite-actions.ts`: the receive side.

## Extension points

- **A new destination**: a plugin ships a `.mjs` module with `deliver` and a descriptor without
  `receive`. Nothing in core changes.
- **A new connection kind** (for example OAuth): implement `FormDeliveryConnectionPort` and bind
  it in the site composition instead of, or beside, the custom-credential port. It must resolve by
  stable id within the given workspace, return null when there is no usable credential or the
  connection is not granted to `adapterId`, return the origins it may reach (`baseUrl` +
  `additionalHosts`, exact origins), and never cache or persist what it returns. The site binds the
  plugin OAuth port (`features/api-connections/form-delivery-connection.ts`) ahead of the
  custom-credential port in `server/runtime/composition/form-delivery-deliverer.ts`.
