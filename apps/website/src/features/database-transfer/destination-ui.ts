import { buildFormSurface, buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The private form `database_transfer_set_destination` raises: one masked field for the
 * destination database's address. The human's keystrokes go browser -> `mcp-ui-tool-calls-route.ts`
 * -> the parked tool call, never through the model (same mechanism as
 * `custom-credentials/custom-credential-set-token-ui.ts`). The outcome replaces the form under the
 * same `ui://` URI and names only the host and database, never the address itself.
 */

export const SET_DESTINATION_TOOL_ID = "database_transfer_set_destination";
export const DESTINATION_ADDRESS_FIELD = "address";

export function destinationSurfaceUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/database-transfer-destination/${exchangeId}` as UIResourceUri;
}

/** @complexity O(1). */
export function buildDestinationForm(exchangeId: string): UIResource {
  return buildFormSurface({
    uri: destinationSurfaceUri(exchangeId),
    title: "Where should the copy of your site's data go?",
    description:
      "Paste the address of a Postgres database (it starts with postgres://). It stays on this server: the assistant never sees it, " +
      "and it is not written to the chat.",
    submitLabel: "Save",
    toolName: SET_DESTINATION_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    fields: [
      {
        kind: "string",
        name: DESTINATION_ADDRESS_FIELD,
        label: "Database address",
        hint: "Your database provider shows it as the connection string or URI.",
        required: true,
        secret: true,
      },
    ],
    cancel: { label: "Cancel", toolName: SET_DESTINATION_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },
    app: { appName: "tovu-database-transfer-destination", appVersion: "1" },
    preferredFrameSize: ["100%", "340px"],
  });
}

/** `message` must never carry the address; every caller passes a fixed or redacted sentence. */
export function buildDestinationOutcome(spec: { exchangeId: string; state: "success" | "failure"; message: string }): UIResource {
  return buildOutcomeSurface({
    uri: destinationSurfaceUri(spec.exchangeId),
    title: spec.state === "success" ? "Destination saved" : "Destination not saved",
    state: spec.state,
    message: spec.message,
    app: { appName: "tovu-database-transfer-destination-outcome", appVersion: "1" },
    preferredFrameSize: ["100%", "200px"],
  });
}
