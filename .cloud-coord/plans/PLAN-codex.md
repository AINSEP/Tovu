Software Architect(Review Mode): **Persona: Software Architect** — loaded for ownership boundaries, reliability, and a minimal rollout. Read-only investigation; no files changed or tests run.

**Recommendation:** retain one browser-facing receiver, fan out through independent durable delivery jobs, pull automatically while Tovu runs, and ship Google Sheets as a general spreadsheet adapter plugin.

**A. Existing owners to reuse**

The category design is already implemented in the inspected tree. The original plan’s single-destination/manual-pull limits are superseded by these owner decisions.

| Existing implementation | Reuse; duplication avoided |
|---|---|
| [Destination contract](/Users/la/Programming/Tovu/apps/website/src/features/form-destinations/types.ts:67) and [registry](/Users/la/Programming/Tovu/apps/website/src/features/form-destinations/registry.ts:34) | Extend the existing `deliver` capability. No new forms plugin loader or vendor switch. |
| [Receiver setting](/Users/la/Programming/Tovu/apps/website/src/features/settings/form-destination.ts:15) | Preserve `core.forms/receiver` and `auto`; add delivery configuration alongside it. |
| [Pull orchestration](/Users/la/Programming/Tovu/apps/website/src/features/form-destinations/pull.ts:26) and [composition](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/form-submissions.ts:36) | Schedule the same pull operation used by the tool and admin route. |
| [Atomic import](/Users/la/Programming/Tovu/apps/website/src/features/forms/import-remote-submissions.ts:75) and [receipt migration](/Users/la/Programming/Tovu/apps/website/src/platform/db/migrations/0018_form_submission_remote_receipts.ts:9) | Preserve receipt + submission + event transaction, followed by remote acknowledgment. No second ingestion path. |
| [Jini outbox worker contracts](/Users/la/Programming/Jini/packages/infra/src/events/outbox/ports.ts:17), [drainer](/Users/la/Programming/Jini/packages/infra/src/events/outbox/drainer.ts:27), [Tovu SQL adapter](/Users/la/Programming/Tovu/apps/website/src/platform/db/repos/outbox-repo.ts:75) | Reuse persisted jobs, claims, retries, terminal failure, and restart recovery. No destination-specific queue engine. |
| [Email subscriber](/Users/la/Programming/Jini/packages/cms/src/forms/notify-subscriber.ts:46) and [webhook subscriber](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/modules/integrations.ts:35) | Reuse notification settings, mailer, and webhook delivery. Avoid a second email configuration or webhook plugin. |
| [Jini OAuth grant](/Users/la/Programming/Jini/packages/oauth/src/authorization-code.ts:75), [refresh coordinator](/Users/la/Programming/Jini/packages/oauth/src/refresh.ts:50), [vault](/Users/la/Programming/Jini/packages/platform/src/secrets/credential-sets/vault.service.ts:83) | Reuse PKCE, state, refresh serialization, sealing, and credential ownership. No Google-specific token lifecycle. |
| [Secure credential capture](/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/credential-save-tool.ts:26) and [plugin connect flow](/Users/la/Programming/Tovu/apps/website/src/features/agent-plugins/connect-tool.ts:26) | Extend the existing human-secret/sign-in surfaces. Secrets never become chat arguments. |
| [Serving lifecycle](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/serving-app.ts:43) | Start automatic pull in the existing desktop/hosted serving process; stop it during shutdown. |

Two limitations matter:

- `deliver` currently lacks binding configuration, an idempotency key, and a useful result/error contract. Sheets **does require an additive contract change**.
- Email currently catches failures and logs them. It does not establish the requested durable per-recipient retry semantics.

Graph MCP tools were unavailable. Source claims above were checked directly; Jini’s older local graph was used only as supporting discovery.

**B. Multi-destination design**

Keep **receiver** and **delivery destinations** distinct:

- Receiver: accepts browser POSTs and durably stores submissions. Cloudflare Worker/D1 remains the static-site receiver; live sites use Tovu.
- Delivery destination: receives an accepted local submission asynchronously. Sheets and email belong here.
- D1 acknowledgment means “safely imported into Tovu,” independent of subsequent Sheets/email delivery.

Thus a static submission follows:

`Browser → Worker/D1 → automatic pull → Tovu submission + event → Sheets and email jobs`

Use a **site-level delivery binding list**, owner-editable in the Forms admin. Each entry contains:

`bindingId, adapterId, connectionRef, enabled, optional formIds, adapter configuration`

This supports multiple spreadsheets, different tabs for different forms, and several destinations per form. Credentials remain references. A form filter avoids adding a separate per-form override/inheritance model in v1.

Preserve existing `notify` configuration as email’s owner. Display it with the delivery settings; do not introduce another recipients list.

Delivery semantics:

1. On first handling `form.submission.received`, transactionally persist a delivery plan and enqueue one child outbox job per matching binding/email recipient.
2. Enforce a unique plan per workspace/submission. Persist the selected bindings, configuration revision, immutable delivery payload, and child job IDs together.
3. Replaying the source event reuses that plan—even if settings changed meanwhile.
4. Child jobs perform external I/O independently. A failed Sheets job cannot prevent email or another sheet from proceeding.
5. Expose pending, retrying, completed, and failed status per destination, with attempts, next retry, and a sanitized error.
6. Retry the existing job with its original identity; never recreate it.

The new fan-out subscriber performs only durable planning. Existing webhook fan-out keeps its own established delivery lifecycle.

For email, extend the Jini notification owner to enqueue durable recipient jobs using its current message construction and idempotency key. Disable its direct-send path when this dispatcher is installed. Distinguish mailer acceptance/queueing from confirmed delivery where the mailer exposes that distinction.

Reuse the outbox worker’s state machine. Its current six-attempt policy is short for external outages; add an optional per-event retry-policy resolver in **Jini**, preserving existing defaults. Delivery jobs can reuse Jini’s existing webhook backoff policy and honor provider retry delays.

**C. Automatic pull**

Choose **pull at serving startup, then every five minutes**. No Cloudflare cron, webhook endpoint, or browser polling is necessary.

- Start only in `createServingApp`, after subscriptions are installed. Never start from exporters or the enqueue-only agent daemon.
- Use the current pull/import/ack operation. Preserve receiver scope/origin identities and receipt keys.
- Persist per-receiver `nextDueAt`, last attempt/success, consecutive failures, sanitized error, and a claim lease.
- Manual pull and automatic pull share that lease. Concurrent tabs/processes cannot multiply receiver traffic.
- Keep bounded pages and a wall-clock budget. Continue a backlog promptly in another bounded pass; keep failed or unmapped rows unacknowledged.
- Back off transient failures from five minutes toward one hour, with jitter. Authentication/configuration failures surface a corrective action and retry slowly; reconnect/republish can reset the delay.

Use Jini’s existing scheduler port. Extract the small schedule/run/stop lifecycle from the outbox drainer into a shared Jini helper and have both callers use it, rather than copying that lifecycle into Tovu.

**Desktop:** automatic while its site process runs; after sleep/reopen, perform one due pass. While closed, D1 continues accepting submissions, but Sheets/email delivery waits.

**Fly:** the supplied [deployment configuration](/Users/la/Programming/Tovu/content/agent-plugins/fly/deploy-configs/fly.mjs:87) already disables autostop and keeps one machine running. Instances configured to sleep cannot promise five-minute delivery.

An idle receiver costs approximately **288 pending requests/day** at this interval. Cloudflare Free currently allows 100,000 Worker requests/day and five cron triggers/account; this design consumes no cron slots. D1 usage remains quota-bound. [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)

Show last successful sync, next attempt, backlog indication, and errors in Submissions. Keep list GETs read-only; retain the existing manual pull action.

**D. Generic Google Sheets plugin**

Create `content/agent-plugins/google-sheets/` containing its manifest, skill, OAuth descriptor, REST implementation, spreadsheet contribution, and forms-destination contribution.

Both contributions call the **same plugin-local Sheets client**. It imports no Cloudflare, Composio, or other plugin code.

Generic spreadsheet contracts, tool registration, credential orchestration, and reusable persistence belong in Jini. Google endpoints, request formats, scopes, and response interpretation stay in the plugin.

**Remote MCP versus REST**

| Option | Decision |
|---|---|
| Google’s official remote Sheets MCP | Evaluated. It exists at `https://sheetsmcp.googleapis.com/mcp/v1`, but currently requires Developer Preview membership and Cloud-project/API/OAuth setup. Keep it available through existing external-MCP support; do not make production forms depend on preview access. [Google setup](https://developers.google.com/workspace/sheets/api/guides/configure-mcp-server) |
| Existing Composio plugin | It already advertises Sheets through [its hosted MCP connection](/Users/la/Programming/Tovu/content/agent-plugins/composio/mcp.json:3). Useful for users already connected. Its inspected files do not establish the unattended delivery/idempotency contract needed here; the new plugin must not depend on it. |
| Direct Sheets REST adapter | **Choose for v1.** Explicit row writes suit deterministic delivery. Reuse Jini OAuth and guarded HTTP; no second OAuth library or broad Google SDK is needed for this bounded API surface. |

**Authentication**

OAuth is easiest for ordinary users **once an application OAuth client is configured**: “Connect Google” → browser consent → choose/create spreadsheet.

- Reuse Jini code+PKCE, owner-bound state, refresh coordination, and the existing sealed vault.
- Extend `agent_plugin_connect` to support a plugin-declared OAuth API connection, rather than fabricating an external-MCP server row.
- Store connection metadata and sealed token sets through the existing vault. A custom credential’s static `token` field alone is insufficient.
- Request offline access; request consent again when necessary to obtain a refresh token. Jini already supports extra authorization parameters. [Google offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
- Desktop uses an installed-app client and supported loopback callback; hosted instances use a registered web callback. Arbitrary self-hosted domains need operator client configuration unless a shared broker is separately commissioned. [Desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)
- Chat guides setup and opens existing secure capture cards for client secrets where required. Never ask users to paste secrets into conversation.

**Cut service-account support for v1.** Project/key creation and manually sharing spreadsheets are more work for most users.

**Scopes**

Default to `drive.file`: app-created or explicitly selected spreadsheets. Existing-sheet selection needs a real Google Picker/file-grant flow; a pasted URL alone does not grant access. Avoid broad Drive access and all-spreadsheet scopes by default. [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [Drive file access](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

**Generic tools**

Register one spreadsheet category with adapter/connection selection:

- `spreadsheet_get` — metadata and tabs.
- `spreadsheet_create`.
- `spreadsheet_read` — bounded range/chunks.
- `spreadsheet_append_rows`.
- `spreadsheet_update_rows`.

Exports compose existing authorized table/content readers with create/append. Imports compose spreadsheet reads with existing destination write tools and their confirmation rules. This supports submissions, analytics, product lists, and sheet-as-data use without a new import/export framework.

**Form mapping**

- Default: one managed tab per form.
- Generate headers from effective form fields, using stable field IDs for mapping and labels for display.
- Include submission ID and submitted time; exclude IP by default.
- Join checkbox-group values with `", "`; preserve scalar text, Unicode, and newlines.
- Write visitor values as `RAW`, so leading `=` remains text.
- Append newly added fields as columns. Freeze mapping/payload per delivery; pause with a useful error on incompatible header changes.

**Idempotency**

Do not rely on “search ID, then append”: concurrent or timed-out requests can still append twice.

For automatic delivery:

1. Reserve a row durably for `(workspace, spreadsheet/tab resource, operationId)` before Google I/O.
2. Persist its payload hash; reject reuse of an operation ID with different data.
3. Retry an explicit write to that same row. A lost response or late first request writes identical cells, rather than creating another row. [Range update API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update)
4. Allocate positions transactionally through one shared database authority.

This requires a **managed tab with stable row positions**: use filter views rather than physically sorting/deleting rows. Generic tools must protect managed ranges. Arbitrary user-edited tabs can still support ordinary append, but ambiguous append failures must return an uncertain result rather than retry blindly. The append API exposes no idempotency-key parameter. [Append API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)

**Quotas**

Current standard limits are 300 reads and 300 writes/minute/project, each also limited to 60/minute/user/project. Share a conservative request budget across chat, exports, and background delivery; batch bounded writes and retry 429/transient failures through durable scheduling. Never discard a submission on quota failure. [Google usage limits](https://developers.google.com/workspace/sheets/api/limits)

**E. Phases, files, estimates, and tests**

Estimates are changed production lines, excluding tests, generated schemas, and lockfiles. New filenames are proposed.

| Phase | Files/areas | Estimate | Ownership and proof |
|---|---|---:|---|
| 0. Ratify contracts | Existing forms ADR/spec; additive destination/OAuth/spreadsheet contracts | Documents | Coordinator resolves ownership and records idempotency, planning-time configuration, leases, and managed-tab constraints before implementation. |
| 1. Durable fan-out | Jini `cms/src/forms/notify-subscriber.ts`, `infra/src/events/outbox/{ports,worker,policy}.ts`; Tovu `form-destinations/{types,delivery}.ts`, `composition/modules/integrations.ts`; delivery-plan repo/migration | 350–550 | **Codex, non-UI.** Test atomic planning, replay, independent destinations, recipient failures, restart, unchanged keys on retry, and settings edits after planning. |
| 2. Automatic pull | Jini shared loop helper; Tovu `composition/form-submissions.ts`, `serving-app.ts`, both shutdown paths; receiver-sync-state repo/migration | 200–350 | **Codex, non-UI.** Fake-clock cadence/backoff; concurrent manual/automatic claims; lost ack; bounded backlog; stop/restart; no exporter/daemon loop. |
| 3. OAuth API connections | Jini OAuth/vault-backed connection service; Tovu `agent-plugins/connect-tool.ts`, secure capture and callback adapters; plugin OAuth contribution | 350–600 | **Codex backend; Opus+Chrome flow.** Test state/workspace binding, cross-process callback, refresh races, revocation, missing refresh token, and redaction. |
| 4. Spreadsheet capability + plugin | Jini `integrations/src/spreadsheets/{ports,service,registry,row-reservations}.ts`; Tovu thin tool/composition/repo adapters; `google-sheets/{plugin.json,skills/,lib/,form-destinations/,contribution files}` | 500–800 | **Codex, non-UI.** Contract tests cover CRUD, mapping, quotas, permission failures, timed-out successful writes, concurrent reservation, and retrying the same row. |
| 5. Admin configuration/status | Jini admin Forms ports/controllers/components; Tovu admin API bindings; Forms configuration/status routes | 250–450 | **Opus+Chrome UI.** Configure D1 + Sheets + email; select/create sheet; show independent failures; reconnect and retry; keyboard/accessibility checks. |

Expected total: **roughly 1,650–2,750 production lines**, plus approximately **900–1,400 test lines**. OAuth setup and Picker integration carry the greatest estimate uncertainty.

Use three small persistence additions: delivery plans, receiver sync state, and generic tabular row reservations. Job status/retry remains owned by the existing outbox.

Before release, test packed Jini packages against Tovu’s actual dependency versions. Exercise the real plugin through activation/digest gates. Browser acceptance should include native form submission, repeated pulls, a Sheets write whose response is lost, email continuing during Sheets failure, and desktop restart.

**Cut for v1:** separate receiver infrastructure, Cloudflare cron/webhooks, service accounts, OAuth broker, per-form inheritance, automatic historical backfill, scheduled sheet imports, arbitrary ETL, formatting/formula tools, and bidirectional synchronization. Preserve existing manual pull and webhook behavior.

**F. Risks and owner questions — four**

1. **OAuth client ownership:** will the publisher provide desktop/hosted Google client registrations, or is initial self-hosted setup guided BYO? This determines the promised onboarding experience.
2. **Desktop availability:** accept delivery on reopen, or require delivery while every Tovu process is closed? The latter requires an always-running remote component beyond this plan.
3. **Managed-tab constraint:** accept stable row positions for reliable retries? Supporting arbitrary structural edits needs a different reconciliation contract.
4. **External copies and deletion:** does local purge leave previously delivered spreadsheet rows intact, or remove them too? Recommend “leave external copies” for v1, disclosed when enabling delivery.

The remaining ownership work goes through Coordinator: extend the existing forms, plugin-connect, and outbox owners; place reusable additions in Jini; then certify failure-path tests before implementation.
