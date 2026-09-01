import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The confirmation dialog `tool-registrations.ts` raises before running a DELETE through a
 * saved custom credential (2026-08-31, owner decision: "the only thing we maybe should be worried
 * about is deletion, but we can gate that with MCP-UI"). Structurally mirrors
 * `features/post/delete-confirmation-ui.ts` — see that file's own header for the mechanism this one
 * reuses rather than reinventing (a held-open `SurfaceExchangeStore` exchange, `askOnce`, a
 * confirm/cancel tool action carrying `SURFACE_EXCHANGE_ID_PARAM` back to the SAME tool call).
 *
 * Differs from that file only in WHAT the dialog shows and WHERE it is keyed: there is no existing
 * row/version to re-version against here (a DELETE-through-credential is a live outbound call, not an
 * edit to a Tovu-owned entity) — so the `ui://` URI is keyed by the exchange id alone, the same
 * reasoning `features/deployments/publish-agent-tools.ts`'s own `publishConfirmationUri` gives for the
 * identical "nothing to re-version" shape.
 */

export const MAKE_CREDENTIALED_REQUEST_TOOL_ID = "custom_credential_make_request";

export function deleteRequestConfirmationUri(exchangeId: string): UIResourceUri {
  return `ui://tovu/custom-credential-make-request-delete/${exchangeId}` as UIResourceUri;
}

/**
 * Renders the dialog naming exactly what is about to be sent — label, resolved host, method, and
 * path — per the owner's own requirement ("showing the operator the label, the resolved host, the
 * method and the full path so they can see exactly what is about to be destroyed").
 *
 * @complexity O(1) — a handful of fixed-size field reads.
 */
export function buildDeleteRequestConfirmationResource(spec: { label: string; host: string; path: string; exchangeId: string }): UIResource {
  const { label, host, path, exchangeId } = spec;

  return buildConfirmationSurface({
    uri: deleteRequestConfirmationUri(exchangeId),
    title: `Send a DELETE through '${label}'?`,
    description: "This calls the third-party API's own DELETE endpoint using this saved credential — Tovu has no way to undo whatever the provider does with it.",
    details: [
      { label: "Credential", value: label },
      { label: "Host", value: host },
      { label: "Method", value: "DELETE" },
      { label: "Path", value: path },
    ],
    warning: "This is irreversible if the provider actually deletes something. Double-check the path above before confirming.",
    danger: true,
    confirm: {
      label: "Send DELETE",
      toolName: MAKE_CREDENTIALED_REQUEST_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    cancel: {
      label: "Cancel",
      toolName: MAKE_CREDENTIALED_REQUEST_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-custom-credential-make-request-delete", appVersion: "1" },
    preferredFrameSize: ["100%", "360px"],
  });
}
