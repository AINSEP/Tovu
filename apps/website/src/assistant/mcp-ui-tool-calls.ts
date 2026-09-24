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

/**
 * Tool ids `mcp-ui-tool-calls-route.ts`'s callback endpoint is willing to reach at all — for either
 * shape it speaks: an exchange delivery (ADR-055 Decisions 1/2) or the legacy token-redemption call
 * (ADR-053 Decision 3). Every other `toolName` is refused unconditionally, before either shape's
 * branch even runs.
 *
 * Being on this list is necessary but not sufficient for safety — it is not what MAKES a tool safe
 * to reach this way, only a gate on which already-safe tools this endpoint will forward to. A tool
 * belongs here only if it holds up its end of ONE of the two shapes: either it opens a
 * `SurfaceExchangeStore` exchange and parks on the answer the way `content_post_delete`
 * (`features/post/tool-registrations.ts`, ADR-055 Decision 2) and the form tools do, or — for the
 * legacy shape, currently unused by any wired tool — its own handler performs its own single-use,
 * TTL-bound token redemption via `pending-confirmations.ts`. Adding an id whose handler does neither
 * would turn this into an unauthenticated remote-execution allowlist for that tool, model-callable
 * with no human in the loop.
 *
 * Starts with exactly the one tool this whole mechanism was built for (ADR-053 Decision 6: start
 * narrow, widen only per-tool by deliberate choice).
 */
export const MCP_UI_REDEEMABLE_TOOL_IDS: ReadonlySet<string> = new Set([
  "content_post_delete",
  // 2026-09-13 (SPEC-052) — `supabase_set_access_token` and `supabase_set_project_scope`
  // (`features/supabase-connect/tool-registrations.ts`) hold up the SAME held-open-exchange shape
  // `custom_credential_set_token` does: each opens a `SurfaceExchangeStore` exchange and parks on the
  // human's form submission. One seals a Supabase access token, the other scopes the connection to a
  // project — both durable writes the human must submit themselves. Without these entries every
  // submission of either form is refused with 403.
  "supabase_set_access_token",
  "supabase_set_project_scope",
  // 2026-08-15 — `deployment_execute_static_publish` (`features/deployments/publish-agent-tools.ts`)
  // holds up the SAME shape `content_post_delete` does: its handler opens a `SurfaceExchangeStore`
  // exchange and parks on `ctx.emitSurface` until this endpoint delivers the human's confirm/cancel
  // click, exactly the mechanism this allowlist exists to gate. Publishing sends the site to the
  // public internet with a write-scoped external credential — at least as consequential as a soft
  // delete — so it belongs on this list for the identical reason, not a lesser one.
  "deployment_execute_static_publish",
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
  // 2026-08-16 — `source_control_execute_commit` (`features/source-control/tool-registrations.ts`)
  // holds up the SAME shape `content_post_delete`/`deployment_execute_static_publish` do: its handler
  // opens a `SurfaceExchangeStore` exchange and parks on `ctx.emitSurface` until this endpoint
  // delivers the human's confirm/cancel click. Pushing a real commit to a connected repository with a
  // write-scoped external credential is at least as consequential as a soft delete or a static
  // publish, so it belongs on this list for the identical reason.
  // `source_control_get_capabilities` is deliberately ABSENT here — it is a plain read that never
  // opens an exchange, same reasoning the read-only static-publish tools are absent for above.
  "source_control_execute_commit",
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
  // SAME shape `agent_plugins_uninstall`/`media_trash_asset` do: it opens a `SurfaceExchangeStore`
  // exchange and parks on the human's Uninstall/Cancel click
  // (`features/plugin-runtime/uninstall-confirmation-ui.ts`) before deleting a site plugin's on-disk
  // artifact and every workspace's activation row for it. This is the SITE/RUNTIME plugin family's
  // uninstall tool — the sibling one family over, `agent_plugins_uninstall` below, already had this
  // entry; this closes the identical gap for `.tovu-plugin` uninstalls.
  "plugins_uninstall",
  // 2026-09-14 — `agent_plugins_uninstall` (`features/agent-plugins/tool-registrations.ts`) holds up
  // the SAME shape `media_trash_asset` does: it opens a `SurfaceExchangeStore` exchange and parks on
  // the human's Uninstall/Cancel click (`features/agent-plugins/uninstall-confirmation-ui.ts`) before
  // deleting a package from disk. Proven at the route in
  // `mcp-ui-tool-calls-route.agent-plugins-uninstall.integration.test.ts`.
  "agent_plugins_uninstall",
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
  // 2026-09-08 — narrow-path delete-confirmation build (ADS-memory/reports/
  // 2026-09-08-delete-confirmation-build.md, executing 2026-09-08-content-delete-eval.md §5's
  // recommendation): each of these holds up the SAME held-open-exchange shape `content_post_delete`
  // does — its handler opens a `SurfaceExchangeStore` exchange via the shared
  // `resolveConfirmationDecision` (`contracts/core/tool-surface-exchanges.ts`) and parks on the
  // human's confirm/cancel click before performing its own trash/tombstone/delete. Identity's
  // `identity_role_delete`/`identity_policy_delete` and `workspace_delete` are deliberately absent —
  // out of scope for this family (see that report's §1.2).
  "comments_trash_comment",
  "widgets_trash_instance",
  "theme_trash_file",
  "redirects_tombstone",
  "webhooks_delete_subscription",
  // `media_trash_asset` — sixth and last of the same family, added a beat after the five above in
  // the same build. Holds up the identical shape (its shim in `features/media/tool-registrations.ts`
  // opens a `SurfaceExchangeStore` exchange via `resolveConfirmationDecision`, same as the rest).
  // Missing from this list for one commit: the tool still registered, its dialog still rendered
  // correctly with real asset data, and every direct-handler test still passed — none of that
  // exercises this route, so nothing caught it until a live click through the real endpoint returned
  // 403 TOOL_NOT_ALLOWLISTED for both Trash and Cancel (ADS-memory/reports/
  // 2026-09-08-delete-confirmation-build.md's verification section). "Registers" and "the confirm
  // click works" are different claims — only a request that reaches this allowlist proves the second
  // one; see `mcp-ui-tool-calls-route.media-trash-asset.integration.test.ts` for that proof.
  "media_trash_asset",
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
  // 2026-09-15 — `custom_credential_write_files` (`features/custom-credentials/tool-registrations.ts`)
  // holds up the SAME held-open-exchange shape every entry above does: its handler opens a
  // `SurfaceExchangeStore` exchange and parks on the human's confirm/cancel click
  // (`features/custom-credentials/write-files-confirmation-ui.ts`) before landing a real commit in a
  // third-party repository. Unlike `custom_credential_make_request`'s DELETE-only gate, EVERY call to
  // this tool is gated — there is no un-confirmed path, because every call durably writes to a real
  // repository — so omitting it here would repeat the exact gap `assistant_ask_choice`'s own comment
  // above describes: the dialog would render correctly naming every path it would write, and every
  // submission would 403 with TOOL_NOT_ALLOWLISTED, unusable in production from the day it shipped.
  "custom_credential_write_files",
  // 2026-09-21 — `site_backup_push` (`features/site-backup/tool-registrations.ts`) holds up the same
  // held-open exchange: it parks on the human's Back up/Cancel click
  // (`features/site-backup/confirmation-ui.ts`) before committing the site's database and files to
  // a private GitHub repository. Every call is gated. Without this entry both buttons would 403
  // with TOOL_NOT_ALLOWLISTED, the same gap `custom_credential_write_files` above describes.
  "site_backup_push",
  // 2026-09-21 (trash T4) — `trash_item` (`features/trash/trash-item-tool.ts`) holds up the SAME
  // held-open-exchange shape every entry above does, but only for a GENERIC `TRASHABLE` kind with no
  // bespoke delegate (`form`, `form_submission`, ...): for those it opens its OWN
  // `SurfaceExchangeStore` exchange and parks on the human's Move to trash/Cancel click, exactly like
  // `media_trash_asset`'s shim does. For a kind WITH a delegate (post, comment, media, redirect,
  // widget) the confirm click's `toolName` names the DELEGATE, not `trash_item` — see that file's own
  // `deriveTrashItemRegistrations`, which reuses the delegate's already-open exchange — so this entry
  // is load-bearing only for the generic kinds, but the same 403 gap `media_trash_asset` shipped with
  // for one commit applies equally: omitting it here would render the dialog correctly and then 403
  // TOOL_NOT_ALLOWLISTED on every real click.
  "trash_item",
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
