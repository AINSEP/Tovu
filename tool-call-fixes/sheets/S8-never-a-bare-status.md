# S8. The MCP client never prints a status alone (C3, mechanism M5, client half)

Repo: Jini. Package: `mcp`. Estimate: 160k Sonnet. Prerequisites: none. Coordinate: error-system E2 moves the `ERR-…`
id function to core. If it has landed, take the `ids` port from it; if not, inject a port with the same signature and
let the composition root pass today's function. Do not create a second id format.

## Read first
`../DESIGN.md` §2.5, M5. `mcp/src/server/daemon-client.ts` (`formatDaemonHttpError`, `parseJsonLoose`,
`readJsonWithLimit`, `DaemonHttpError`, `requestDaemonJson`), `protocol/src/errors.ts` (`decodeApiError`),
`mcp/src/bin/serve.ts` (composition root), `mcp/src/server/__tests__/daemon-client.test.ts`.

## Inventory step
Every reader of `DaemonHttpError` and every test asserting a message that starts with `HTTP ` (`rg "HTTP \$\{|'HTTP |\"HTTP " packages ../Tovu/apps ../Tovu/packages`). Tovu tests that assert `HTTP 4xx: CODE: text` are consumers: list them. The `HTTP <status>: <CODE>: <message>` form for a **well-formed envelope stays byte-identical** (old readers × new client).

## Characterization (passes today)
`daemon-client.bare-status.characterization.test.ts` with a fake `fetchImpl`:
| Response | Message today |
|---|---|
| 500, `text/html`, Express error page | `HTTP 500` |
| 404, `{"error":"a live run is required"}` | `HTTP 404` |
| 503, `{"error":"site scope is closed"}` | `HTTP 503` |
| 500, empty body | `HTTP 500` |
| 403, `{"error":{"code":"TOOL_OPERATION_DENIED","message":"x"}}` | `HTTP 403: TOOL_OPERATION_DENIED: x` |

## Red-first (fails: first four rows are bare)
Exact new texts (ids port returns `ERR-AAAA-BBBB-CCCC-DDDD`):
1. `The tool service failed (HTTP 500). Server said: "Internal Server Error". Reference: ERR-AAAA-BBBB-CCCC-DDDD. Do not retry the same call; give the user this reference.`
2. `HTTP 404: a live run is required` (flat envelope decoded; a flat `code` is included when present).
3. `The tool service is restarting or closed (HTTP 503): site scope is closed. Wait a few seconds and retry once.`
4. `The tool service failed (HTTP 500) and sent no details. Reference: ERR-AAAA-BBBB-CCCC-DDDD. Do not retry the same call; give the user this reference.`
5. row 5 unchanged, and a nested envelope with `requestId` appends ` Error ID: <requestId>.`
Property test: statuses 400 to 599 × bodies {empty, HTML, flat, nested, invalid JSON, 5 MB of `a`} → the message never matches `/^HTTP \d{3}$/`, is at most 700 characters, and contains either a server sentence or `Reference:` / `Error ID:`.
Secret test: an HTML body containing a bearer token and a URL with a query → both masked in the output.

## Change
1. New `mcp/src/server/daemon-error-text.ts` (pure): `describeDaemonFailure({ status, body, contentType }, { ids, vocabulary })` → `{ message, code?, requestId? }`. Uses `decodeApiError`; never stringifies an arbitrary object.
2. `readJsonWithLimit` returns `{ data, text }` (bounded) so a non-JSON body's first line is available; success-path callers still get `data`.
3. `DaemonHttpError` gains `code?` and `requestId?`. `DaemonRequestOptions` gains `ids?` and `log?` ports; when a reference is minted, one log line: status, route, content type, body length. No body text in the log.
4. `daemon-client.ts` must end under 300 lines; the formatter leaves it.

## Acceptance
All rows and the property test green with exact text; `daemon-client.test.ts` count not lower; the Tovu consumers from the inventory still pass unchanged (run them against the linked build) or are listed with the exact line that changed and why.
