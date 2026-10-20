# Google Workspace plugin (`google-workspace`)

## Purpose

One bundled Agent Plugin for everything Google: the Google sign-in and every Google product as a
module. v1 ships Sheets. All Google-specific code (endpoints, scopes, request formats, response
parsing, revocation, later the Picker) lives here; Tovu core and Jini name no provider. It is seeded
**disabled** (it is not in `BUNDLED_AGENT_PLUGINS_SEEDED_ENABLED`) and is bundled like every other
directory under `content/agent-plugins/` (the build copies it; the bundled-digest ledger records its
digest at seed time, which the executable trust gate checks before any module loads).

## Layout

| Path | What it is |
|---|---|
| `plugin.json`, `mcp.json` | Manifest (no MCP servers). |
| `tovu-connections.json` | The sign-in: Google endpoints, per-client-kind parameters, Picker start params and the `picked_file_ids` callback field, and the NAMES of the host config holding the client ids (`TOVU_GOOGLE_OAUTH_{WEB,DESKTOP}_CLIENT_{ID,SECRET}`, placeholders until the Cloud project exists). `byoClient: true` lets a workspace admin use their own OAuth client instead (saved as the custom credential `google-workspace/account OAuth client`; see `skills/google-workspace/references/connection.md`). |
| `products.json` | Product catalog: id, label, tool prefix (every tool named with it belongs to the product and is gated by it; a security pin enumerates them), required scopes. Sheets = `drive.file` only. |
| `tovu-agent-tools.json` + `tools/` | Executable tools (`p_google_workspace__<name>`): `account_info`, and the Sheets tools in `tools/sheets/` (see its README). |
| `tovu-admin-surfaces.json` + `ui/` | Plugin-owned admin surfaces: the connection panel, Choose spreadsheet (Picker) and Form destinations, each with a server-side `handlerModule`. See `ui/README.md`. |
| `tovu-form-destinations.json` + `form-destinations/` | Push-only `google-sheets` destination (no `receive`): frozen column mapping, bounded submission-id dedupe, contract-shaped results. See `form-destinations/README.md`. Not yet called by the host's forms fan-out (wired in a later lot). |
| `lib/` | Shared code (below). |
| `skills/google-workspace/` | What the in-app assistant reads. |
| `__tests__/` | `fake-google-http.mjs` (127.0.0.1 fake Google) and the OAuth contract pins. |

## `lib/` public API

| Module | Exports |
|---|---|
| `auth.mjs` | Default `{ createHooks({ http }) }`: Jini's `ApiConnectionHooks` (`resolveScopes`, `readAccount`, `revoke`). `GOOGLE_REVOCATION_ENDPOINT`, `GOOGLE_ACCOUNT_ACCESS_PAGE`. |
| `http.mjs` | `createGoogleClient({ http, connections }, { sleep, random }).request({ connectionRef, url, method, query, body, kind })`; `accessTokenFor`; `buildUrl`; `pathSegment` (one encoded path segment, dot segments refused). |
| `drive-files.mjs` | `readAccount({ client, connectionRef })` via Drive `about.get` (works under `drive.file`); `copyFile({ client, connectionRef, fileId, name }, { parentId })` via Drive `files.copy`. |
| `sheets-client.mjs` | The one Sheets client: `sheetsClientFor({ capabilities })` (Sheets product gate per request), `googleClientFor` (ungated: delivery), `sendSheetsRequest`, `assertSpreadsheetId` / `SPREADSHEET_ID_PATTERN` (the one id rule, also every schema's pattern), `sheetsUrl` (the one URL builder; checks the id), `getSpreadsheet`, `runBatchUpdate` (inventory check first), `valueInputOption` (RAW default), `SHEETS_LIMITS` and the bounds (`boundValueRanges`, `assertPayloadWithin`, `outputFits` / `assertOutputWithin`, `spreadsheetFields` (grid-data masks need the opt-in)), `resourceLines` (card lines), `spreadsheetLine`, `tabsOf`. |
| `sheets-a1.mjs` | A1 helpers, one name and contract each: `columnName`, `columnIndex`, `parseA1Range` (Google's normalized range → parts or undefined), `parseBoundsA1` (a plain `A1:B2` → bounds, else `invalid-input`), `tabRange` (tab-title quoting), `gridRangeLabel` (card label). |
| `product-state.mjs` | `PRODUCTS` (validated catalog), `scopesFor({ productIds })`, and the product gate: `PRODUCT_STATE_KEY` (`'products'`), `isProductEnabled({ state, productId })`, `assertProductEnabled(...)` (`product-disabled`), `productEnabledReader({ state, productId })` (the `productEnabled` port form delivery takes, built from the host's read-only plugin-state reader). A product is off unless the plugin's settings hold `products: { <id>: true }`. |
| `picker-selection.mjs` | `verifySelectedSpreadsheet({ client, connectionRef, fileId, expectedAccountId })` (plain Drive id, same account, spreadsheet MIME via Drive `files.get`, real access via Sheets `spreadsheets.get`; metadata only), `verifySpreadsheetAccess({ client, connectionRef, fileId })` (live spreadsheet per Drive, then opened by the Sheets API; shared with `sheets_open_existing`), `parsePickedFileIds({ value })` (desktop callback field → one id or null on cancel), `DESKTOP_PICKER_START_PARAMS`, `SPREADSHEET_MIME_TYPE`. |
| `surface-actions.mjs` | For the admin-surface handlers: `CONNECTION_ID` (`'account'`), `surfaceSheetsClient({ capabilities })` (the one Sheets client over the surface port, which names connections by id), `surfaceAccount`, `sheetsUnavailableReason`, `withSurfaceFailures` (plugin/host refusals → surface-safe failures), `surfaceRefusal`. |
| `picker-flow.mjs` | `createPickerFlow({}, { now, randomId })` → `bootstrap` (hosted session + short-lived token, or `system-browser` / `unavailable`), `verifyHosted`, `startSystemBrowser`, `finishSystemBrowser`; `readPickedSpreadsheets`, `rememberPickedSpreadsheet`, `PICKER_CONFIG_NAMES`, `PICKER_SESSION_TTL_MS`. |
| `form-destination-settings.mjs` | `readFormDestinations`, `writeFormDestinations`, `bindingConfigFor({ formSlug, destination })`, `FORM_SLUG_PATTERN`, `MAX_FORM_DESTINATIONS`. |
| `request-policy.mjs` | `GoogleWorkspaceError`, `classifyFailure`, `parseRetryAfter`, `backoffMs`, `shouldRetryInline`. |

## Rules the plugin keeps

- Tokens come only from the host capability, right before each request; only access tokens ever
  reach the plugin, and none is returned, logged or put in an error.
- Errors carry a fixed message per code, never Google's text (it echoes ranges and values).
- `kind: 'write'` (append, create, copy) with an unknown outcome is `uncertain-outcome` and never
  retried; reads and idempotent writes retry with jittered backoff that honours Retry-After.
- Revocation is confirmed only by Google's 200.
- The budgets declared in `tovu-connections.json` (45/min per account, 240/min per instance) are
  charged by the host on every token read; its refusal (`rate-limited`) becomes `quota-delay` with
  the host's `retryAfterMs` and `outcome: 'not-applied'`, and follows the same inline backoff rules
  as Google's 429 (nothing was sent, so even an append may wait and retry).
- Modules import nothing outside this directory except what the host injects.

## How it fits

`tovu-connections.json` is read by Tovu's `features/api-connections/contribution.ts` and run by
Jini's `@jini-ai/integrations/api-connections` service; tools by `features/agent-plugins/executable-tools`
over `@jini-ai/agent-plugins/lifecycle/tools`; surfaces by `features/agent-plugins/admin-surfaces`;
the destination by `features/form-destinations/registry.ts`.

## Extension points

A new product adds an entry to `products.json` (its scopes), its tools to `tovu-agent-tools.json`
under its own prefix, and its modules under `products/<id>/`, all on the same sign-in.

## Known gaps

- Products are read from the plugin's settings and default to OFF; the connection panel writes them.
  The host does not yet pass delivery a `productEnabled` port (G14b wires `productEnabledReader`
  over its plugin-state reader), nor read the Form destinations panel's saved choices into form
  bindings (`form-destinations` settings key; `bindingConfigFor` builds the binding config).
- Panels (G13b) are built and unit-tested only; they need a Chrome check (hosted Picker inside the
  sandboxed frame, desktop system-browser Picker, the account-page button). The host says whether it
  is hosted or desktop (`context.hostKind`); a hosted site also needs both
  `TOVU_GOOGLE_PICKER_BROWSER_KEY` and `TOVU_GOOGLE_PICKER_APP_ID` (placeholders, never real values)
  or the Picker is `picker-not-configured`. The panels cannot open links themselves (no
  `allow-popups`): the connection panel declares `linkOrigins: ["https://myaccount.google.com"]` and
  asks the admin page to open the Google account-access page (`client.openLink`); the address also
  stays visible as text.
- Quotas: the per-account (45/min) and per-instance (240/min) budgets declared in
  `tovu-connections.json` are implemented by the host and charged on every token read; there is no
  plugin-side limiter. Form delivery is charged once per delivery until it reads a token per
  request (G14b).

## Sheets admin tools (`tools/sheets-admin/`, lot G12)

Eleven tools for tabs, sorting, filters, filter views, formatting, named and protected ranges,
developer metadata, raw batch updates, CSV export and opening a picked file; see
`tools/sheets-admin/README.md`. Their helpers:

| Module | Exports |
|---|---|
| `lib/sheets-admin-request-kinds.mjs` | `REQUEST_KINDS` (the reviewed batchUpdate inventory: effect, replay class, required fields), `checkRequests`, `describeRequests`, batch bounds. |
| `lib/sheets-admin-csv.mjs` | `planChunks`, `encodeCsv`, export bounds. |

These tools use the plugin-side codes `invalid-input` and `limit-exceeded` (shared with the values
tools) and add `unsupported-request`; `sheets_open_existing` reuses the Picker's `not-a-spreadsheet`, plus an optional plugin-composed `detail`
on `GoogleWorkspaceError` (a request index or kind name, never Google's text or a cell value).
