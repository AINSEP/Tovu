import { buildFormSurface, buildOutcomeSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_DISMISSED_PARAM, SURFACE_EXCHANGE_ID_PARAM } from "../../contracts/core/tool-surface-exchanges.js";
import type { SupabaseProject } from "./supabase-management-api.js";

/**
 * @file The two MCP-UI forms SPEC-052 adds (ui.spec.md §2.2/§2.3) and the outcome document that
 * replaces each one in place once its submission has actually been processed.
 *
 * Both are rendered by the existing generic `buildFormSurface`, and both tool ids are on
 * `MCP_UI_REDEEMABLE_TOOL_IDS` — without that every submission is refused with 403. Same shape as
 * `custom-credentials/custom-credential-set-token-ui.ts`: the URI carries only the exchange id, and
 * the outcome reuses the form's URI so it replaces the form rather than opening a second card.
 */

export const SUPABASE_SET_ACCESS_TOKEN_TOOL_ID = "supabase_set_access_token";
export const SUPABASE_SET_PROJECT_SCOPE_TOOL_ID = "supabase_set_project_scope";
export const SUPABASE_TOKENS_PAGE_URL = "https://supabase.com/dashboard/account/tokens";

export type SupabaseSurfaceKind = "access-token" | "project-scope";

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
 * The project picker. No project is pre-selected, so the human must choose one; read-only starts ON
 * (REQ-06) and is set here, on the server, not left to the client.
 *
 * @complexity O(n) in the project count.
 */
export function buildProjectScopeFormResource(spec: { exchangeId: string; projects: readonly SupabaseProject[] }): UIResource {
  const { exchangeId, projects } = spec;
  return buildFormSurface({
    uri: supabaseSurfaceUri("project-scope", exchangeId),
    title: "Pick your Supabase project",
    description: "The assistant will only be able to reach the one project you pick.",
    submitLabel: "Connect",
    toolName: SUPABASE_SET_PROJECT_SCOPE_TOOL_ID,
    baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId },
    fields: [
      {
        kind: "enum",
        name: "projectRef",
        label: "Supabase project",
        required: true,
        placeholder: "Pick a project",
        options: projects.map((project) => ({ value: project.ref, label: `${project.name} (${project.ref})` })),
      },
      {
        kind: "boolean",
        name: "readOnly",
        label: "Read-only",
        hint: "Recommended. Supabase refuses every change while this is on. Turning it off does not allow any change by itself: an admin still has to allow each write tool.",
        value: true,
      },
    ],
    cancel: cancelFor(SUPABASE_SET_PROJECT_SCOPE_TOOL_ID, exchangeId),
    app: { appName: "tovu-supabase-project-scope", appVersion: "1" },
    preferredFrameSize: ["100%", "380px"],
  });
}

/**
 * The result that replaces either form. `message` is caller-controlled and must never carry a token —
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
