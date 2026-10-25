Software Architect(Direct): **Personas: Software Architect + Security** — loaded for plugin ownership, OAuth boundaries, and safe spreadsheet operations.

Build **one self-contained `google-workspace` plugin**, using direct REST and the existing Jini OAuth/vault owners. Do not add a core spreadsheet abstraction or a separate Google login plugin.

This plan follows all of [PLAN-v2-owner.md, including its Update](/Users/la/Programming/Tovu/ADS-memory/reports/2026-10-20-sheets-multidest/PLAN-v2-owner.md), and reuses the prior plans’ findings. Graph MCP tools were unavailable; extension points were checked directly in source. No files changed or tests run.

Two requirements need qualification:

- Google’s current documentation requires **desktop Picker in the system browser**, rather than an embedded webview.
- Installed-app OAuth does **not support incremental authorization**. Desktop can add a product through explicit re-consent for the required scope set; hosted OAuth supports incremental authorization. These differences must be visible in the approved specification. [Desktop Picker](https://developers.google.com/workspace/drive/picker/guides/overview), [desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)

**A. Plugin layout and product modules**

Proposed layout; contribution filenames below are new generic extension contracts unless identified as existing.

```text
content/agent-plugins/google-workspace/
  plugin.json
  tovu-connections.json
  tovu-agent-tools.json
  tovu-admin-surfaces.json
  tovu-form-destinations.json       # existing contribution category
  products.json

  skills/google-workspace/
    SKILL.md
    references/
      connection.md
      sheets.md
      form-delivery.md
      troubleshooting.md

  lib/
    auth.mjs                      # calls host OAuth/connection capability
    http.mjs                      # shared Google request/error handling
    drive-files.mjs                # copy, file metadata, account identity
    product-state.mjs
    request-policy.mjs             # Google quotas and retry classification

  products/
    sheets/
      tools.mjs
      schemas.mjs
      spreadsheets.mjs
      values.mjs
      structure.mjs
      formatting.mjs
      metadata.mjs
      csv.mjs
    # Added when implemented:
    # docs/
    # slides/
    # drive/
    # gmail/
    # calendar/

  form-destinations/
    sheets.mjs
    mapping.mjs
    dedupe.mjs

  ui/
    connection-panel.html
    connection-panel.mjs
    picker.html
    picker.mjs
    destination-panel.mjs

  __tests__/
    fake-google-http.mjs
    oauth.contract.test.mjs
    sheets.contract.test.mjs
    form-delivery.contract.test.mjs
```

The manifest declares the display name, capabilities, connection descriptor, tools and admin surfaces. Bundle it through the existing packaging/digest process, initially disabled. Do not add a Google entry to a core provider switch or a hardcoded enabled-plugin list.

`products.json` records each product’s identifier, tools, required scopes and optional feature scopes. Only Sheets ships enabled in v1; other modules are absent until implemented. Enabling a product and granting its scopes are separate operations.

All products share one active account connection per workspace. Product flags and tab/header mappings use plugin-scoped persistence through injected host capabilities. Public functions and factories use `(required, optional = {})`.

Disabling Sheets blocks both its tools and automatic form delivery. Disabling the entire plugin stops every contribution. Neither action silently revokes account authorization.

The inspected precedents support this structure:

- **Cloudflare:** plugin-local HTTP code plus an executable form-destination contribution.
- **Resend:** a self-contained adapter receiving credentials and HTTP capabilities from the host.
- **Composio:** browser sign-in through the shared connect flow; its tools arrive through MCP.

None establishes an existing executable REST-tool contribution for agent plugins. That missing bridge must be named and built, rather than treating guidance tools as executable tools.

**B. Minimal generic host extensions**

Generic mechanisms belong in Jini; Tovu supplies CMS composition, routes and admin bindings. Every proposed host contract below uses opaque plugin, connection and module identifiers—no Google names, endpoints, scopes or response parsing.

| Extension | Existing seam it extends | Minimal change and neutrality |
|---|---|---|
| **Plugin-declared OAuth API connections** | [connect-tool.ts:26](/Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/connect-tool.ts:26), currently restricted to declared MCP servers | Add a REST/API connection branch using a trusted connection descriptor. Put the reusable service in `@jini-ai/integrations/api-connections`; retain `agent_plugin_connect` as the existing user entry point. Any OAuth API plugin can use it. No fabricated MCP server record. |
| **Vault-backed OAuth connection adapter** | [OAuthTokenStore:67](/Users/la/Programming/Jini/packages/oauth/src/ports.ts:67), [vault service:106](/Users/la/Programming/Jini/packages/platform/src/secrets/credential-sets/vault.service.ts:106) | Adapt existing vault payloads/CAS to the OAuth token-store contract. Use an OAuth discriminator and injected metadata validation; no provider table or encryption implementation. Add generic connection status, account binding and credential-generation checks. |
| **Executable agent-plugin tool contribution** | [contribution loader:105](/Users/la/Programming/Jini/packages/agent-plugins/src/lifecycle/contribution-loader.ts:105), [tool registration:625](/Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/tool-registrations.ts:625) | Load trusted `.mjs` tool contributions and project them into the existing ToolRegistry, metadata, authorization and approval owners. The existing agent-plugin tools return guidance; extend admission without creating another executor. |
| **Plugin-owned admin surfaces** | [AgentPluginDetailsModal.tsx:30](/Users/la/Programming/Tovu/apps/admin/src/features/plugins/AgentPluginDetailsModal.tsx:30) | Add a generic “Manage connection”/contributed-surface entry. Jini owns reusable surface admission and lifecycle; Tovu mounts it. Contained HTML/JS, action contracts and CSP requirements come from the trusted plugin. All provider UI stays inside the plugin. |
| **Fresh credentials for form delivery** | [form-delivery.ts:63](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/form-delivery.ts:63) | Replace the static-token assumption with an injected resolver accepting the binding’s stable connection reference. Preserve static credentials as one implementation; OAuth supplies a refreshed credential. Jobs store references, never tokens. |
| **Delivery snapshot metadata** | [types.ts:15](/Users/la/Programming/Tovu/apps/website/src/features/form-destinations/types.ts:15), [snapshot construction:51](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/form-delivery.ts:51) | Add optional stable form/field identity, labels and field type to the delivery snapshot. Current receiver manifests discard this information. Keep receiver publication contracts unchanged; all delivery adapters can consume the richer snapshot. |

The reusable executable-tool projection must consult the existing [plugin tool projection](/Users/la/Programming/Jini/packages/plugins/src/host/tool-contributions.ts:13) and [ToolContributor contract](/Users/la/Programming/Tovu/apps/website/src/assistant/tool-contribution-registry.ts:53). Extend or extract their shared registration behavior where necessary; do not duplicate registration, approval or revocation lifecycles.

Reuse unchanged:

- Jini [authorization code + PKCE](/Users/la/Programming/Jini/packages/oauth/src/authorization-code.ts:75), including configurable scopes and extra authorization parameters.
- Jini [refresh coordinator](/Users/la/Programming/Jini/packages/oauth/src/refresh.ts:50), with a durable refresh lease supplied by the connection adapter.
- Vault encryption, ownership checks and CAS.
- Trusted contribution loading: activation, bundled digest and contained module paths. [Trust owner](/Users/la/Programming/Jini/packages/agent-plugins/src/lifecycle/trusted-plugin-files.ts:18)
- Existing sign-in cards and secure credential capture.
- Existing form-destination registry, delivery plans, outbox and status ledger.
- Guarded outbound HTTP, bounded responses and tracing.

There is **no new generic spreadsheet domain**, import framework, queue engine, OAuth library or cross-plugin dependency.

One detail must not be missed: guarded HTTP’s `rateLimit` descriptor is explicitly **not an implemented pacing mechanism**. Use the installed limiter implementation, with plugin-declared budgets. [HTTP policy:28](/Users/la/Programming/Jini/packages/platform/src/http/guarded/ports.ts:28), [limiter:73](/Users/la/Programming/Jini/packages/http-kit/src/rate-limit.ts:73)

**C. Sign-in, storage and account lifecycle**

Use a Tovu-owned Cloud project with separate Desktop and Web OAuth client identities. They represent the same integration to users; tokens remain bound to the client that issued them.

1. An authorized admin selects **Connect Google Workspace**, either in admin or through chat.
2. `agent_plugin_connect` resolves the installed, trusted plugin descriptor and selected product.
3. The connection service creates an expiring authorization attempt bound to workspace, actor, plugin, connection, requested scopes, callback and credential generation.
4. Jini generates state and PKCE. The plugin supplies Google endpoints and authorization parameters.
5. Consent runs in the system browser.
6. The callback validates the attempt, exchanges the code server-side, resolves the account identity and checks actual granted scopes.
7. Tokens are sealed before the connection becomes usable. The admin surface receives status and account display information.

**Desktop:** use the installed-app client, S256 PKCE and an ephemeral loopback listener bound to `127.0.0.1`. Close the listener on success, cancellation or expiry. Open the browser through the existing desktop shell capability. Never treat a distributed desktop client secret as confidential. [Google desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)

**Hosted:** use the Web client, a registered HTTPS callback and server-held client secret. Request offline access and incremental grants using `include_granted_scopes=true`. Preserve a valid existing refresh token when a successful same-account exchange omits a replacement. [Google web OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

The hosted callback should be a generic API-connection route, not the MCP callback. Reuse Jini state handling and the existing safe callback-page renderer. Do not copy the MCP connection service’s lifecycle. The current callback already documents why cross-site redirects cannot depend on an admin session cookie. [Callback behavior](/Users/la/Programming/Tovu/apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts:12)

**Storage and refresh**

- Seal access token, refresh token and any client secret in the existing vault.
- Store only safe status/configuration metadata outside the sealed payload.
- Bind reads to expected workspace/plugin/provider/client identity.
- Resolve access tokens immediately before HTTP requests.
- Serialize refresh across processes; persist rotation before releasing the new token.
- Fence refresh completion against disconnect, switch-account and newer authorization attempts.
- Treat `invalid_grant` as “Reconnect required,” retaining undelivered jobs.

**Product consent**

Default API scope is `https://www.googleapis.com/auth/drive.file`. Do not request broad Drive or all-spreadsheet access.

Docs and Slides can also operate on selected/app-created files with this scope; enabling them need not trigger consent when existing grants suffice. Later products request only their missing permissions.

For desktop, use explicit re-consent for the intended scope set, verify the resulting grant, then replace credentials atomically. Do not promise installed-app incremental authorization.

**Account actions**

- **Reconnect:** same account, stable connection reference; existing bindings remain usable after validation.
- **Switch account:** stage the new authorization, verify identity, then ask the admin which bindings to reassign. Frozen delivery jobs must never silently change accounts.
- **Disable product:** stop that product’s calls; authorization remains granted.
- **Revoke:** disclose that the shared integration’s products will disconnect, stop new use, invoke Google revocation and clear local tokens after success.
- If remote revocation fails, show **“Disconnected locally; Google revocation pending”**, retain the disabled sealed credential for retry, and provide the Google account-access page. Never claim remote revocation succeeded.

The Google revocation request belongs in the plugin; generic connection state and token access remain with Jini. Existing MCP `disconnect()` only clears local credentials and does not establish provider revocation.

**Chat and failures**

Chat says: “Connect Google Workspace, then choose or create a spreadsheet.” It opens the existing sign-in card and later the plugin’s Picker surface. It receives connection status and selected resource references, never authorization codes, tokens or client secrets.

Show actionable failures: consent cancelled, missing permission, wrong account, file not granted, administrator policy, expired authorization, quota delay, network outage and uncertain write. Keep submissions stored locally throughout. Retry the original operation once after reconnection; do not loop consent requests.

**D. Sheets v1 tools**

Use existing plugin tool namespacing: `p_google_workspace__<local-name>`. Below, names omit that prefix.

All spreadsheet operations accept `connectionRef`; existing-file operations also accept `spreadsheetId`. Every implementation validates inputs at runtime. Credentials and confirmation booleans are never tool arguments.

| Local tool name | Main input | Main output |
|---|---|---|
| `sheets_get` | ID, optional bounded ranges and field mask | Title, URL, tabs and requested metadata; grid data opt-in |
| `sheets_get_by_data_filter` | Data filters, field mask | Bounded matching spreadsheet data |
| `sheets_create` | Title, optional initial tab properties | Spreadsheet ID, URL, tab IDs |
| `sheets_copy` | Source ID, title, optional granted parent folder | New spreadsheet ID and URL |
| `sheets_copy_tab` | Source sheet ID, destination spreadsheet ID | New tab properties |
| `sheets_values_get` | Explicit A1 range, render options | Range, values, continuation |
| `sheets_values_batch_get` | Bounded range list, render options | Value ranges |
| `sheets_values_append` | Tab/table range, rows, input option | Updated range, row/cell counts |
| `sheets_values_update` | Explicit range, values, input option | Updated range and counts |
| `sheets_values_batch_update` | Range/value entries | Per-range and total counts |
| `sheets_values_clear` | Explicit range | Cleared range |
| `sheets_values_batch_clear` | Explicit range list | Cleared ranges |
| `sheets_values_by_data_filter` | Action: get/update/clear; filters and optional values | Matching ranges or mutation counts |
| `sheets_find` | Bounded ranges, text, matching options | Matching cell references and bounded excerpts |
| `sheets_find_replace` | Scope, find/replace, matching options | Occurrences and changed-cell counts |
| `sheets_tab_modify` | Action: add/rename/delete/duplicate/move; tab properties | Resulting tab ID/properties/index |
| `sheets_sort` | Grid range, sort specifications | Applied range/specification |
| `sheets_basic_filter` | Action: get/set/clear; range and criteria | Filter definition/result |
| `sheets_filter_views` | Action: list/add/update/duplicate/delete | View definitions or result |
| `sheets_format` | Range, explicit field mask and formatting | Applied range/fields |
| `sheets_named_ranges` | Action: list/add/update/delete; name/range/ID | Named ranges or result |
| `sheets_protected_ranges_get` | Optional tab/range restriction | Protection metadata and caller editability |
| `sheets_developer_metadata` | Action: get/search; lookup/filter | Bounded metadata |
| `sheets_batch_update` | Bounded array of supported GA request objects | Ordered replies and compact summary |
| `sheets_export_csv` | Sheet ID, optional range and rendering choice | Download artifact reference, dimensions, byte count |
| `sheets_open_existing` | Optional selection purpose | Waiting/cancelled/selected resource reference |

The resource, values, data-filter, metadata and tab-copy operations map to the documented [Sheets REST surface](https://developers.google.com/workspace/sheets/api/reference/rest) and [values resource](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values). Whole-spreadsheet copy uses [Drive `files.copy`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy) inside the plugin’s shared file helper.

**Broad coverage without dozens of wrappers:** `sheets_batch_update` covers the remaining GA request families: dimensions, cell operations, merges, borders, validation, conditional formatting, charts, banding, groups, pivots, slicers, tables, developer metadata mutations, protection mutations and data-source operations. Maintain a reviewed request-kind inventory against the official reference. Unknown or preview request kinds fail closed. Connected-data operations can additionally require source permissions, scopes or account features; expose those prerequisites rather than silently expanding access. [Batch request reference](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request)

Basic formatting explicitly covers number formats, font styles, colors, alignment, wrapping, borders, frozen rows and column sizing. Named wrappers call the same request implementation as batch updates.

**Confirmation**

Apply the existing [approval policy](/Users/la/Programming/Tovu/apps/website/src/contracts/headless/assistant-tool-approval-policy.ts:12). External writes require its applicable confirmation; destructive actions additionally disclose their affected resources:

- Clear, overwrite/update, find/replace and delete-tab.
- Physical sorting, row/column deletion, merges that discard values, and protection changes.
- Every raw batch update, with all affected request kinds disclosed.

Freeze the exact request, account and target before confirmation; recheck authorization and activation immediately before execution. High-blast operations call the existing gated-mutation owner required by [GOV-ADR-001](/Users/la/Programming/Tovu/ADS-memory/governance/adrs/GOV-ADR-001-gated-mutation-gateway-and-watermark-chokepoint.md). Do not introduce a plugin confirmation engine or claim remote edits are locally undoable.

**Bounds and results**

Proposed initial limits, configurable downward:

- Ordinary reads: 500 rows, 5,000 cells and 64 KiB of returned tool data.
- Batch reads: at most 20 ranges within the same aggregate output bound.
- Mutation batches: at most 100 requests and 1 MiB serialized payload.
- Explicit range-based continuation; Sheets values reads do not supply normal page tokens.
- CSV: bounded artifact generation; report an error rather than produce an undisclosed partial export.

Use partial field masks and exclude grid data by default. Return errors as safe codes with `retryable`, optional `retryAfterMs`, `outcome: "not-applied" | "unknown"` and a next action. An uncertain append/create/copy is never automatically replayed as a fresh mutation.

CSV export of an arbitrary selected tab uses bounded values reads plus CSV encoding. Google’s native CSV export supports only the first sheet; do not use undocumented `gid` export URLs. [Export formats](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)

**Quotas**

Current Sheets defaults are 300 reads and 300 writes/minute/project, and 60 of each/minute/user/project. Share a conservative local budget across tools and background delivery; begin around 45/user and 240/project-instance per minute. Batch requests where useful, honor retry delays, and use jittered backoff for quota/transient failures. [Usage limits](https://developers.google.com/workspace/sheets/api/limits)

These local limits cannot enforce the aggregate quota across every independent Tovu installation using the same OAuth project. Monitor the shared project and request sufficient quota before broad rollout. No quota broker is included.

**E. Picker and per-file grants**

A pasted spreadsheet URL does not establish a `drive.file` grant. The plugin must create the file or complete an explicit Picker selection. [Drive scope behavior](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

**Hosted**

1. Admin opens the plugin-owned Picker surface.
2. An authenticated, non-cacheable bootstrap provides public configuration and a short-lived access token to that surface only.
3. Picker filters to spreadsheet MIME type and uses the connected account.
4. On selection, submit file ID and picker-session identity.
5. Server verifies session ownership, account, MIME type and actual API access before saving the selection.
6. Return resource metadata, never the token, to chat.

Browser memory receives only the access token needed by Picker; refresh tokens remain server-side. Before future broader scopes ship, enforce a `drive.file`-only Picker authorization/token path rather than exposing a combined Gmail/Calendar token.

The API key and numeric Cloud project/app ID are public configuration. Restrict the browser key to the required APIs and documented website/referrer origins. OAuth client, Picker app ID and key configuration must use the intended Cloud project. Client secrets stay in deployment secrets/vault references. [Web Picker configuration](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)

**Desktop**

The admin controls remain in the desktop webview. Clicking **Choose spreadsheet** opens native Picker in the system browser, using code+PKCE, loopback callback, `prompt=consent`, `trigger_onepick=true` and spreadsheet MIME filtering.

The callback receives `picked_file_ids`; the plugin validates those only after successful state/code processing and API verification. The generic callback supports bounded plugin-declared callback fields without hardcoding this Google parameter.

Native Picker currently permits only `drive.file`, without additional scopes. Keep this operation separate from future consent upgrades. It does not use the hosted JavaScript Picker’s developer-key/app-ID initialization. [Native Picker protocol](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker)

Picker cancellation leaves existing destination settings unchanged.

**F. Form-destination adapter**

Contribute a push-only destination through `tovu-form-destinations.json`, with no `receive` field. Its `deliver()` uses the same Sheets client as chat tools.

Consume P1’s fan-out:

```text
accepted submission → frozen delivery plan
                    → one durable child job per binding
                    → google-workspace Sheets adapter
```

P1/P2 source is visibly in progress. The current [delivery ABI](/Users/la/Programming/Tovu/apps/website/src/features/form-destinations/types.ts:79) already includes binding, idempotency key and result support; the [SQL plan owner](/Users/la/Programming/Tovu/apps/website/src/platform/db/repos/form-delivery-repo.ts:13) persists plans and child jobs. Treat the published Jini contract and completed integration tests as a dependency, not as already verified delivery.

A binding stores:

```text
bindingId, adapterId, connectionRef, enabled, optional formIds,
config: spreadsheetId, per-form tab IDs, column mapping, mapping revision
```

**Mapping**

- Default to one tab per form; persist numeric sheet IDs so tab renames remain safe.
- Identify fields by stable field ID/effective HTML name; display labels as headers.
- Include `_tovu_submission_id` and submitted time. Exclude IP.
- Preserve scalar values and newlines; join checkbox-group answers with `", "`.
- Write visitor values with `RAW`; formulas are never inferred.
- Append new fields as columns. Never silently shift existing column meanings.
- Freeze payload and mapping revision for each job.
- Missing, duplicated or incompatible headers produce an actionable mapping error.

**Dedupe and retries**

Follow the trimmed owner decision:

1. P1 serializes jobs per binding.
2. Before every append attempt, verify the ID header and search the submission-ID column.
3. If found once, complete as already delivered.
4. If absent after a complete bounded scan, append the frozen row.
5. After a timeout/uncertain append, repeat the scan before considering another append.

Propose a 50,000-ID scan ceiling, read in bounded chunks. If absence cannot be established within the ceiling, pause delivery with “destination exceeds dedupe limit”; do not append on an incomplete search. Duplicate IDs require review.

This remains **at-least-once delivery with best-effort dedupe**. A late successful request or another writer can race the search. Do not add row reservations or claim exactly-once semantics.

Use existing per-binding pending/retrying/completed/failed status. Map plugin errors into its safe error contract: reconnect, re-pick file, repair mapping, retry later, or review uncertain outcome. Retrying preserves job identity.

Email remains unchanged. Receiver acknowledgement remains independent of Sheets success. Local deletion leaves delivered spreadsheet copies. Desktop delivery resumes when Tovu reopens.

P2 remains startup/login-triggered, debounced, with manual pull available—**no interval polling**.

**G. Docs / Slides / Drive v2 outline**

| Module | Tool groups | Default authorization |
|---|---|---|
| Docs | Create/get/copy; structured document reads; text insertion/replacement; styles, tables and batch updates; export | `drive.file` for selected/app-created documents |
| Slides | Create/get/copy; slides/pages/elements; text, images, shapes and layout; batch updates; thumbnails/export | `drive.file` for selected/app-created presentations |
| Drive | Bounded listing of app-accessible files; metadata; create/upload/download/export; copy/move/trash; explicit sharing operations | `drive.file`, constrained to accessible files |

Docs and Slides officially support this default. Broader product scopes require a separately enabled feature, justification and consent; they are unnecessary merely to enable these modules. [Docs scopes](https://developers.google.com/workspace/docs/api/auth), [Slides scopes](https://developers.google.com/workspace/slides/api/scopes)

Gmail and Calendar remain later modules, with their own reviewed permission sets. Nothing in the module contract assumes every product shares `drive.file`, and disabling a module prevents its operations even if its scopes remain granted.

**H. Phases, estimates and proof**

Estimates are changed production lines, excluding tests and generated schema data. Allow roughly ±50% until the first vertical slice resolves the new admission/UI seams.

| Phase | Files / work | Production lines | Delivery owner |
|---|---|---:|---|
| Contract/release preparation | Approved spec/ADR; generic contribution contracts; verify published P1/Jini APIs | 150–250 | Codex |
| P1/P2 prerequisite | Consume existing fan-out, serialization, status and startup/login pull work | Separate existing scope | Codex |
| P3 connection backend | Jini `integrations/api-connections/*`; agent-plugin connection descriptor; Tovu connect/callback/composition adapters | 700–1,100 | Codex |
| Generic executable/UI admission | Jini agent-plugin tool/surface contributions; existing registry/approval integration; generic admin mount | 450–750 | Codex backend; Opus+Chrome UI |
| P4 Sheets plugin | Manifest, skills, shared auth/HTTP, schemas, tools, request inventory, CSV | 900–1,400 | Codex |
| P4 form adapter | Destination declaration, mapping, bounded dedupe and error translation | 250–400 | Codex |
| P5 admin experience | Plugin-owned product/account/Picker screens; generic bindings/status/autoPull UI | 500–850 | Opus+Chrome |

**Total incremental production estimate: approximately 3,000–4,800 lines**, plus approximately 1,800–3,000 test lines. This exceeds the trimmed estimate because the owner restored Picker and broad tools, and executable agent-plugin tooling needs an admission bridge.

Build the shared contracts first, then one vertical slice:

`connect → create spreadsheet → enable binding → deliver once → simulate lost response → retry without ordinary duplication`.

Expand the API inventory after that slice passes.

Required tests:

- **OAuth integration:** state/workspace/plugin/client binding, PKCE, expiry/replay, consent denial, partial scopes, missing refresh token, refresh races and rotation, disconnect during refresh, same-account reconnect, account-switch fencing.
- **Fake Google HTTP contracts:** run the real plugin client against a local fake authorization/token/Sheets/Drive server through test-injected transport. Assert methods, paths, query encoding, request bodies, RAW values, headers, error mapping and response limits.
- **API inventory:** every exposed REST method/request family has validation and approval coverage; unknown/preview requests are refused.
- **Form integration:** multiple bindings, independent failures, frozen configuration, duplicate events, concurrent claims, timeout after successful append, missing headers, checkbox groups, added fields and scan-limit failure.
- **Contribution admission:** inactive/tampered/ambiguous packages, path escape, duplicate tool IDs, disable during confirmation, and stale digest/generation.
- **Picker browser journeys:** hosted selection/cancel, wrong account, rejected file type, revoked file grant, blocked popup/script; packaged desktop external-browser launch and loopback completion.
- **Security:** tokens absent from tool output/transcripts/logs; bootstrap non-cacheable; CSRF and origin checks; no bearer forwarding on redirects.

Fake HTTP tests cannot prove real Google consent, verification or native Picker behavior. Require a real-account smoke test on desktop and hosted before release.

Cut from v1:

- Service accounts, shared OAuth broker and unrestricted self-hosted callback onboarding.
- Whole-Drive browsing, backfill, scheduled imports, bidirectional sync and external-row purge.
- Durable row reservation/exactly-once delivery.
- Dedicated UI/wrappers for every advanced batch request; retain reviewed GA batch capability.

Do **not** silently cut Picker, required Sheets capabilities, confirmation, bounded reads or fan-out integration.

**I. Risks and owner questions**

The largest risks are the desktop platform constraints, globally shared project quota, hosted callback/origin provisioning, and the accepted dedupe race. Further risks are header edits, partial consent and account switching; each has an explicit pause/recovery path above.

`drive.file` is non-sensitive, but production onboarding still needs basic app verification and correct branding, domains and privacy information. It is not “no verification.” [Google verification classification](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

Four owner decisions remain:

1. **Desktop:** approve browser-based Picker and explicit scope re-consent as the supported interpretation of the webview/incremental-consent requirements?
2. **Hosted:** which initial callback domains and JavaScript origins will Tovu register? Recommend known supported origins first; advanced BYO credentials for arbitrary self-hosting, with a broker deferred.
3. **Branding/verification:** confirm the consent-screen name—recommend **Tovu**—and who owns the Cloud project, verified domain, privacy page, support contact and submission.
4. **Quota rollout:** what initial installation/concurrency budget should the shared Cloud project support, and who owns quota monitoring/increase requests?

This is a planning handoff, not an approved implementation ADR. Next assignee: Coordinator to resolve these platform/deployment decisions and ratify the contracts, then Codex backend work and Opus+Chrome UI work in the owner’s P1–P5 order.
