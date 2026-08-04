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
 * Tool ids the redemption endpoint is willing to execute at all. Every other `toolName` is refused
 * unconditionally, before any authorization or execution is attempted.
 *
 * Being on this list is necessary but not sufficient for safety — it is not what MAKES a tool safe
 * to redeem this way, only a gate on which already-safe tools this endpoint will forward to. A tool
 * belongs here only if its own handler performs its own single-use, TTL-bound token redemption via
 * `pending-confirmations.ts` the way `content_post_delete` does (see
 * `features/post/tool-registrations.ts`); adding an id whose handler has no such redemption step
 * would turn this into an unauthenticated remote-execution allowlist for that tool, model-callable
 * with no human in the loop.
 *
 * Starts with exactly the one tool this whole mechanism was built for (ADR-053 Decision 6: start
 * narrow, widen only per-tool by deliberate choice).
 */
export const MCP_UI_REDEEMABLE_TOOL_IDS: ReadonlySet<string> = new Set([
  "content_post_delete",
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
