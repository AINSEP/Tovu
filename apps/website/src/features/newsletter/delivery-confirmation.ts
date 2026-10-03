import { ToolInputError, type ToolExecutionOptions, type ToolExecutionContext } from "@jini-ai/core";
import { buildConfirmationSurface } from "@jini-ai/ui/mcp-ui/surfaces";
import { resolveConfirmationDecision, SURFACE_EXCHANGE_ID_PARAM, type AssistantSurfaceDeps, type ConfirmationOutcome } from "#src/contracts/core/tool-surface-exchanges";

/**
 * Parks one newsletter call for a browser-only decision. Input fields cannot confirm it.
 * @param required - Bound context, shared exchange store, and the facts shown to the human.
 * @returns A fail-closed decision; expiry, cancellation and run abort never authorize mail.
 * @throws ToolInputError when the execution context cannot show a confirmation card.
 * @complexity O(n) in rendered detail lengths.
 */
export async function confirmNewsletterDelivery(required: {
  ctx: ToolExecutionContext;
  surfaces: AssistantSurfaceDeps;
  toolId: string;
  title: string;
  details: { label: string; value: string }[];
}, optional: ToolExecutionOptions = {}): Promise<ConfirmationOutcome> {
  const { ctx, surfaces, toolId, title, details } = required;
  if (!optional.emitSurface) throw new ToolInputError({ message: `NEWSLETTER_NO_CONFIRMATION_CHANNEL: ${toolId} requires a human confirmation card. Nothing was sent or scheduled.` });
  const exchange = surfaces.surfaceExchanges.open({ toolId, principalId: ctx.principal.id }, optional.emitSurface);
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    if (ctx.signal.aborted) { exchange.close(); return { confirmed: false as const, reason: "abandoned" as const }; }
    const resource = buildConfirmationSurface({
      uri: `ui://tovu/newsletter-delivery/${toolId}`,
      title, description: "This action can send email to real people. Only your confirmation can authorize it.", details,
      confirm: { label: "Confirm", toolName: toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: "confirm" } },
      cancel: { label: "Cancel", toolName: toolId, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision: "cancel" } },
      app: { appName: "tovu-newsletter-delivery", appVersion: "1" },
    });
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
    exchange.close();
  }
}
