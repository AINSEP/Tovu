import { nativeToolMetadata } from '../contracts/core/tool-metadata/index.js';
// Membership is derived from each owning domain's reviewed metadata.
// Credential forms submit secrets only to an already parked, principal-bound exchange.
// See the owning tool metadata and handlers for each card's rationale.
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

import { FEDERATED_TOOL_ID_PREFIX } from "@jini-ai/mcp/federation";

/**
 * Tool ids `mcp-ui-tool-calls-route.ts`'s callback endpoint is willing to reach at all — for either
 * shape it speaks: an exchange delivery (ADR-055 Decisions 1/2) or the legacy token-redemption call
 * (ADR-053 Decision 3). Every other `toolName` is refused unconditionally, before either shape's
 * branch even runs.
 *
 * Being on this list is necessary but not sufficient for safety — it is not what MAKES a tool safe
 * to reach this way, only a gate on which already-safe tools this endpoint will forward to. A tool
 * with effects belongs here only if its handler parks on a principal-bound exchange or performs
 * single-use, TTL-bound token redemption. Otherwise a fresh callback could execute without human
 * approval. Pure callbacks have explicit per-tool carve-outs at the owning metadata rows (for
 * example demo form readback and content_post_search); ordinary authorization still applies.
 *
 * ADR-053 Decision 6 requires widening this surface only by deliberate per-tool review.
 */
export const MCP_UI_REDEEMABLE_TOOL_IDS: ReadonlySet<string> = nativeToolMetadata.redeemableIds;

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
 * all secret-bearing forms and permanent-delete cards require an exchange;
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
  // Destructive/publish policy cards may answer a parked call, never execute a new call via this endpoint.
  // An exchange-only constraint does not itself admit an otherwise unlisted callback.
  if (MCP_UI_REDEEMABLE_TOOL_IDS.has(toolName)) return answersAnExchange || !nativeToolMetadata.exchangeOnlyIds.has(toolName);
  return answersAnExchange && toolName.startsWith(FEDERATED_TOOL_ID_PREFIX);
}
