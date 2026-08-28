/**
 * @file SPEC-005 (ADR-005-ARCH) — the Plugins domain's agent-tool catalog, instantiating SPEC-016
 * REQ-22's naming/callability convention (the same shape `forms/agent-tools.ts`,
 * `identity/agent-tools.ts`, `features/content-types/agent-tools.ts`, `features/database/
 * agent-tools.ts`, and `features/recovery/agent-tools.ts` already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each one carries. Every entry maps 1:1 onto a real, already-shipped admin surface:
 * `plugins_list` mirrors `routes/admin/plugins/list.ts` (`PLUGINS_LIST`) and `plugins_set_enabled`
 * mirrors `routes/admin/plugins/set-enabled.ts` (`PLUGIN_SET_ENABLED`) exactly — same permissions,
 * same underlying `features/plugin-runtime/activation.ts` functions.
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - There is no install/uninstall/upload tool. `features/plugin-runtime` has no admin ROUTE for
 *   either operation at all — `discoverPlugins()` reads whatever is already present on disk
 *   (install dir + built-ins), and nothing in this codebase's admin HTTP surface adds or removes a
 *   plugin's files. A tool cannot be written against an operation the domain has no route for.
 * - `plugins_set_enabled` is included, but is NOT the low-risk "flip a flag" operation its own name
 *   suggests: enabling a plugin whose manifest declares a `dataModule` invokes ADR-023's
 *   core-mediated DDL engine (`features/plugins/data-module.ts`) against the LIVE database —
 *   snapshot-protected and single-transaction, but genuinely schema-affecting, not a pure metadata
 *   toggle. The tool's own description says so; see this file's header and
 *   `features/plugins/data-module.ts`'s own header for the full "never-brick" doctrine this rides
 *   on. Still included per this dispatch's brief (comparatively low-risk and REVERSIBLE — disabling
 *   undoes the activation-state flip; a plugin's own DDL is additive/idempotent per ADR-023 §2,
 *   never a drop on disable) — unlike `database_execute_migrate_forward`/`backup_execute_restore`,
 *   which this dispatch's sibling catalogs exclude outright.
 *
 * How it relates to the project:
 * `assistant/tool-registrations.ts` maps these entries into `@jini-ai/core` `ToolRegistration`s; the
 * ADR-014 tool filter consumes the catalog to decide which names a session may see. Actual
 * enforcement is the SAME gate the human admin routes use: `plugins_list`'s inline `authorize()`
 * call and `plugins_set_enabled`'s `executeCommand`-wrapped permission check (ADR-021 §2) — this
 * module declares shape only and performs no I/O.
 *
 * Architectural role:
 * `features/plugin-runtime` domain declaration. Imports nothing from elsewhere in this package —
 * both tools' input shapes are primitive (a string id, a boolean flag), so there is no shared type
 * to import without inventing a dependency this file does not otherwise need.
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
   * (`assistant/tool-registrations.ts`, which refuses to wire any tool lacking one). Required, not
   * optional — both entries in this catalog are wired, so there is no unwired entry whose input
   * shape is undesigned (mirrors `identity/agent-tools.ts`'s reasoning for the same choice).
   */
  inputSchema: Readonly<Record<string, unknown>>;
}

/** No arguments — `plugins_list` takes none. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

const SET_ENABLED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pluginId", "enabled"],
  properties: {
    pluginId: { type: "string", minLength: 1, description: "The plugin id, as returned by plugins_list." },
    enabled: {
      type: "boolean",
      description:
        "true to enable, false to disable. Enabling a plugin whose manifest declares a data module runs schema DDL against the live database (ADR-023's snapshot-protected, transactional core-mediated engine) — this is not a pure metadata toggle. Refused if the plugin is not currently valid (status must be 'valid' to enable; disabling has no such precondition).",
    },
  },
} as const;

/**
 * The Plugins domain's fixed agent-tool catalog — exactly the two operations
 * `routes/admin/plugins/` exposes.
 *
 * Ordered read-tool-first, matching the house convention (`identity/agent-tools.ts`'s own
 * rationale): a model cannot enable/disable a plugin it does not know the id of, and
 * `plugins_list` is the only way to learn one.
 */
export const pluginAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "plugins_list",
    description:
      "Lists every discovered plugin (built-in and site-installed) with its id, name, version, source, trust tier, validation status, current enabled state, and any validation errors. Read-only.",
    sideEffects: "none",
    authorization: { permission: "admin.plugins.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "plugins_set_enabled",
    description:
      "Enables or disables a discovered plugin. Refuses to enable a plugin whose current discovery status is 'invalid' or 'incompatible'. Enabling a plugin with a data module runs live schema DDL (ADR-023) — reversible in the sense that disabling flips the activation flag back, but not a pure no-op toggle.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.plugins.enable" },
    inputSchema: SET_ENABLED_SCHEMA,
  },
];
