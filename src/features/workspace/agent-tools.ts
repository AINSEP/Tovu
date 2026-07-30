/**
 * @file SPEC-044 — the Workspace domain's agent-tool catalog, instantiating SPEC-016 REQ-22's
 * naming/callability convention (the same shape `features/database/agent-tools.ts`,
 * `features/recovery/agent-tools.ts`, and every other domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each one carries. This is the highest-stakes domain wired so far: `deps.workspaceId`
 * is fixed at process composition (SPEC-044's Architectural Finding — a v1 install always has
 * exactly one addressable workspace row), so `create`/`delete` are deliberately excluded outright
 * rather than treated as ordinary CRUD:
 * - `CREATE_WORKSPACE` inserts a row no route can ever address afterwards (every other workspace
 *   route resolves strictly against the boot-wired `deps.workspaceId`, never a caller-supplied id)
 *   — wiring it would let an agent mint permanently orphaned, unreferenceable rows with no
 *   corresponding read/delete path back to them. Zero utility, non-zero clutter/spam surface.
 * - `DELETE_WORKSPACE` is INV-03-guarded to always refuse in v1 (there is only ever one row), but
 *   the moment that guard's precondition changes (a second addressable workspace exists), the same
 *   tool becomes a lever that can remove the only workspace scope a request can reach — whole-scope,
 *   no per-domain undo, the same blast-radius class as `database_execute_migrate_forward` and
 *   `backup_execute_restore`. Excluded by design, mirroring those two.
 * `UPDATE_WORKSPACE` is the one write kept: a narrow rename of `name`/`slug` on the single existing,
 * already-addressable workspace, no cascading effects (`id`/`createdAt` immutable by convention —
 * see `update.ts`), the same risk class as `identity_role_rename`.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `features/workspace` domain logic. No dependencies.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export type AgentToolActorClassRule = "confirmer-must-equal-own-delegatedBy" | "user-only" | "none";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  actorClassRule?: AgentToolActorClassRule;
  /**
   * JSON Schema for this tool's `input`, published to the model via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Optional,
   * matching `features/database/agent-tools.ts`'s convention — the two entries this dispatch
   * leaves unwired (see file header) carry no schema at all, since one is never published for a
   * tool the model never sees.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/** No arguments — `workspace_get` takes none; it always reports the caller's own boot-wired workspace. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

/** `workspace_update`'s input — mirrors `update.ts`'s `UpdateWorkspaceInput` minus `id` (the tool
 * always targets the caller's own boot-wired workspace, exactly like the admin route's `:workspaceId`
 * path param, which is checked against `deps.workspaceId` and never trusted otherwise). At least one
 * of `name`/`slug` must be present — enforced by `updateWorkspace` itself (`WorkspaceValidationError`
 * on an empty update), not expressible in this codebase's plain-JSON-Schema-subset convention (no
 * domain catalog uses `anyOf`/`oneOf` today). */
const UPDATE_WORKSPACE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    name: { type: "string", description: "New workspace name. Omit to leave unchanged. At least one of name/slug is required." },
    slug: {
      type: "string",
      description: "New workspace slug (lowercase letters, numbers, dashes only). Omit to leave unchanged. At least one of name/slug is required.",
    },
  },
} as const;

/**
 * The Workspace domain's fixed agent-tool catalog (SPEC-044).
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getWorkspaceAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "workspace_get",
      description: "Reports the caller's own workspace: id, name, slug, and creation time. v1 always has exactly one addressable workspace.",
      sideEffects: "none",
      authorization: { permission: "workspace.manage" },
      inputSchema: NO_INPUT_SCHEMA,
    },
    {
      name: "workspace_update",
      description:
        "Renames the caller's own workspace: updates name and/or slug. At least one field is required. Does not change the workspace's id or creation time, and has no cascading effects on other domains.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "workspace.manage" },
      inputSchema: UPDATE_WORKSPACE_SCHEMA,
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. Inserts a row no other route can
      // ever address (every workspace route resolves strictly against the boot-wired
      // `deps.workspaceId`), so wiring this would only let an agent mint permanently orphaned rows.
      name: "workspace_create",
      description: "Creates a new workspace row. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "workspace.manage" },
    },
    {
      // EXCLUDED BY DESIGN, never wired: see this file's header. INV-03-guarded to always refuse
      // today (v1 has exactly one workspace row), but the lever itself removes the only addressable
      // workspace scope the moment that guard's precondition ever changes — whole-scope,
      // irreversible, no per-domain undo. Same exclusion class as `database_execute_migrate_forward`
      // and `backup_execute_restore`.
      name: "workspace_delete",
      description: "Deletes a workspace row. NEVER agent-callable — see file header.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: "workspace.manage" },
    },
  ];
}
