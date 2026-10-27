/**
 * @file How an executable Agent Plugin tool call is confirmed in Tovu, on the EXISTING approval
 * owner (`contracts/headless/assistant-tool-approval-policy.ts` families + `applyToolApprovalPolicy`).
 * No second confirmation engine: this file only maps the plugin's declared effect to a reviewed
 * family and computes the card's extra rows.
 *
 * Before a write or destructive call is shown, the disclosure step freezes what the human approves:
 * the approval owner has already detached the input (request + target); this step reads the
 * account each of the call's connections is signed in as and binds them all to the call, so
 * execution refuses if a connection was switched to another account meanwhile, or if the call asks
 * for a connection its approval did not show. Activation and authorization are rechecked by the
 * plugin tool contract right before the handler runs.
 */
import type { SurfaceDetail } from '@jini-ai/ui/mcp-ui/surfaces';
import type { ToolExecutionContext } from '@jini-ai/core';
import type { AgentPluginToolDisclosure, AgentPluginToolEffect } from '@jini-ai/agent-plugins/lifecycle/tools';
import type { AgentPluginConnectionAccess, FrozenConnectionAccounts } from './host-capabilities.js';

/** The approval family each declared effect maps to (see the families' own comment). */
export const APPROVAL_FAMILY_BY_EFFECT = {
  read: 'agent-plugin-read', write: 'agent-plugin-write', destructive: 'agent-plugin-destructive',
} as const satisfies Readonly<Record<AgentPluginToolEffect, string>>;

export const TOOL_WITHDRAWN_MESSAGE = 'This plugin tool is no longer available (the plugin was disabled or reloaded). Nothing was changed.';
export const NOT_CONNECTED_MESSAGE = 'The connection this tool uses is not connected. Reconnect the account in the plugin settings and retry. Nothing was changed.';

/** The projection's disclosure entry point (`createAgentPluginToolProjection().describeAffectedResources`). */
export interface AgentPluginDisclosureSource {
  describeAffectedResources(required: { readonly toolId: string; readonly input: unknown }, optional?: Record<string, never>): Promise<AgentPluginToolDisclosure | null>;
}

type JsonObject = Readonly<Record<string, unknown>>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const SCHEMA_BRANCHES = ['anyOf', 'oneOf', 'allOf'] as const;

/**
 * Collects each string `connectionRef` where the tool's schema declares one, at any depth (`connectionRef`
 * is the convention every plugin tool schema uses). The schema, not the key alone, decides: a
 * `connectionRef` key inside free-form data the schema does not declare is the user's data, not a connection.
 * @complexity O(input size × schema branches).
 */
function collectDeclaredRefs(schema: unknown, value: unknown, found: Set<string>): void {
  if (!isObject(schema)) return;
  for (const branch of branchesOf(schema)) collectDeclaredRefs(branch, value, found);
  if (Array.isArray(value)) {
    for (const item of value) collectDeclaredRefs(schema.items, item, found);
    return;
  }
  if (isObject(value)) collectPropertyRefs(schema, value, found);
}

/** The `anyOf` / `oneOf` / `allOf` subschemas a value may also match. @complexity O(branches). */
function branchesOf(schema: JsonObject): readonly unknown[] {
  return SCHEMA_BRANCHES.flatMap(key => { const branches = schema[key]; return Array.isArray(branches) ? branches : []; });
}

/** One object level of {@link collectDeclaredRefs}: undeclared keys follow `additionalProperties`. @complexity O(keys). */
function collectPropertyRefs(schema: JsonObject, value: JsonObject, found: Set<string>): void {
  const properties = isObject(schema.properties) ? schema.properties : {};
  for (const [key, child] of Object.entries(value)) {
    if (!Object.hasOwn(properties, key)) collectDeclaredRefs(schema.additionalProperties, child, found);
    else if (key === 'connectionRef' && typeof child === 'string') found.add(child);
    else collectDeclaredRefs(properties[key], child, found);
  }
}

/** Without a schema: every string `connectionRef` key at any depth, so no ref is left unbound. @complexity O(input size). */
function collectScannedRefs(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectScannedRefs(item, found);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'connectionRef' && typeof child === 'string') found.add(child);
    else collectScannedRefs(child, found);
  }
}

/** Every connection the call names, in input order, deduplicated. @complexity O(input size × schema branches). */
function connectionRefsOf(input: unknown, inputSchema: unknown): readonly string[] {
  const found = new Set<string>();
  // The top-level ref stays bound even when a loose schema leaves it undeclared, as it always was.
  if (isObject(input) && typeof input.connectionRef === 'string') found.add(input.connectionRef);
  if (isObject(inputSchema)) collectDeclaredRefs(inputSchema, input, found);
  else collectScannedRefs(input, found);
  return [...found];
}

/**
 * Builds the card rows for one confirming call and freezes its account.
 * @param required.source - The projection (validates input, asks the plugin what would change).
 * @param required.connections - Host connection accessor, scoped to the calling plugin and workspace.
 * @param required.frozen - Where the frozen accounts are bound for the capability port to enforce.
 * @returns `disclose({ ctx, toolId, pluginId, workspaceId }, { inputSchema })` → one Account row per connection
 *   the call names + one row per affected resource. `inputSchema` is the tool's declared schema; without it
 *   every `connectionRef` key in the input counts. A call naming no connection binds nothing and still runs.
 * @throws Error when the tool was withdrawn or a connection is not connected; ToolInputError for bad input.
 * @complexity O(c + r) rows plus one disclosure hook call and one account read per connection.
 */
export function createAgentPluginDisclosure(
  required: { readonly source: AgentPluginDisclosureSource; readonly connections: AgentPluginConnectionAccess; readonly frozen: FrozenConnectionAccounts },
  _optional: Record<string, never> = {},
) {
  return async (
    { ctx, toolId, pluginId, workspaceId }: { readonly ctx: ToolExecutionContext; readonly toolId: string; readonly pluginId: string; readonly workspaceId: string },
    { inputSchema }: { readonly inputSchema?: unknown } = {},
  ): Promise<readonly SurfaceDetail[]> => {
    const disclosure = await required.source.describeAffectedResources({ toolId, input: ctx.input });
    if (!disclosure) throw new Error(TOOL_WITHDRAWN_MESSAGE);
    const rows: SurfaceDetail[] = [];
    const accounts = new Map<string, string>();
    for (const connectionRef of connectionRefsOf(ctx.input, inputSchema)) {
      const account = await required.connections.readAccount({ workspaceId, pluginId, connectionRef });
      if (!account) throw new Error(NOT_CONNECTED_MESSAGE);
      accounts.set(connectionRef, account.accountId);
      rows.push({ label: 'Account', value: account.displayName });
    }
    // Nothing named, nothing bound: binding an empty map would refuse a write tool that uses no connection.
    if (accounts.size > 0) required.frozen.bind({ signal: ctx.signal, accounts });
    for (const resource of disclosure.resources) rows.push({ label: 'Affects', value: resource });
    return rows;
  };
}
