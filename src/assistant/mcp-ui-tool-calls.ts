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
import { demoToolsEnabled } from "./demo-choices-tool";

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
  // Development only, and admitted under a DIFFERENT justification than the rule above — worth
  // stating plainly rather than letting it read as a precedent. `assistant_demo_choices`
  // (`demo-choices-tool.ts`) performs no token redemption, because it has nothing to redeem: both
  // its branches are pure, it touches no repo, no command gateway, no outbox and no bus, so there
  // is no state a caller could reach through it. The rule above exists to stop this endpoint
  // becoming remote execution for a tool that DOES something; a tool that does nothing is outside
  // what that rule is protecting.
  //
  // Present only when `TOVU_ENABLE_DEMO_TOOLS` is set, so the production allowlist is unchanged --
  // and gated on the same variable as the tool's own registration, so the two cannot disagree
  // about whether it exists. Do not copy this exemption for a tool with side effects.
  ...(demoToolsEnabled() ? ["assistant_demo_choices"] : []),
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
