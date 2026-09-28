/**
 * @file G3: the per-call Confirm/Cancel card for every external (federated) tool that is not marked
 * read-only — the one approval rule for external MCP servers, agent plugins and integrations
 * (`mcp-federation/trust.ts` R3, owner rule 2026-09-27). No per-plugin config: the rule reads only
 * the remote's own hints, and those can only ever ADD this card, never remove it.
 *
 * Built on `requireHumanConfirm` (`contracts/core/human-confirm.ts`) — the same held-open MCP-UI
 * exchange every confirmed native tool uses — so a click reaches the parked call through
 * `mcp-ui-tool-calls-route.ts`. Federated ids are dynamic, so they are not on
 * `MCP_UI_REDEEMABLE_TOOL_IDS`; `isMcpUiToolCallPermitted` lets an `mcp__` id ANSWER an open card and
 * never be executed by that route.
 *
 * The card shows the service, the tool and every argument in plain words: a string argument (the SQL
 * of `execute_sql`, say) exactly as it will be sent, anything else as JSON. The arguments it is given
 * are the frozen object the handler sends on Confirm (`registrations.ts`'s `frozenArguments`), so what
 * the human approves is what runs.
 *
 * Architectural role: `assistant` composition helper, implementing `FederationDeps.confirmCall`.
 */
import type { SurfaceDetail } from "@jini-ai/ui/mcp-ui/surfaces";

import { notConfirmedResult, requireHumanConfirm, type HumanConfirmSpec } from "../contracts/core/human-confirm.js";
import type { AssistantSurfaceDeps } from "../contracts/core/tool-surface-exchanges.js";

import type { FederatedCallConfirmationRequest } from "./mcp-federation/ports.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/** One argument as a card row: strings verbatim (so SQL reads as SQL), everything else as JSON. */
function argumentDetail(name: string, value: unknown): SurfaceDetail {
  return { label: name, value: typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value)) };
}

/**
 * The card for one call. Pure, so its words are testable without a transport.
 *
 * @complexity O(a) in the argument count.
 */
export function buildFederatedCallConfirmSpec(request: FederatedCallConfirmationRequest): HumanConfirmSpec {
  const label = request.connectionLabel;
  const argumentRows = Object.entries(request.arguments).map(([name, value]) => argumentDetail(name, value));
  return {
    toolId: request.toolId,
    errorCode: "EXTERNAL_MCP",
    title: `Run ${request.remoteName} on ${label}?`,
    description: "The assistant wants to run this with exactly the values below. Nothing runs until you confirm.",
    details: [
      { label: "Service", value: label },
      { label: "Tool", value: request.remoteName },
      ...(argumentRows.length > 0 ? argumentRows : [{ label: "Arguments", value: "(none)" }]),
    ],
    warning: request.destructive
      ? `${label} marks this tool as destructive: it can delete or overwrite data, and that may not be undoable.`
      : `This can change things in ${label}.`,
    danger: request.destructive,
    confirmLabel: "Confirm",
  };
}

/**
 * Builds `FederationDeps.confirmCall` over the given exchange store. That store MUST be the one the
 * click route is mounted with (see `AssistantSurfaceDeps`).
 *
 * @complexity O(1) plus the wait for the human.
 */
export function createFederatedCallConfirmer(surfaces: AssistantSurfaceDeps): NonNullable<FederationDeps["confirmCall"]> {
  return async (ctx, request) => {
    const spec = buildFederatedCallConfirmSpec(request);
    const outcome = await requireHumanConfirm(ctx, surfaces, spec);
    return outcome.confirmed ? { confirmed: true } : { confirmed: false, result: notConfirmedResult(outcome) };
  };
}
