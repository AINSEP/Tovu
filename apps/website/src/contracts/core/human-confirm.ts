/**
 * @file `requireHumanConfirm` — the one call a tool makes to ask the human "do this?" before a
 * privileged, outward, paid or irreversible action (2026-09-24 tool-design audit, F2/F3).
 *
 * Not a new confirmation mechanism: it is the held-open MCP-UI exchange every confirmed tool already
 * uses (`webhooks_delete_subscription`, `media_trash_asset`, ...), packaged so a new gate is a few
 * lines instead of the ~50 each of those repeats — the missing-emitter refusal, the exchange, the
 * `buildConfirmationSurface` dialog, the abort wiring and the fail-closed classification. The click
 * still reaches the parked call through `mcp-ui-tool-calls-route.ts`, so every `toolId` passed here
 * must be on `MCP_UI_REDEEMABLE_TOOL_IDS`; `mcp-ui-allowlist-completeness.test.ts` scans for calls
 * to this function the same way it scans for `surfaceExchanges.open(...)`.
 *
 * The click carries only `decision` (plus the exchange id). Everything the action runs with was
 * fixed before the dialog was drawn and is exactly what the dialog names, so the human agrees to
 * the action on screen, not to whatever a later model turn supplies.
 */
import { humanConfirmedHandler, type HumanConfirmer } from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionContext, type ToolHandler } from "@jini-ai/core";
import { buildConfirmationSurface, type SurfaceDetail, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import {
  resolveConfirmationDecision,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type ConfirmationOutcome,
} from "./tool-surface-exchanges.js";

export interface HumanConfirmSpec {
  /** The calling tool's own id — the click is routed back to it, so it must be allowlisted. */
  readonly toolId: string;
  /** Prefix for the refusal code when no human can be asked, e.g. `"WEBHOOKS"`. */
  readonly errorCode: string;
  readonly title: string;
  readonly description?: string;
  readonly details: readonly SurfaceDetail[];
  readonly warning?: string;
  readonly danger?: boolean;
  readonly confirmLabel: string;
}

/**
 * Shows the confirmation dialog and waits for the human's answer.
 *
 * @throws {ToolInputError} `<errorCode>_NO_CONFIRMATION_CHANNEL` when the call has no
 *   `emitSurface` (a headless run): no human can be asked, so nothing runs.
 * @returns Fail-closed: only an explicit confirm click is `{ confirmed: true }`.
 * @complexity O(1) plus the wait for the human.
 */
export async function requireHumanConfirm(
  ctx: ToolExecutionContext,
  surfaces: AssistantSurfaceDeps,
  spec: HumanConfirmSpec,
): Promise<ConfirmationOutcome> {
  if (!ctx.emitSurface) {
    throw new ToolInputError(
      `${spec.errorCode}_NO_CONFIRMATION_CHANNEL: ${spec.toolId}: this execution context has no interactive ` +
        "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
    );
  }
  // Shorthand `{ toolId }` on purpose: the allowlist completeness scan resolves the `toolId` of
  // each `requireHumanConfirm` CALL instead, and skips this parameterised open.
  const { toolId } = spec;
  const exchange = surfaces.surfaceExchanges.open({ toolId, principalId: ctx.principal.id }, ctx.emitSurface);
  const action = (decision: "confirm" | "cancel") => ({
    toolName: toolId,
    params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, decision },
  });
  const resource = buildConfirmationSurface({
    uri: `ui://tovu/${toolId.replaceAll("_", "-")}/${exchange.id}` as UIResourceUri,
    title: spec.title,
    ...(spec.description ? { description: spec.description } : {}),
    details: spec.details,
    ...(spec.warning ? { warning: spec.warning } : {}),
    danger: spec.danger ?? false,
    confirm: { label: spec.confirmLabel, ...action("confirm") },
    cancel: { label: "Cancel", ...action("cancel") },
    app: { appName: `tovu-${toolId.replaceAll("_", "-")}`, appVersion: "1" },
    preferredFrameSize: ["100%", "340px"],
  });

  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/**
 * The model-facing result for an answer that was not a confirm — one wording for every gated tool,
 * so the model learns one shape: `cancelled: true` means the human said no; otherwise `reason` says
 * why no answer came. Spread it next to the tool's own `<verb>ed: false` flag.
 *
 * @complexity O(1).
 */
export function notConfirmedResult(outcome: Extract<ConfirmationOutcome, { confirmed: false }>): {
  cancelled: boolean;
  reason?: "expired" | "abandoned";
  note: string;
} {
  if (outcome.reason === "declined") return { cancelled: true, note: "The user cancelled. Nothing was changed." };
  return {
    cancelled: false,
    reason: outcome.reason,
    note:
      outcome.reason === "expired"
        ? "The user did not answer the confirmation dialog before it expired. Nothing was changed."
        : "The confirmation dialog was closed because the run ended. Nothing was changed.",
  };
}

/**
 * A handler for a tool whose catalog entry carries `confirmer-must-equal-own-delegatedBy` — the
 * gated-mutation execute tools (`taxonomy_execute_merge_term`, `database_execute_migrate_forward`,
 * `backup_execute_restore`). Built on the kit's `humanConfirmedHandler`, the only handler the kit
 * wires for that rule, with {@link requireHumanConfirm} as the way the human is asked.
 *
 * `run` gets the confirmer — the delegating human, `kind: "user"` — and is where the tool calls the
 * gateway's `confirm()` as that human and then `execute()` as the agent. Nothing in `ctx.input`
 * can stand in for the click.
 *
 * @param spec.prepare - Validates input, pre-authorizes, and derives what the dialog shows.
 * @param spec.dialog - The dialog for a prepared call.
 * @param spec.flag - The result key for "did it run", e.g. `merged`; a no reads `{ [flag]: false, ... }`.
 * @complexity O(1) plus the steps and the wait for the human.
 */
export function humanConfirmedToolHandler<TPrepared>(
  surfaces: AssistantSurfaceDeps,
  spec: {
    flag: string;
    prepare: (ctx: ToolExecutionContext) => Promise<TPrepared>;
    dialog: (prepared: TPrepared) => HumanConfirmSpec;
    run: (ctx: ToolExecutionContext, prepared: TPrepared, confirmer: HumanConfirmer) => Promise<unknown>;
  },
): ToolHandler {
  return humanConfirmedHandler({
    prepare: spec.prepare,
    askHuman: async (ctx, prepared) => {
      const outcome = await requireHumanConfirm(ctx, surfaces, spec.dialog(prepared));
      return outcome.confirmed ? { confirmed: true } : { confirmed: false, result: { [spec.flag]: false, ...notConfirmedResult(outcome) } };
    },
    run: spec.run,
  });
}

/**
 * Refuses any input key outside `allowed`. For the confirm-gated tools a stray `confirm: true` or
 * `confirmationToken` is refused out loud, so the model is never left thinking it counted.
 *
 * @throws {ToolInputError} Naming the first unexpected key.
 * @complexity O(k) in the input's key count.
 */
export function refuseUnexpectedKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra !== undefined) {
    throw new ToolInputError(
      `'${extra}' is not an input of this tool. Only a click in the confirm dialog confirms it — nothing in the tool input can.`,
    );
  }
}
