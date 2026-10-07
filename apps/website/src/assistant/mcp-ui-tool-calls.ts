/**
 * @file The MCP-UI confirmation redemption allowlist (ADR-053 Decision 3, Decision 6's stopgap
 * posture carried forward into the real transport).
 *
 * `POST /api/admin/v1/mcp-ui/tool-calls` executes a named tool on a human's confirmed click inside
 * a rendered MCP-UI dialog — but the dialog's HTML is untrusted (`@jini-ai/chat`'s
 * `create-mcp-ui-tool-caller.ts`, the client half, says this outright: it performs no validation of
 * `toolName`/`params` and holds no allow-list of its own by design, because a View's HTML came from
 * a tool author, not this host). Without a server-side allowlist, this endpoint would be a general
 * tool-execution surface reachable by anything an agent's own tool result can render — exactly the
 * "worse than no gate" outcome ADR-053's Context section names for a confirmation the model can
 * route around. This module is that allowlist, shared by both halves of the redemption path (the
 * daemon-side execution route and Tovu's session-authenticated proxy in front of it — see
 * `mcp-ui-tool-calls-route.ts` and `server/modules/assistant.ts`) so the two cannot drift apart.
 */

import { POLICY_CONFIRMATION_TOOL_IDS } from "../contracts/headless/assistant-tool-approval-policy.js";

import { FEDERATED_TOOL_ID_PREFIX } from "@jini-ai/mcp/federation";

/**
 * Tool ids `mcp-ui-tool-calls-route.ts`'s callback endpoint is willing to reach at all — for either
 * shape it speaks: an exchange delivery (ADR-055 Decisions 1/2) or the legacy token-redemption call
 * (ADR-053 Decision 3). Every other `toolName` is refused unconditionally, before either shape's
 * branch even runs.
 *
 * Being on this list is necessary but not sufficient for safety — it is not what MAKES a tool safe
 * to reach this way, only a gate on which already-safe tools this endpoint will forward to. A tool
 * belongs here only if it holds up its end of ONE of the two shapes: either it opens a
 * `SurfaceExchangeStore` exchange and parks on the answer the way `identity_role_delete`
 * and the credential form tools do, or — for the
 * legacy shape, currently unused by any wired tool — its own handler performs its own single-use,
 * TTL-bound token redemption through a tool-owned token store. Adding an id whose handler does neither
 * would turn this into an unauthenticated remote-execution allowlist for that tool, model-callable
 * with no human in the loop.
 *
 * Originally started with the one tool this mechanism was built for (ADR-053 Decision 6: start
 * narrow, widen only per-tool by deliberate choice).
 * PendingConfirmationStore (apps/website/src/assistant/pending-confirmations.ts) was deleted 2026-10-03: unused; see development/DELETED-CODE.md.
 */
export const MCP_UI_REDEEMABLE_TOOL_IDS: ReadonlySet<string> = new Set([
  // Owner 2026-10-07: these IDs answer policy cards only; never execute a fresh callback call.
  ...POLICY_CONFIRMATION_TOOL_IDS,
  // Credential forms submit secrets only to the already parked, principal-bound exchange.
  "media_propose_provider_credential",
  "source_control_propose_credential",
  // Protected privacy/instructions/runtime writes wait for an authenticated human card.
  "settings_set_value",
  "settings_clear_value",
  "trash_empty",
  "trash_purge_item",
  "media_purge_asset",
  "comments_purge_comment",
  "identity_user_delete",
  "external_mcp_delete",
  "custom_credential_delete",
  "deployment_delete_provider_credential",
  "source_control_delete_credential",
  // Host secrets: removing one, or replacing an existing value, waits for the human's card.
  "deployment_ops_set_secret",
  "deployment_ops_unset_secret",
  // Newsletter delivery parks on the same browser-only surface exchange; no model input confirms it.
  "newsletter_send_campaign",
  "newsletter_schedule_campaign",
  "newsletter_resume_campaign",
  "newsletter_resend_confirmation",
  // `agent_plugin_set_access_token` (`features/agent-plugins/access-token-tool.ts`; moved 2026-09-29
  // from SPEC-052's Supabase-only `supabase_set_access_token`) holds up the SAME held-open-exchange
  // shape `custom_credential_set_token` does: it opens a `SurfaceExchangeStore` exchange and parks on
  // the human's form submission, which seals a plugin's access token — a durable write the human must
  // submit themselves. Without this entry every submission of the form is refused with 403.
  "agent_plugin_set_access_token",
  // 2026-09-27 — `agent_plugin_connect` (`features/agent-plugins/connect-tool.ts`, S-G1 of the
  // generic-agent-plugin v2 plan) opens a `SurfaceExchangeStore` exchange and holds it open while it
  // polls for the human's sign-in rather than waiting on a click. Today's card carries no callback —
  // its one action is an outbound `openLink`, not a delivery through this route — but it is listed
  // here anyway so a later cancel/retry action needs no second edit to stop being a silent 403.
  // (It replaced the Supabase-only `supabase_get_database` prototype, deleted 2026-09-27.)
  "agent_plugin_connect",
  // 2026-10-04 (852d711e6, Layout B) — `agent_plugin_write_note` (`features/agent-plugins/
  // write-note-tool.ts`) asks first through `requireHumanConfirm`, the same held-open exchange the
  // identity deletes below use: the human sees the exact note and file before it is saved to the
  // plugin's memory. Without this entry every Save/Cancel click would 403 with TOOL_NOT_ALLOWLISTED.
  "agent_plugin_write_note",
  // 2026-08-15 — `deployment_propose_custom_provider_credential` (`features/deployments/
  // publish-agent-tools.ts`) holds up the SAME shape `content_post_delete`/
  // `deployment_execute_static_publish` do: its handler opens a `SurfaceExchangeStore` exchange and
  // parks on `ctx.emitSurface` until this endpoint delivers the human's form submission/cancel.
  // Saving an S3-compatible credential is a real, external-account-scoped write — at least as
  // consequential as the publish tool above, so it belongs on this list for the identical reason.
  // `deployment_generate_bucket_hosting_setup` (the OTHER new tool from the same spec, §3a) is
  // deliberately ABSENT here — it is a plain read that never opens an exchange, so admitting it would
  // only widen this endpoint's reach for no reason (same reasoning the two existing read-only
  // static-publish tools are absent for, in the test file's own comment).
  "deployment_propose_custom_provider_credential",
  // 2026-09-09 — `plugins_set_enabled` (`features/plugin-runtime/tool-registrations.ts`) holds up the
  // SAME shape `content_post_delete`/`deployment_execute_static_publish` do: on an ENABLE it opens a
  // `SurfaceExchangeStore` exchange and parks on `ctx.emitSurface` until this endpoint delivers the
  // human's confirm/cancel click (`features/plugin-runtime/set-enabled-confirmation-ui.ts`). Turning a
  // plugin on is a privilege escalation for the assistant itself — an Agent Plugin's SKILL.md enters
  // the run prompt and its tool becomes registrable; a site plugin's enable hook can run live ADR-023
  // schema DDL — so it belongs here for the identical reason, not a lesser one. The DISABLE direction
  // raises no dialog and never reaches this endpoint.
  "plugins_set_enabled",
  // 2026-09-16 — `plugins_uninstall` (`features/plugin-runtime/tool-registrations.ts`) holds up the
  // SAME shape `media_trash_asset` does: it opens a `SurfaceExchangeStore` exchange and parks on the
  // human's Uninstall/Cancel click before removing a plugin. ONE entry now covers BOTH plugin
  // families (S4, 2026-09-24): the site/runtime branch's own dialog
  // (`features/plugin-runtime/uninstall-confirmation-ui.ts`) before moving a site plugin's on-disk
  // artifact to the Trash, and the Agent Plugin branch's dialog
  // (`features/agent-plugins/uninstall-confirmation-ui.ts`, via `uninstall-tool.ts`'s
  // `runAgentPluginUninstall`) before permanently deleting a package from disk. The Agent Plugin
  // branch used to be a separate standalone tool, `agent_plugins_uninstall`, with its own allowlist
  // entry, proven at the route in the now-retargeted
  // `mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts` — deleted along with that
  // tool: both families' confirm/cancel clicks redeem through this ONE id now.
  "plugins_uninstall",
  // `plugins_install` / `skills_install` were listed here 2026-10-05 behind an Install/Cancel card,
  // then the card was dropped the same day. Owner 2026-10-07 keeps ordinary installs direct. They no longer
  // open an exchange, so listing them would make this endpoint a no-human path to an install.
  // The `/search` composer capability's real execution path (`apps/admin/src/features/plugins/
  // composer-capabilities.ts`'s `allowlisted-tool-call` binding) — a direct, immediate browser call
  // with no agent turn in between, exactly what that binding kind exists for.
  //
  // Admitted under the SAME carve-out as `assistant_demo_choices` below, not either of the two
  // confirmation shapes this rule otherwise requires: `postDerivedRisk`
  // (`features/post/tool-registrations.ts`) classifies `content_post_search` "none" — its handler
  // performs one SELECT against the FTS5 search index (`search.ts`'s `searchAdminPosts`) behind the
  // same inline `content.read` permission check `content_post_list`/`content_post_get` already
  // perform, and writes nothing: no repo save, no command gateway, no outbox, no bus. A caller
  // reaches only what the admin session's own `content.read` grant already exposes through the
  // Posts/Pages admin screens — unlike `content_post_delete`, there is no state this call could put
  // the workspace into that a human would need to approve first, so the confirmation-shape rule has
  // nothing to protect here. (Verified 2026-08-12 against a real `ToolRegistry`/`ToolExecutor` pair —
  // see `mcp-ui-tool-calls-route.content-search.integration.test.ts`.)
  "content_post_search",
  // Admitted under a DIFFERENT justification than the rule above — worth stating plainly rather
  // than letting it read as a precedent. `assistant_demo_choices`
  // (`demo-choices-tool.ts`) performs no token redemption, because it has nothing to redeem: both
  // its branches are pure, it touches no repo, no command gateway, no outbox and no bus, so there
  // is no state a caller could reach through it. The rule above exists to stop this endpoint
  // becoming remote execution for a tool that DOES something; a tool that does nothing is outside
  // what that rule is protecting.
  //
  // 2026-08-26: this entry used to be conditional on `TOVU_ENABLE_DEMO_TOOLS`, matching the gate on
  // the tool's own registration so the two could not disagree about whether it existed. Both are
  // now unconditional, so they still cannot disagree — the tool is always registered and always
  // redeemable. Nothing about the reasoning above changes: it is admitted because it does nothing,
  // not because it is a demo.
  "assistant_demo_choices",
  // 2026-08-31 — `assistant_ask_choice` (`ask-choice-tool.ts`) holds up the SAME held-open-exchange
  // shape `content_post_delete`/`deployment_execute_static_publish`/
  // `deployment_propose_custom_provider_credential`/`source_control_execute_commit` do, NOT the
  // "does nothing, so nothing to protect" carve-out `assistant_demo_choices` above is admitted
  // under: its handler opens a `SurfaceExchangeStore` exchange (`surfaces.surfaceExchanges.open`)
  // and parks on the administrator's answer via `askOnce` before this route is ever reached. It was
  // omitted when the tool landed — a plain gap, not a deliberate exclusion — which meant the form
  // rendered correctly but every submission was refused here with a 403, unusable in production
  // from the day it shipped. See `mcp-ui-tool-calls-route.ask-choice.integration.test.ts` for the
  // real round trip this entry makes possible.
  "assistant_ask_choice",
  // 2026-08-31 — `custom_credential_make_request` (`features/custom-credentials/tool-registrations.ts`)
  // holds up the SAME held-open-exchange shape `content_post_delete`/`deployment_execute_static_publish`/
  // `source_control_execute_commit` do, but ONLY for its DELETE method: its handler opens a
  // `SurfaceExchangeStore` exchange and parks on the human's confirm/cancel click before sending a
  // DELETE through a saved third-party credential — at least as consequential as a soft delete or a
  // static publish, since the provider's own DELETE may be genuinely irreversible. GET/POST/PUT/PATCH
  // calls to the SAME tool never open an exchange at all (owner decision — see that file's own
  // header), so admitting the tool id here does not widen this endpoint's reach for those methods;
  // there is simply nothing for them to redeem.
  "custom_credential_make_request",
  // 2026-09-01 — `custom_credential_set_token` (`features/custom-credentials/tool-registrations.ts`)
  // holds up the SAME held-open-exchange shape every entry above does: its handler opens a
  // `SurfaceExchangeStore` exchange and parks on the human's form submission before sealing a fresh
  // token. Omitting it here would repeat the exact gap `assistant_ask_choice`'s own comment above
  // describes — the form would render correctly and every submission would 403, unusable in
  // production from the day it shipped, since a masked token field has nowhere else to go but this
  // endpoint (the tool's own schema accepts no token at all, by design).
  "custom_credential_set_token",
  // 2026-09-03 — `custom_credential_create` (`features/custom-credentials/tool-registrations.ts`)
  // holds up the SAME held-open-exchange shape `custom_credential_set_token` immediately above does:
  // its handler opens a `SurfaceExchangeStore` exchange and parks on the human's multi-field form
  // submission (label, base URL, category, optional username, and the token) before creating a fresh
  // credential row. Omitting it here would repeat the exact gap `assistant_ask_choice`'s own comment
  // above describes — the form would render correctly and every submission would 403, unusable in
  // production from the day it shipped, since the token has nowhere else to go but this endpoint (the
  // tool's own schema accepts no token at all, by design).
  "custom_credential_create",
  // 2026-09-01 — `assistant_tool_failure_recovery` (`tool-failure-recovery.ts`) holds up the SAME
  // held-open-exchange shape every entry above does: it is the generic `ToolFailureDiagnostic`
  // consumer loop, and it opens its OWN `SurfaceExchangeStore` exchange (under this synthetic id, not
  // a real registered tool) and parks on the human's answer before deciding whether to apply a
  // suggested fix and retry. Not a domain tool at all — see that file's own header — but it still
  // needs to be reachable through this same redemption path, for the identical reason every other
  // held-open exchange does.
  "assistant_tool_failure_recovery",
  // 2026-09-02 — `external_mcp_reauth_prompt` (`external-mcp-reauth-tool.ts`) holds up the SAME
  // held-open-exchange shape every entry above does: its handler opens a `SurfaceExchangeStore`
  // exchange and parks on the administrator's "Got it" click before returning. Omitting it here
  // would repeat the exact gap `assistant_ask_choice`'s own comment above describes — the notice
  // would render correctly and every acknowledgement would 403, leaving the parked call to expire
  // on its own idle deadline instead of ever resolving.
  "external_mcp_reauth_prompt",
  // Permanent webhook deletion still waits for a human decision.
  "webhooks_delete_subscription",
  // 2026-09-08 — `external_mcp_save` (`features/external-mcp/tool-registrations.ts`) holds up the
  // SAME held-open-exchange shape `content_post_delete`/`media_trash_asset` do: its handler opens a
  // `SurfaceExchangeStore` exchange and parks on the human's "Add server"/Cancel click before writing
  // anything. Missing since the domain was wired (`ADS-memory/reports/
  // 2026-09-07-assistant-tool-coverage-audit.md`'s Gap #1) — a plain gap, not a deliberate exclusion,
  // the identical shape `assistant_ask_choice`'s own comment above describes. Caught only by a live
  // click through the real admin dock while attempting to recover a deleted external MCP connection
  // (ADS-memory/reports/2026-09-08-dock-recovery-product-test.md): the assistant's own proposed
  // recovery path — "recreate the config, then re-authorize" — rendered the confirmation form
  // correctly with real prefilled data, then every submission (including Cancel) 403'd with
  // TOOL_NOT_ALLOWLISTED before ever reaching `saveExternalMcpServer`, exactly as `media_trash_asset`
  // did for one commit. See `mcp-ui-tool-calls-route.external-mcp-save.integration.test.ts` for the
  // real round trip this entry makes possible.
  "external_mcp_save",
  // 2026-09-27 — `database_transfer_run` (`features/database-transfer/tool-registrations.ts`) parks on
  // the human's Copy/Cancel click (`features/database-transfer/confirmation-ui.ts`) before copying the
  // site's data into a Postgres database. Only replacement opens a card; first copies run immediately.
  "database_transfer_run",
  // 2026-09-27 — `database_transfer_set_destination` parks on the human's private form for the
  // destination database's address (`features/database-transfer/destination-ui.ts`); the address goes
  // browser -> this route -> the parked call, never through the model. Without this entry Save 403s.
  "database_transfer_set_destination",
  // 2026-09-24 (tool-design audit F3; narrowed the same day to the owner's "only permanent deletes
  // confirm" rule — webhooks_create_subscription/sites_duplicate_site/media_generate_asset/
  // identity_role_assign/identity_policy_attach were gated too, then backed out): the identity
  // tools that delete for good, plus identity_user_create's human-typed-password form, ask first
  // through `requireHumanConfirm` (`contracts/core/human-confirm.ts`), which opens the same
  // held-open exchange as every entry above. Without these entries every Confirm/Cancel click would
  // 403 with TOOL_NOT_ALLOWLISTED.
  "identity_role_delete",
  "identity_policy_delete",
  "identity_user_create",
  // 2026-09-24 (owner-approved): the three gated-mutation execute tools ask the human in chat
  // through `humanConfirmedToolHandler` (`contracts/core/human-confirm.ts`), which opens the same
  // held-open exchange via `requireHumanConfirm`. The click carries only the decision; the confirm
  // step runs as the human whose click this endpoint delivered.
  "taxonomy_execute_merge_term",
  // Pull parks on the same human-bound confirmation exchange before entering the import gateway.
  "publish_content_execute_pull",
  "database_execute_migrate_forward",
  "backup_execute_restore",
]);

/**
 * Whether `toolName` may be executed through the MCP-UI redemption endpoint.
 *
 * @complexity O(1) — a `Set` lookup.
 * @overallScore 100
 */
export function isMcpUiToolCallAllowed(toolName: string): boolean {
  return MCP_UI_REDEEMABLE_TOOL_IDS.has(toolName);
}

/**
 * The one rule both halves of the redemption path apply (the daemon route and Tovu's proxy):
 * the media/source-control credential forms and permanent-delete cards require an exchange;
 * other allowlisted ids pass.
 * A FEDERATED id (`mcp__<connection>__<name>`) passes only when the
 * request answers an open card (names an exchange, or is a typed answer resolved to one).
 *
 * Why federated ids are not simply allowlisted: they are discovered at runtime, and every one of them
 * declaring a protected action opens a per-call confirmation card (G3, `external-mcp-call-
 * confirmation.ts`). Answering that card only hands a decision to a call that is already parked and
 * already authorized; it executes nothing, and the exchange's own binding (tool id + principal)
 * decides whether the answer lands. Letting the same id reach Shape 2 would make this route a way to
 * RUN a third-party tool from a surface's HTML with no human in the loop, so it never does.
 *
 * @complexity O(1).
 */
export function isMcpUiToolCallPermitted(toolName: string, answersAnExchange: boolean): boolean {
  // Form secrets must reach a parked handler, never a fresh tool execution or its input audit.
  if (toolName === "media_propose_provider_credential" || toolName === "source_control_propose_credential") return answersAnExchange;
  // Destructive/publish policy cards may answer a parked call, never execute a new call via this endpoint.
  if (PERMANENT_DELETE_CONFIRMATION_TOOL_IDS.has(toolName) || POLICY_CONFIRMATION_TOOL_IDS.has(toolName)) return answersAnExchange;
  if (MCP_UI_REDEEMABLE_TOOL_IDS.has(toolName)) return true;
  return answersAnExchange && toolName.startsWith(FEDERATED_TOOL_ID_PREFIX);
}

const PERMANENT_DELETE_CONFIRMATION_TOOL_IDS: ReadonlySet<string> = new Set([
  "trash_empty", "trash_purge_item", "media_purge_asset", "comments_purge_comment",
  "identity_user_delete", "external_mcp_delete", "custom_credential_delete",
  "deployment_delete_provider_credential", "source_control_delete_credential",
]);
