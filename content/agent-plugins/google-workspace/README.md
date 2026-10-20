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
| `tovu-connections.json` | The sign-in: Google endpoints, per-client-kind parameters, Picker start params and the `picked_file_ids` callback field, and the NAMES of the host config holding the client ids (`TOVU_GOOGLE_OAUTH_{WEB,DESKTOP}_CLIENT_{ID,SECRET}`, placeholders until the Cloud project exists). |
| `products.json` | Product catalog: id, tool prefix, form destinations, required and optional scopes. Sheets = `drive.file` only. |
| `tovu-agent-tools.json` + `tools/` | Executable tools (`p_google_workspace__<name>`): `account_info`, and the Sheets tools in `tools/sheets/` (see its README). |
| `tovu-admin-surfaces.json` + `ui/` | Plugin-owned admin surfaces. Today a static placeholder; the connection panel and Picker replace it. |
| `tovu-form-destinations.json` + `form-destinations/` | Push-only `google-sheets` destination (no `receive`). Refuses as retryable until the mapping/dedupe adapter lands. |
| `lib/` | Shared code (below). |
| `skills/google-workspace/` | What the in-app assistant reads. |
| `__tests__/` | `fake-google-http.mjs` (127.0.0.1 fake Google) and the OAuth contract pins. |

## `lib/` public API

| Module | Exports |
|---|---|
| `auth.mjs` | Default `{ createHooks({ http }) }`: Jini's `ApiConnectionHooks` (`resolveScopes`, `readAccount`, `revoke`). `GOOGLE_REVOCATION_ENDPOINT`, `GOOGLE_ACCOUNT_ACCESS_PAGE`. |
| `http.mjs` | `createGoogleClient({ http, connections }, { limiter, sleep, random }).request({ connectionRef, url, method, query, body, kind })`; `accessTokenFor`; `buildUrl`; `pathSegment` (one encoded path segment, dot segments refused). |
| `drive-files.mjs` | `readAccount({ client, connectionRef })` via Drive `about.get` (works under `drive.file`); `copyFile({ client, connectionRef, fileId, name }, { parentId })` via Drive `files.copy`. |
| `sheets-client.mjs` | The Sheets request helper: `sheetsUrl`, `sendSheetsRequest`, `valueInputOption` (RAW default), `SHEETS_LIMITS` and the bound helpers (`boundValueRanges`, `assertPayloadWithin`, `assertOutputWithin`), A1 helpers, `resourceLines` (card lines). |
| `product-state.mjs` | `PRODUCTS` (validated catalog), `scopesFor({ productIds })`. |
| `request-policy.mjs` | `GoogleWorkspaceError`, `classifyFailure`, `parseRetryAfter`, `backoffMs`, `shouldRetryInline`, `QUOTA_BUDGETS`. |

## Rules the plugin keeps

- Tokens come only from the host capability, right before each request; only access tokens ever
  reach the plugin, and none is returned, logged or put in an error.
- Errors carry a fixed message per code, never Google's text (it echoes ranges and values).
- `kind: 'write'` (append, create, copy) with an unknown outcome is `uncertain-outcome` and never
  retried; reads and idempotent writes retry with jittered backoff that honours Retry-After.
- Revocation is confirmed only by Google's 200.
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

- The host limiter runs one profile (240/min + burst) for every key, so the per-account 45/min
  budget is declared here but enforced only at the host profile until the host accepts
  plugin-declared budgets.
- Per-workspace product on/off state, Picker and the delivery adapter are later lots.

## Sheets admin tools (`tools/sheets-admin/`, lot G12)

Eleven tools for tabs, sorting, filters, filter views, formatting, named and protected ranges,
developer metadata, raw batch updates, CSV export and opening a picked file; see
`tools/sheets-admin/README.md`. Their helpers:

| Module | Exports |
|---|---|
| `lib/sheets-admin-request-kinds.mjs` | `REQUEST_KINDS` (the reviewed batchUpdate inventory: effect, replay class, required fields), `checkRequests`, `describeRequests`, batch bounds. |
| `lib/sheets-admin-common.mjs` | `spreadsheetUrl`, `checkedFileId`, `clientFor`, `getSpreadsheet`, `runBatchUpdate`, `boundedOutput`, `spreadsheetLine`, `tabsOf`, `MAX_OUTPUT_BYTES`. |
| `lib/sheets-admin-ranges.mjs` | `columnLetters`, `gridRangeLabel`, `parseA1Range`. |
| `lib/sheets-admin-csv.mjs` | `planChunks`, `encodeCsv`, export bounds. |

These tools use the plugin-side codes `invalid-input` and `limit-exceeded` (shared with the values
tools) and add `unsupported-request` and `wrong-file-type`, plus an optional plugin-composed `detail`
on `GoogleWorkspaceError` (a request index or kind name, never Google's text or a cell value).
