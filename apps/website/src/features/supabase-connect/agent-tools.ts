/**
 * @file Agent-tool catalog for `features/supabase-connect` (SPEC-052): the in-chat access-token
 * form, the fallback when Supabase sign-in cannot start. Wired in the sibling `tool-registrations.ts`.
 *
 * The tool accepts NO input. The token only ever arrives through the rendered form's own
 * submission, never through a model-issued call, so there is no argument a model could put a secret
 * into.
 *
 * 2026-09-27: `supabase_get_database` and `supabase_set_project_scope` were deleted. Connecting is
 * the generic `agent_plugin_connect { pluginId: "supabase" }`; this last tool leaves core when the
 * token form moves into the generic Connect card (plan v2 slice S-G10, then R2).
 */

/** Mirrors the `AgentToolSideEffect` union every domain declares its own copy of. */
export type AgentToolSideEffect = "none" | "mutates-durable-state";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** The same site-owner-level permission every External MCP tool is gated on
 *  (`features/external-mcp/agent-tools.ts`). Restated rather than imported so this feature takes no
 *  dependency on a sibling feature. */
export const SUPABASE_CONNECT_PERMISSION = "admin.integrations.manage";

const NO_INPUT_SCHEMA = { type: "object", additionalProperties: false, required: [], properties: {} } as const;

export const supabaseConnectAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "supabase_set_access_token",
    description:
      "FALLBACK ONLY: connects Supabase with a personal access token when agent_plugin_connect { pluginId: 'supabase' } could not start sign-in. Never call this first. Takes no arguments. " +
      "First send the human https://supabase.com/dashboard/account/tokens to create a token, then call this: it shows a masked form, the human pastes the token there, Tovu checks it with Supabase, and seals it. " +
      "The token never reaches you, this result, or the chat. Never ask for or accept a token in chat. This ONE call waits until the human submits or cancels. " +
      "Returns { saved: true, next } on success; { saved: false, reason: 'invalid', message } when Supabase rejected the token (nothing stored); " +
      "{ saved: false, reason: 'unavailable' } when Supabase could not be reached; { saved: false, reason: 'cancelled' | 'expired' | 'abandoned' } when nobody submitted. " +
      "Refused when the 'supabase' plugin is not enabled yet.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: SUPABASE_CONNECT_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
];
