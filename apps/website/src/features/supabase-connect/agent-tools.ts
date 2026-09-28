/**
 * @file Agent-tool catalog for `features/supabase-connect` (SPEC-052): the two in-chat forms the
 * `supabase` agent plugin's SKILL.md sends the assistant to. Wired in the sibling
 * `tool-registrations.ts`.
 *
 * Neither tool accepts ANY input. The token and the project choice only ever arrive through the
 * rendered form's own submission, never through a model-issued call, so there is no argument a
 * model could put a secret into.
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
      "FALLBACK ONLY: connects Supabase with a personal access token when the OAuth sign-in link cannot start (external_mcp_oauth_connect { id: 'supabase' } was refused). Takes no arguments. " +
      "First send the human https://supabase.com/dashboard/account/tokens to create a token, then call this: it shows a masked form, the human pastes the token there, Tovu checks it with Supabase, and seals it. " +
      "The token never reaches you, this result, or the chat. Never ask for or accept a token in chat. This ONE call waits until the human submits or cancels. " +
      "Returns { saved: true, next } on success; { saved: false, reason: 'invalid', message } when Supabase rejected the token (nothing stored); " +
      "{ saved: false, reason: 'unavailable' } when Supabase could not be reached; { saved: false, reason: 'cancelled' | 'expired' | 'abandoned' } when nobody submitted. " +
      "Refused when the 'supabase' plugin is not enabled yet. After saving, call supabase_set_project_scope.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: SUPABASE_CONNECT_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "supabase_set_project_scope",
    description:
      "Picks the ONE Supabase project the assistant may reach, after Supabase is connected (OAuth connected, or a token saved with supabase_set_access_token). Takes no arguments. " +
      "Lists the projects the connection can see and shows the human a form to pick exactly one, with read-only ON by default. No Supabase tool is offered until this is done. " +
      "Turning read-only off grants nothing by itself: every write tool still needs the operator's separate write grant. This ONE call waits until the human submits or cancels. " +
      "Returns { scoped: true, projectRef, readOnly, next } on success; { scoped: false, reason: 'project-not-in-account' | 'no-project-selected' | 'no-projects', message }; " +
      "or { scoped: false, reason: 'cancelled' | 'expired' | 'abandoned' }. Refused with a plain reconnect message when the connection is not connected, was revoked, or Supabase is unavailable.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: SUPABASE_CONNECT_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
];
