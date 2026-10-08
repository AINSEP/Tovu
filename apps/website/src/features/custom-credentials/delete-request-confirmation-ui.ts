import type { HumanConfirmSpec } from "../../contracts/core/human-confirm.js";


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

/**
 * Describes the dialog naming exactly what is about to be sent — label, resolved host, method, and
 * path — per the owner's own requirement ("showing the operator the label, the resolved host, the
 * method and the full path so they can see exactly what is about to be destroyed").
 *
 * The shared transport owns the exchange deadline (`SurfaceExchange.expiresAtMs()`), so the chat
 * counts the card down and closes it when the parked call stops waiting.
 *
 * @complexity O(1) — a handful of fixed-size field reads.
 */
export function describeDeleteRequestApproval({ label, host, path }: { label: string; host: string; path: string }, _optional = {}): HumanConfirmSpec {
  return {
    toolId: MAKE_CREDENTIALED_REQUEST_TOOL_ID, errorCode: "CUSTOM_CREDENTIALS",
    title: `Send a DELETE through '${label}'?`,
    description: "This calls the third-party API's own DELETE endpoint using this saved credential — Tovu has no way to undo whatever the provider does with it.",
    details: [{ label: "Credential", value: label }, { label: "Host", value: host }, { label: "Method", value: "DELETE" }, { label: "Path", value: path }],
    warning: "This is irreversible if the provider actually deletes something. Double-check the path above before confirming.",
    danger: true, confirmLabel: "Send DELETE",
  };
}
