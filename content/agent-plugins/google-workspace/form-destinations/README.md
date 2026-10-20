# `form-destinations/` — the Google Sheets form destination

**Purpose.** Push each accepted form submission into a Google Sheets tab as one row, at least once,
with best-effort dedupe. Declared in `../tovu-form-destinations.json` as `google-sheets` (push only,
no `receive`), and listed under the Sheets product in `../products.json`.

## Public API

`sheets.mjs` default export: `deliver(required, optional)`, the forms delivery contract's push
method (see the forms-multidest delivery contract, §2–§3).

- `required`: `{ kit, credential, form, submission, binding, idempotencyKey }` exactly as the host
  hands a frozen job. `credential.token` is the access token the host resolved for this attempt
  from `binding.connectionRef`; it is used only in the `authorization` header.
- `optional`: `{ productEnabled?, limiter? }` — host ports the contract does not carry yet. Without
  `productEnabled` (or when it returns anything but `true`) delivery refuses as
  `adapter-unavailable`, retryable: Sheets off pauses deliveries, it never enables them by default.
  `limiter` is the plugin's quota limiter (the same budgets the Sheets tools use).
- Returns a `FormDeliveryResult`; it never throws.

Binding config (non-secret, frozen with the job):

```json
{ "spreadsheetId": "…", "tabs": { "<formSlug>": { "sheetId": 7, "columns": [{ "field": "email", "header": "Email" }] } } }
```

`columns` lists the fields the sheet already has headers for, and under which header. Fields not
listed are new: their header (label, else field id) is added at the end of row 1.

## Files

| file | job |
|---|---|
| `sheets.mjs` | One attempt: product check → tab by sheet id → header match → dedupe scan → header growth → RAW append → re-scan after a lost answer. |
| `mapping.mjs` | Field id ↔ header ↔ column; mapping errors; the RAW row (checkbox groups joined `", "`). |
| `dedupe.mjs` | Scans the `_tovu_submission_id` column in 5,000-row chunks; > 50,000 data rows → `destination-limit`. |
| `delivery-result.mjs` | The contract's result shape and the plugin-error → contract-code table. |

## How it fits

All HTTP goes through `../lib/sheets-client.mjs` → `../lib/http.mjs` (the one Google client:
limiter, retries, Retry-After, safe errors). The host's `kit.fetch(url, init, { timeoutMs })` is
the transport. The forms ledger (outbox) owns attempts, backoff and terminal state; this module
only reports one attempt's outcome.

Not exactly-once: there are no row reservations, and a late append or another writer can race the
scan. Two bindings writing to the same tab share the id column, so the second sees the first's row
as already delivered.

## Extension points

A second destination (another product or another provider plugin) copies this shape: a
push-only descriptor, a `deliver` that maps its own errors to the nine contract codes, and its own
dedupe. Nothing here is imported by Tovu core or Jini.

## Wiring left for the forms fan-out lot (G14b)

- Pass `productEnabled` (plugin state view) and `limiter` in `optional`, or extend the contract.
- The OAuth `FormDeliveryConnectionPort` returns `baseUrl: ""`; the push kit only reaches the
  credential's `baseUrl` origin plus `additionalHosts`, so it must allow `https://sheets.googleapis.com`.
