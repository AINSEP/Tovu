# Product test: can an ordinary user recover a deleted external MCP connection by asking the assistant?

Date: 2026-09-08. Scope: `apps/website/src/assistant/`, `apps/website/src/features/external-mcp/`, live admin dock at `https://localhost:5173`. No source was modified; no `sqlite3` write was run; nothing was executed outside the audited tool catalog.

## Verdict, up front

**No — an ordinary user cannot recover this connection through the assistant, and the assistant is honest about that, but the "recreate the config" fallback it offers is itself broken.**

- OAuth tokens and the two write grants are permanently unrecoverable through any tool the assistant has (confirmed from the schema and the tool input contracts, not inferred).
- The one path the assistant proposes as a fallback — recreate the server row via `external_mcp_save`, then redo OAuth — **is unreachable today**. Its confirmation form cannot be submitted: `external_mcp_save` is missing from `MCP_UI_REDEEMABLE_TOOL_IDS`, so the human's "Add server" click is refused with a live `403 TOOL_NOT_ALLOWLISTED` before it ever reaches the parked exchange. I reproduced this by clicking through the real form; verbatim error below.
- The live `external_mcp_servers` table has **zero rows** after the attempt. No partial row was created. The byte-exact restore another agent has queued is still valid against an empty table for this id.

## Part 1 — the assistant's real capability, tool by tool

Catalog: `apps/website/src/features/external-mcp/agent-tools.ts` (5 tools), wired in `apps/website/src/features/external-mcp/tool-registrations.ts`.

| Tool | Definition | Reachable? | What it can/can't do here |
|---|---|---|---|
| `external_mcp_list` | yes | yes (`externalMcpDerivedRisk` has an entry; no confirmation needed, not exchange-shaped) | Read-only view. Cannot create anything. |
| `external_mcp_save` | yes | **NO — confirmed broken, live** | The only write tool for a server row. Opens an `askOnce` MCP-UI exchange and parks for the human's confirm click — but **`external_mcp_save` is absent from `MCP_UI_REDEEMABLE_TOOL_IDS`** (`apps/website/src/assistant/mcp-ui-tool-calls.ts:36-171`; full list checked, only `external_mcp_reauth_prompt` from this domain is present). `mcp-ui-tool-calls-route.ts:190-193` (`registerMcpUiToolCallsRoute`) checks `isMcpUiToolCallAllowed(toolName)` **before** either the exchange-delivery branch or the legacy-redemption branch runs, so this is a hard, unconditional refusal, not a fallback. Same defect shape as `media_trash_asset`, found and fixed today in this same file (see `be2fb111`) — `external_mcp_save` was missed. |
| `external_mcp_test_connection` | yes | yes | Read-only readiness probe on an already-saved row; irrelevant here since there is no row. |
| `external_mcp_oauth_connect` | yes | yes (has a risk entry; not reachable in practice because `external_mcp_save` never succeeds first) | Starts a fresh authorization; hands the human a URL/device code and stops — "your job ends at handing over one link." Never receives or stores a pre-existing token. |
| `external_mcp_oauth_poll_device` | yes | yes | Polls once; same limits as above. |

**Can it restore a sealed OAuth credential? No — verified from the input contracts, not asserted.**
- `SaveExternalMcpOAuthInput` (`apps/website/src/assistant/external-mcp-store.ts:907-923`): `providerId, grant, clientId, clientSecret, scopes, tokenEnvName, authorizationEndpoint, tokenEndpoint, deviceAuthorizationEndpoint`. No field for an existing sealed blob, an existing access/refresh token, or a keyId.
- `SAVE_INPUT_SCHEMA` (`agent-tools.ts:90-142`), the model-facing schema for `external_mcp_save`, has the same absence, plus no `env`/`oauthClientSecret` at all by design (header comment: secrets are typed by the human into the rendered form, never passed as tool arguments).
- Consequence: "restore OAuth" always means a **brand-new authorization from scratch**, requiring the owner to sign into Higgsfield again. There is no shortcut even if the tool call succeeded.

**Can it set `write_allowed_tool_names`? No — and this is independent of the allowlist bug.**
`buildSaveExternalMcpServerInputFromFormParams` (`tool-registrations.ts:227-262`) hardcodes `writeAllowedToolNames: ""` on every save this tool ever performs, because the rendered form has no field for it (comment at `tool-registrations.ts:220-224` calls this the "designed default, not a bug" for an un-migrated caller). So even a working `external_mcp_save` would silently drop both of the owner's write grants — she would get read access back but not the write-scoped tools, with no warning.

**Can anything read from a backup database file? No.** No tool in this catalog, or anywhere I found in `src/assistant/`, takes a file path or reads any database other than the live one through the injected repo.

**`external_mcp_servers` has no `deleted_at`, confirmed from schema** (`apps/website/src/platform/db/schema.ts:2245-2349`): the table's only soft-delete-shaped column belongs to a different table (`deletedAt`/`deleted_at` exists on posts, per line 98, not here). Primary key is `(workspace_id, server_id)` — a hard delete removes the row outright; there is no undo state. Confirmed by direct read, not repeated from the recovery report.

## Part 2 — verbatim transcript, live dock

Admin at `https://localhost:5173/admin/`, already authenticated (shared dev session). Opened "Tovu assistant" dock, typed as an ordinary user would:

> "I accidentally deleted my higgsfield MCP server connection about two hours ago. Can you get it back for me?"

Assistant's tool sequence (as rendered in the dock, step labels verbatim): `Search content`, `ToolSearch`, `Read` (a prior recovery-investigation note), `ToolSearch`, then two failed `assistant_ask_choice` attempts (one hit a genuine schema-validation bug: `daemon 400 ... 'singleSelect' requires a non-empty 'label' and at least one option` — a separate, minor defect, not chased further here), then a successful `assistant_ask_choice`.

Assistant's message, verbatim:

> "Higgsfield MCP connection was hard-deleted — how do you want to restore it?
> Confirmed: the higgsfield row is gone from the live database, and there's no soft-delete/undo. A byte-exact backup of it exists, but restoring it requires a raw database write outside the audited tool catalog — I won't do that. The site's only two restore points (2026-08-25 and 2026-08-01) both predate higgsfield's creation (2026-08-27) and would also roll back everything else on the site since then, so a full-site restore isn't viable either. The one path available through the audited tools: recreate the server config (I have the exact label, URL, and both allowed/write-allowed tool lists from before) with `external_mcp_save`, then you re-authorize via OAuth (a fresh Higgsfield sign-in — the old tokens can't be carried over through these tools)."

Choices offered: **"Recreate the server config now and start OAuth re-authorization"** / "Don't do anything yet — I need to think about it."

This is an accurate, non-overclaiming summary of the real constraints — it correctly refuses the raw-DB-write shortcut, correctly rules out the restore points, and correctly states OAuth cannot be carried over. One caveat: it says it has "the exact label, URL, and both allowed/write-allowed tool lists from before" — the prefilled form (below) did carry the exact label/URL/allowed-tools, **but the write-allowed list was never actually placed in the form** (there is no field for it — see Part 1), so that specific claim overstates what the tool can actually carry forward. It also prefilled an OAuth **Client ID** (`DWjbUpAZxhRW2AgE`) into the form with no visible sourcing — the row it would have come from no longer exists in the DB, so this value came from context the assistant read elsewhere in this dev environment (most plausibly the peer investigation notes it read at the start of the turn), not from anything a real customer's assistant instance would have access to. Flagging this as a test-environment confound: a production tenant's assistant would not have another team's internal engineering notes sitting in its readable context, so this particular prefill accuracy should not be read as a capability a real user would get.

Selected "Recreate the server config now…". The assistant opened `external_mcp_save` twice:
1. First call failed fast: `daemon 400 ... BAD_REQUEST: 'id' (non-empty string) is required` (a minor call-construction bug, self-corrected on retry).
2. Second call rendered the real confirmation form (`buildExternalMcpSaveForm`) prefilled with `id: higgsfield`, `Display name: higgsfield`, `URL: https://mcp.higgsfield.ai/mcp`, `Allowed tools: generate_image,models_explore,job_…`, `Sign-in method: Browser sign-in`, `Client ID: DWjbUpAZxhRW2AgE`, plus empty Client secret / Scopes / endpoint fields prefilled with `https://mcp.higgsfield.ai/oauth2/authorize` and `.../oauth2/token`.

I filled nothing further and clicked **"Add server"** as the human would. Live result, verbatim, rendered inline under the form:

> **"Failed: 'external_mcp_save' is not an MCP-UI-redeemable tool"**

This is the server's own `TOOL_NOT_ALLOWLISTED` message (`mcp-ui-tool-calls-route.ts:191`), echoed unmodified to the browser — not a client-side glitch. The `askOnce` exchange stayed parked (spinner kept spinning; no `saved:`/`cancelled:` result was ever returned to the model) until I stopped the run manually. The assistant never got a chance to tell the human anything more specific than the pending state — the run just terminated mid-tool-call when I hit stop, because I chose not to wait out the full exchange TTL. The assistant was never dishonest here; it simply never received an answer to report, honestly or otherwise, because the delivery route refused it before an answer could exist.

## Part 3 — live DB state, read-only

```
sqlite3 "file:/Users/la/Programming/Tovu/sites/tovu-com/content.db?mode=ro" \
  "SELECT count(*) FROM external_mcp_servers;"
```
Before the conversation: `0` rows. After the full attempt (including the failed "Add server" click): **`0` rows, unchanged.**

**No partial row was created.** The byte-exact restore another agent has queued for this id is still valid against an empty table — nothing here invalidates its precondition. Confirmed by direct read-only query, not inferred from the UI.

## What the owner loses permanently, and the smallest fix

- **Permanently lost, no tool changes this:** the OAuth access/refresh tokens (must re-authorize from scratch regardless of any fix below) and the two write grants (no form field exists for them in the agent path even when working).
- **Fixable today, one-line change:** add `"external_mcp_save"` to `MCP_UI_REDEEMABLE_TOOL_IDS` in `apps/website/src/assistant/mcp-ui-tool-calls.ts`. Until that ships, the assistant's own proposed recovery path — the one it correctly identifies as the only audited option — is dead on arrival for every user, not just this one. This is the highest-value fix: it doesn't undo the loss, but it turns "the assistant offers a plan it cannot execute" into "the assistant can actually do the one thing within its power."
- **Separately worth a ticket:** `writeAllowedToolNames` has no field in `save-form.ts`, so recreating a connection through the assistant will always silently drop write grants even after the allowlist fix — a user who restores this way will see read tools work and have no way to know write access quietly didn't come back until something that needs to write fails later.
- **Root cause, not a fix owed to this bug:** no `deleted_at`/undo state on `external_mcp_servers` at all. A trash/soft-delete state (the same shape posts already have) would make this whole class of "one click, no confirmation, gone" story impossible even before the confirmation gate (`b3e6d5f8`) that already shipped today.

## Worklist / open items for whoever picks this up

1. Add `external_mcp_save` to `MCP_UI_REDEEMABLE_TOOL_IDS` (`apps/website/src/assistant/mcp-ui-tool-calls.ts`) and add a regression test in the same shape as `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts`, proving a real confirm click reaches `saveExternalMcpServer`. This was NOT fixed by me — out of scope for this dispatch (observation only) — flagging for the next agent.
2. The `assistant_ask_choice` `daemon 400 ... 'singleSelect' requires a non-empty 'label'` validation failure I hit twice before it self-corrected is a separate, minor bug worth a quick look — not chased further here.
3. Confirm with the team lead whether the OAuth Client ID the assistant prefilled (`DWjbUpAZxhRW2AgE`) came from a peer agent's report text in this shared repo — if so, that's a context-isolation gap between this dev session's internal engineering notes and the assistant's own conversation, worth flagging independently of this recovery scenario.
4. `writeAllowedToolNames` has no path back through the agent tools at all — worth a product decision on whether that's acceptable long-term or needs a form field.

## Context usage

Moderate — this task ran static code reads (schema, tool catalog, wiring), one live browser session (~25 screenshots/actions), and three narrow read-only `sqlite3` queries. Well under the 250k rotation threshold; no rotation needed.
