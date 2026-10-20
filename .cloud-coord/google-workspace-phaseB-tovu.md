# google-workspace — Phase B review, Tovu side (read-only)

Reviewer: Software Architect + Code Inspection + Security lenses (persona files loaded:
AI-Dev-Shop/agents/{software-architect,code-inspection,security}/skills.md).
Scope: `git diff origin/restructure/apps-website-phased...cloud/google-workspace -- . ':!.cloud-coord'`
at 4d49295be (154 files, +11,438). Production code read in full; tests were read only where they
show design (the vertical-slice test computes `connectionRef` itself, see H1).
No edits, commits or suite runs. B2's known shape mismatches (attemptId, workspaceId on ref ops,
vocabulary) in api-connections/{connect,host,surface-connections}.ts are not reported; their logic is.

Severity: High = an owner decision is unmet or the feature cannot work end to end as designed;
Medium = a security gap or a contract bug that will bite when the unwired parts are wired;
Low = trimming, naming, docs. "OD?" = an owner decision is needed (yes/no).

Vendor neutrality: PASS. A grep of every generic production file in scope (api-connections,
executable-tools, admin-surfaces, connect-tool.ts, the callback/surface routes,
agent-plugin-connections.ts, the admin frame/hooks) for
`google|googleapis|gsheets|spreadsheet|drive\.file|picker` finds nothing outside `__tests__`.

---

## HIGH

### H1. Chat has no way to get a `connectionRef`, so no plugin tool can be called
- Where: every tool schema in `content/agent-plugins/google-workspace/tovu-agent-tools.json` requires
  `connectionRef` ("the connectionRef from the connection status"). `agent_plugin_connect`
  (`connect-tool.ts` `connectDeclaredApiConnectionOrRefuse`, `api-connections/connect.ts:172-184`)
  returns only `{ status }`. No tool or card returns the ref.
  `server/runtime/composition/__tests__/agent-plugin-connections.vertical-slice.test.ts:175` derives
  the ref with `deriveApiConnectionKey` itself, so the slice test hides the gap. SKILL.md step 3
  (`account_info { connectionRef }`) cannot be followed.
- Category: contract / functional.
- Smallest change: return the opaque ref from the API-connection branch:
  `{ status, connectionRef }` (it is a plugin-scoped key, not a secret; the host already refuses
  refs the calling plugin does not own). Document it in SKILL.md and connection.md. Alternative: the
  host fills a missing top-level `connectionRef` with the calling plugin's single declared
  connection, which would make the input optional.
- OD? no (the coordinator picks one; the first is smaller).

### H2. Product enable/disable is not implemented: tools ignore it and delivery is always off
- Where: `lib/product-state.mjs:9` ("on/off state is added here when the connection panel stores
  it"). No tool reads the plugin state, and the `product-disabled` code
  (`lib/request-policy.mjs:40`) is never thrown. `form-destinations/sheets.mjs:138-145` treats a
  missing `productEnabled` port as off, and nothing provides that port. So Sheets tools always run,
  and deliveries always answer `adapter-unavailable` (retryable), which means they retry forever once
  wired. `references/connection.md:17` claims "Turning a product off stops its tools … straight
  away", which is false today. `products.json` `toolPrefix`/`formDestinations` exist for exactly this
  and are unused.
- Category: owner decision unmet.
- Smallest change: one helper in the shared client, `assertProductEnabled({ state, productId })`
  over `capabilities.state.get({ key: 'products' })`, called by `sendSheetsRequest` and the admin
  `clientFor`. Use `products.json` `toolPrefix` to map tool to product. Delivery gets the same reader
  (`host.pluginState.readerFor`) in G14 instead of an optional `productEnabled` callback. Until a
  surface can write the flag, either default Sheets to ON or ship the toggle with G13.
- OD? yes, for the default before the panel exists (on or off).

### H3. The Picker and connection panel are not shipped; the selection code is unused
- Where: `ui/connection-panel.html` is a "coming soon" placeholder; `tovu-admin-surfaces.json`
  declares no handlers or actions. `lib/picker-selection.mjs` (`verifySelectedSpreadsheet`,
  `parsePickedFileIds`, `DESKTOP_PICKER_START_PARAMS`) is imported only by tests. With no panel there
  is no in-product revoke, switch-account, reassign-bindings or account-access-page link, and no
  "Choose spreadsheet" (hosted or desktop).
- Category: owner decision unmet (Picker, account actions, revoke UI). Known lot G13. The host seams
  now exist after G6d, but plugin README "Known gaps" (`README.md:66-74`) still says they are
  blocked, which is stale.
- Smallest change: G13 builds the surface handlers (bootstrap = short-lived token + public config;
  action `select` → `verifySelectedSpreadsheet` → `state.set`; desktop `begin` with
  `DESKTOP_PICKER_START_PARAMS` → `takeCallbackFields` → `parsePickedFileIds`). Refresh the README
  gaps now.
- OD? no.

### H4. `tovu-connections.json` declares no `apiOrigins`, `scopeSets` or `redirectOrigins`
- Where: `content/agent-plugins/google-workspace/tovu-connections.json:4-29`.
  - No `apiOrigins`: `api-connections/form-delivery-connection.ts:51` yields `baseUrl: ""`, which
    means "nothing allowed". Form delivery to Sheets would be refused on every request once G14 wires
    the port.
  - No `scopeSets`: `surface-connections.ts` `grantedScopeSets` always reports `[]`, so a panel can
    never show that Sheets is granted.
  - No `redirectOrigins`: `host.ts:112` treats that as "any origin". The owner asked for "known
    callback origins first (placeholder config list)". Without the list, an unregistered self-hosted
    site gets Google's `redirect_uri_mismatch` page instead of Tovu's actionable refusal.
- Category: owner decision / contract.
- Smallest change: add `"apiOrigins": ["https://sheets.googleapis.com", "https://www.googleapis.com"]`,
  `"scopeSets": ["sheets"]` and `"redirectOrigins": [<placeholder origins>]` on `clients.web`.
- OD? yes for the `redirectOrigins` values only.

---

## MEDIUM

### M1. The plugin HTTP host allowlist (`apiOrigins`) is not enforced for tools, surfaces or hooks
- Where: `features/agent-plugins/executable-tools/host-capabilities.ts:74-83` (`guardedPluginFetch`)
  checks only https, public address, no redirects and size. The same capability backs admin surfaces
  (`admin-surfaces/capabilities.ts`) and connection hooks (`agent-plugin-connections.ts:95`).
  `apiOrigins` reaches only the unwired form-delivery port. A plugin bug that builds a URL from tool
  input would send the bearer to any public https host. Plugin URLs are constants plus
  `encodeURIComponent` segments today, so there is no live exploit (defence in depth; the plugin
  code is trusted bundled code).
- Smallest change: `createAgentPluginToolCapabilities` gets `allowedOrigins({ pluginId })` from
  `host.listConnections({ pluginId })` (the union of `apiOrigins`, plus each connection's token and
  revocation hosts for hooks), and `guardedPluginFetch` refuses any other origin with a fixed
  message. Pairs with H4.
- OD? no.

### M2. CSV export: spreadsheet-formula injection
- Where: `lib/sheets-admin-csv.mjs:50` `csvField` quotes RFC 4180 specials only. Form submissions
  are stored RAW, so a visitor's `=HYPERLINK(...)`/`@SUM(...)` text comes out of
  `values.batchGet` (FORMATTED_VALUE) unchanged and runs as a formula when the CSV opens in
  Excel/LibreOffice.
- Smallest change: in `csvField`, prefix `'` to text that starts with `= + - @ \t \r` (OWASP CSV
  guidance) and note it in references/sheets.md.
- OD? yes, a small fidelity trade-off (negative numbers already arrive as numbers when unformatted;
  only text cells get the prefix).

### M3. `sheets_export_csv` can never succeed, and it spends quota before failing
- Where: `tools/sheets-admin/export-csv.mjs:61`. No composition root binds `artifacts`
  (`agent-plugin-connections.ts:103` passes none), so `artifacts.write` always throws
  `ARTIFACTS_UNAVAILABLE_MESSAGE`. That happens after one metadata read plus up to 10 chunk reads
  (each charged to the 45/min account budget).
- Smallest change: bind a host artifact writer (§D wants the export). Until then, check for the
  artifact capability before any read (one-line guard), or leave the tool out of
  `tovu-agent-tools.json`.
- OD? no (§D includes it); only the "hide until bound" choice is the coordinator's.

### M4. Form delivery: frozen jobs can silently change account, and budgets under-count
- Where: `api-connections/form-delivery-connection.ts:48` calls `getAccessToken({ connectionRef })`
  with no `expectedAccountId`. After a confirmed account switch the same ref holds the new account,
  and queued jobs deliver there. That breaks "frozen jobs never silently change account". Also
  `form-destinations/sheets.mjs:147` wraps one pre-resolved token, so a delivery's 3-15 Sheets
  requests (tab read, header read, up to 10 dedupe chunks, append) charge the host budget once. That
  breaks the "one token read per request" rule the budget design depends on (`budgets.ts` header).
- Smallest change (G14): the binding/job freezes `accountId`, and the port passes
  `{ expectedAccountId }`. The credential carries a `getAccessToken()` the plugin calls per request
  (the same shape tools get) instead of a static `token`.
- OD? no.

### M5. Mapping persistence is missing, so a renamed field label opens a new column
- Where: `form-destinations/mapping.mjs:45` uses `tab.columns` (field → header) when present, else
  the live label. Nothing ever writes `columns` back to the binding (the adapter cannot), so `known`
  is always false. If a field's label is edited, the old header is no longer found and a new column
  is appended; the field's data then splits across two columns. `references/form-delivery.md:9`
  promises the opposite ("even when a field's label is edited later"). Also
  `form-destinations/sheets.mjs:154` treats more than one row with the same submission id as
  delivered, while §F says "Duplicate IDs require review".
- Smallest change: G14 persists the header plan per binding (mapping revision) after the first
  successful `ensureHeaders`. Until then the doc says "a renamed field starts a new column". For
  `existing.length > 1`, return a `mapping-invalid`/review code instead of `delivered`.
- OD? no.

### M6. Two layers of rate limiting; the plugin layer is redundant and its comments are wrong
- Where: `lib/http.mjs:104-112` checks the `limiter` capability under keys `instance` and
  `connection:<ref>`. That limiter is `AGENT_PLUGIN_OUTBOUND_BUDGET` (240/min for EVERY key,
  `agent-plugin-connections.ts:36`), so the "per-connection" check there is 240, not 45. The host
  already charges the declared 45/240 on every `getAccessToken` (`host.ts:154`). `QUOTA_BUDGETS`
  (`request-policy.mjs:16`) only documents numbers declared in the JSON. Note also: the `instance`
  key includes the workspace (`budgets.ts:293`) and there is one connection per workspace, so within
  a site "instance" and "connection" count the same calls and the 240 can never bind first.
- Smallest change: drop `quotaRefusal`/`limiter` from `createGoogleClient` and delete
  `QUOTA_BUDGETS`. Keep the host-declared budgets as the single mechanism (its Retry-After path is
  already mapped to `quota-delay`). The coordinator should confirm whether the "instance" budget is
  meant per site (drop `workspaceId` from its key) or per workspace (then it is redundant today).
- OD? yes, on what "per instance" means.

### M7. `sheets_basic_filter` with `sortSpecs` physically re-orders rows but is declared `write`
- Where: `tovu-agent-tools.json:835` (`"effect": "write"`) and the request-kinds row
  `setBasicFilter` W. A basic-filter sort re-orders the stored rows the way `sortRange` does
  (destructive in the inventory). Both families ask, so this is not a confirmation bypass; only the
  danger styling and the "physical sorting is destructive" disclosure are lost.
- Smallest change: declare the tool `destructive`, or drop `sortSpecs` from its schema (sorting stays
  in `sheets_sort`).
- OD? no.

---

## LOW: trims (overbuilding, duplicates), naming, docs

### L1. Two Sheets helper modules duplicate each other: fold `sheets-admin-common.mjs` into `sheets-client.mjs`
The file itself says "Phase B may fold this into the Sheets client". Duplicates:
- `googleClientFor` (`sheets-client.mjs:63`) = `clientFor` (`sheets-admin-common.mjs:41`) = the
  inline client in `tools/account-info.mjs`.
- `sheetsUrl` (`sheets-client.mjs:44`, no id check) vs `spreadsheetUrl` (`sheets-admin-common.mjs`,
  id-checked), plus a hand-built `${SHEETS_API}/…` in `picker-selection.mjs`.
- `assertOutputWithin` (`sheets-client.mjs:121`) = `boundedOutput` (`sheets-admin-common.mjs:82`);
  `SHEETS_LIMITS.maxOutputBytes` = `MAX_OUTPUT_BYTES` (:20).
- `assertPayloadWithin`/`SHEETS_LIMITS.maxPayloadBytes`/`maxMutationEntries` repeat
  `MAX_BATCH_BYTES`/`MAX_BATCH_REQUESTS` in `sheets-admin-request-kinds.mjs`.
- `columnName`/`columnIndex` (`sheets-client.mjs:140-145`) = `columnLetters` + a private
  `columnIndex` (`sheets-admin-ranges.mjs:12`).
- Two DIFFERENT exported functions named `parseA1Range` (`sheets-client.mjs:133`: tab-qualified
  Google range → parts or undefined; `sheets-admin-ranges.mjs:50`: bare `A1:B2` → bounds or throw).
  One name, two contracts: rename one (`parseBoundsA1`) or merge.
- Tab-title quoting: `a1()` in `form-destinations/sheets.mjs:52` = `quotedTitle()` in
  `sheets-admin-csv.mjs`.
- Card lines: `sheets/` tools use `resourceLines` (50 × 300 bound); `sheets-admin/` tools return
  raw arrays, and `format.mjs` slices to 300 by hand. Use `resourceLines` in both.
- `batch-update.mjs:19` has `MAX_OUTPUT_BYTES - 4096`: one bound helper with a headroom argument.
Change: one `lib/sheets-client.mjs` exporting a single client factory, a single URL builder, a single
output/payload bound and the A1 helpers. `tools/sheets*` import only that. Move every "why" comment
along with the code it explains.

### L2. Three spreadsheet/file-id rules
Schema `^[A-Za-z0-9_-]{1,256}$` on `sheets/` tools; schema and `checkedFileId` `{10,128}` on
`sheets-admin/` tools (`sheets-admin-common.mjs:23`); `DRIVE_FILE_ID` `{10,200}` in
`picker-selection.mjs`. `sheetsUrl` performs no id check at all (still safe: `pathSegment` encodes
and refuses dot segments). Change: one exported `assertSpreadsheetId` (pick `{10,200}`), used by the
single URL builder, and the same pattern in every schema.

### L3. Duplicate Drive "is this a spreadsheet I can open" checks
`tools/sheets-admin/open-existing.mjs:27-34` re-implements `readSpreadsheetFile` from
`picker-selection.mjs` (Drive `files.get` + MIME), but without the Sheets-API open. Change: export
one `verifySpreadsheetAccess({ client, connectionRef, fileId })` from picker-selection (Drive
metadata + Sheets open), and have `verifySelectedSpreadsheet` add only the account check on top.

### L4. Duplicate and unused safe codes
`destination-unavailable` (`request-policy.mjs:43`; nothing throws it, its text "not available in
this build yet" is stale) should be deleted, along with its row in `delivery-result.mjs`.
`product-disabled` should stay only if H2 is implemented, else be removed.
`invalid-request` (Google 400) and `invalid-input` (local) both have next action `fix-request`, and
`file-not-granted`/`access-denied` both have `re-pick-file`. Keeping both pairs is defensible
(`outcome` differs). Merge or keep, but document the distinction in troubleshooting.md, which today
lists neither `invalid-input` nor `unsupported-request`. `products.json` `label`/`toolPrefix`/
`formDestinations`/`optionalScopes` are unused: use them for H2 or remove them.

### L5. Options and parameters no production caller passes
- `ApiConnectionConnectDeps.scopeSetIds` (`connect.ts:23`): composition passes only `{ host }`.
  Remove it, or wire it to the product state when a second product ships.
- `ApiConnectionHostDeps.displayName` (`host.ts:52`): never passed. Hard-code "Tovu".
- `SurfaceConnectionsDeps.log` (`surface-connections.ts:42`): never passed.
- `startLoopback` is threaded through three layers for tests (`connect.ts:25,102`,
  `surface-connections.ts:43`). Inject it once on the host (`host.startLoopback`).
- `connectDesktop` (`connect.ts:151`) builds an AbortController around `startDesktopSignIn`, which
  builds its own (`:109`). Pass `run.signal` straight through as `optional.signal`.
- `form-delivery-connection.ts:45` re-implements `host.ts:137` `declaredFor`. Expose `declaredFor`
  on the host and reuse it.

### L6. Stale docs
- `executable-tools/README.md:82` says plugin-declared budgets are "a TODO until a declaration format
  exists"; `budgets.ts` exists.
- Plugin `README.md:66-74` "Known gaps" predates G6d (the surface port now has connections, state,
  public config and callback fields).
- `README.md:74` names `TOVU_GOOGLE_PICKER_API_KEY`, which the public-config port REFUSES
  (`admin-surfaces/public-config.ts:15` accepts only `_APP_ID|_CLIENT_ID|_BROWSER_KEY|_PUBLIC_KEY`).
  Settle on `TOVU_GOOGLE_PICKER_BROWSER_KEY`.
- connection.md "BYO client … not available in this build yet": the owner decision lists BYO as an
  advanced option. Confirm the deferral (OD? yes).

### L7. Security, low severity
- `sheets_get`/`sheets_get_by_data_filter` `fields` pattern allows `*` and `data`
  (`tovu-agent-tools.json:53,135`). Google ignores `includeGridData` when a mask is set, so
  `fields=*` returns whole-spreadsheet grid data. It is still bounded (1 MiB host cap, then the
  64 KiB error), so there is no leak, but it gets around the "grid data opt-in with explicit ranges"
  rule in `get.mjs`. Change: refuse a mask containing `*` or `data` unless `includeGridData` and
  `ranges` are given.
- `use-admin-surface-frame.hooks.ts:79,148` posts the bootstrap (which will carry the Picker access
  token) with target `'*'`, guarded only by a load counter. A frame that navigates itself commits the
  new document before `onLoad` fires, so a slow-loading foreign page could receive the init in that
  window. Surface code is trusted bundled code and could leak the token directly anyway. Defence in
  depth: hand a `MessageChannel` port in the first `init` and send later answers only on it.
- Declared tool `effect` is trusted. A plugin that declares a mutating tool `read` skips
  confirmation entirely (`register.ts` adapt). Executable contributions require the bundled-digest
  gate, so only reviewed packages can do this. Note it in executable-tools/README.md "Rules"
  (reviewers must check effects).
- `publicConfig` (`public-config.ts`) is not scoped by plugin: any surface can read any
  `TOVU_*_CLIENT_ID`/`_APP_ID`. These values are public, so this is informational. Optionally
  require the plugin's own prefix.
- Every token read reloads contributions (`host.ts:104-107,137-140`; a disk scan plus JSON parse per
  Google request). Not a security issue; cache per activation revision if profiling shows cost.

---

## Owner decisions: status

| Decision | Status |
|---|---|
| Scope `drive.file` only | MET (`products.json`, `GOOGLE_SCOPE` check; no other scope anywhere). |
| Desktop: installed client, PKCE, 127.0.0.1 loopback, system browser, `prompt=consent` | MET (Jini receiver binds 127.0.0.1 with a default timeout; `public` params; link opens via shell policy). |
| Hosted: web client, server secret, `include_granted_scopes`, offline | MET (confidential client requires its secret; params declared). Known-origins list missing (H4). |
| Revoke honesty | MET in code (`auth.mjs` throws unless 200/`invalid_token`; `REVOCATION` maps verbatim). No UI yet (H3). |
| `invalid_grant` → "Reconnect required", jobs kept | MET (`HOST_TOKEN_CODES`, `authorization-required` not retried, ledger keeps the job). |
| Picker grant semantics | Logic MET (`picker-selection.mjs`: id shape, account, MIME, real Sheets open; a pasted URL grants nothing). Unused (H3). |
| Quotas 45/240, Retry-After, jitter, never drop | MET via host budgets plus `backoffMs`/`parseRetryAfter`. Duplicate layer (M6); delivery under-count (M4). |
| Destructive confirmations | MET: write = publish (asks), destructive = delete (asks + danger), account frozen for confirmed calls, activation and permission rechecked; raw batch discloses every kind. Basic-filter sort styling (M7). |
| Form mapping/dedupe | Mostly MET (numeric sheet id, field ids, RAW, IP excluded, ", " join, 50k ceiling, rescan after uncertain append, no replay). Gaps: mapping persistence and duplicate review (M5); account freeze (M4); product gate (H2). |
| Products enabled separately | NOT MET (H2). |
| Uncertain append/create/copy never replayed | MET (`classifyFailure` → `uncertain-outcome`, not retryable). |
| CSV export via bounded reads, error not partial | MET (`planChunks` bounds before reading, 4 MiB cap). Injection (M2); unbound artifacts (M3). |

## Security checklist

- Token/secret reach: tool output = Google body subsets (no headers); `GoogleWorkspaceError.toJSON`
  drops `cause`; Google message text is never shown; callback logs `name + code` only; surface
  handler errors log the class only; bootstrap is `no-store`; refresh tokens never leave the vault
  store; client secrets stay in env by name (`CLIENT_ENV_PATTERN`). OK.
- Callback: cookie-less, state looked up by peek only, consumed by Jini, workspace-checked, per-IP
  limited, fixed-copy page, `no-store`. Admin-surface writes: same-origin + Sec-Fetch-Site + session
  credential only. OK.
- Loopback: 127.0.0.1, exclusive, timeout, closed on abort/error (`connect.ts:126-131`). OK.
  `surface-connections.begin` passes no signal and relies on the receiver's default timeout.
  Acceptable.
- iframe: `sandbox="allow-scripts"` only, CSP `default-src 'none'`, `frame-ancestors 'self'`,
  no-referrer; host page opens only server-issued https sign-in links. OK, with L7.
- Redirects: plugin fetch is `redirect: 'error'`; bearer is never forwarded. OK.
- Host allowlist: NOT enforced (M1, H4).
- CSV/formula injection: RAW writes are OK; CSV export is open to it (M2).
- Confirmation bypass: none found. MCP-UI only answers parked plugin calls
  (`mcp-ui-tool-calls.ts`).
- Privacy: the account email goes to chat via `account_info` (by design); find excerpts are capped
  at 120 chars.
