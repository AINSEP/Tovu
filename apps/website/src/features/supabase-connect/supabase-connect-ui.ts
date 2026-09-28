import { buildFormSurface, buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";

/**
 * @file The MCP-UI access-token form SPEC-052 adds (ui.spec.md §2.2) and the outcome document that
 * replaces it in place once its submission has actually been processed. (The project picker, §2.3,
 * was deleted on 2026-09-27: the `supabase` plugin works account-wide.)
 *
 * Rendered by the existing generic `buildFormSurface`, and the tool id is on
 * `MCP_UI_REDEEMABLE_TOOL_IDS` — without that every submission is refused with 403. Same shape as
 * `custom-credentials/custom-credential-set-token-ui.ts`: the URI carries only the exchange id, and
 * the outcome reuses the form's URI so it replaces the form rather than opening a second card.
 */

export const SUPABASE_SET_ACCESS_TOKEN_TOOL_ID = "supabase_set_access_token";
export const SUPABASE_TOKENS_PAGE_URL = "https://supabase.com/dashboard/account/tokens";

export type SupabaseSurfaceKind = "access-token";

export function supabaseSurfaceUri(kind: SupabaseSurfaceKind, exchangeId: string): UIResourceUri {
  return `ui://tovu/supabase-${kind}/${exchangeId}` as UIResourceUri;
}

function cancelFor(toolName: string, exchangeId: string) {
  return { label: "Cancel", toolName, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } };
}

/**
 * The fallback masked token form. Its one field is the only place the token exists outside the
 * sealed ciphertext it becomes: it is posted straight to the tool-calls route, never through chat.
 * Never pre-filled — every render starts empty.
 *
 * @complexity O(1).
 */
export function buildAccessTokenFormResource(spec: { exchangeId: string }): UIResource {
  const { exchangeId } = spec;
  return buildFormSurface({
    uri: supabaseSurfaceUri("access-token", exchangeId),
    title: "Connect Supabase with an access token",
    description:
      `Create a personal access token at ${SUPABASE_TOKENS_PAGE_URL}, then paste it below. Tovu checks it with ` +
      "Supabase and seals it the moment you submit. The assistant never sees it, and it is never written to the chat.",
    submitLabel: "Save token",
    toolName: SUPABASE_SET_ACCESS_TOKEN_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    fields: [
      {
        kind: "string",
        name: "token",
        label: "Supabase access token",
        hint: "Pasted here only. Never shown to the assistant.",
        required: true,
        secret: true,
      },
    ],
    cancel: cancelFor(SUPABASE_SET_ACCESS_TOKEN_TOOL_ID, exchangeId),
    app: { appName: "tovu-supabase-access-token", appVersion: "1" },
    preferredFrameSize: ["100%", "380px"],
  });
}

/**
 * The result that replaces the form. `message` is caller-controlled and must never carry a token —
 * every call site passes a fixed sentence.
 *
 * @complexity O(1).
 */
export function buildSupabaseOutcomeResource(spec: {
  kind: SupabaseSurfaceKind;
  exchangeId: string;
  state: "success" | "failure";
  title: string;
  message: string;
}): UIResource {
  return buildOutcomeSurface({
    uri: supabaseSurfaceUri(spec.kind, spec.exchangeId),
    title: spec.title,
    details: [{ label: "Connection", value: "Supabase" }],
    state: spec.state,
    message: spec.message,
    app: { appName: `tovu-supabase-${spec.kind}-outcome`, appVersion: "1" },
    preferredFrameSize: ["100%", "240px"],
  });
}
