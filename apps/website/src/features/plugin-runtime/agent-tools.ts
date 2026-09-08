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
 * - There is no install/upload tool. `features/plugin-runtime` has no admin ROUTE for either
 *   operation at all — `discoverPlugins()` reads whatever is already present on disk (install dir +
 *   built-ins), and nothing in this codebase's admin HTTP surface adds a plugin's files. A tool
 *   cannot be written against an operation the domain has no route for.
 *   CORRECTED 2026-09-07 (`ADS-memory/reports/2026-09-07-assistant-tool-coverage-audit.md`): this
 *   bullet used to also claim "There is no ... uninstall tool. features/plugin-runtime has no admin
 *   ROUTE for [it] at all" — that was true when originally written, and became false on 2026-08-20
 *   (Milestone 2) when `DELETE /api/admin/v1/workspaces/:workspaceId/plugins/:pluginId`
 *   (`routes/admin/plugins/uninstall.ts`, calling `uninstallPlugin()`) shipped, without this comment
 *   being updated for it — a confidently wrong claim the audit confirmed is exactly what stopped
 *   `plugins_uninstall` from being built. `plugins_uninstall` (below) closes that gap; install/upload
 *   remain genuinely absent at every layer, unlike uninstall.
 * - `plugins_uninstall` mirrors the route it wires (`uninstall.ts`) exactly: same
 *   `admin.plugins.enable` permission (no new grant introduced), same two hard preconditions
 *   (`uninstallPlugin()`'s own — the plugin must be a site-installed, non-built-in record, and must
 *   be disabled in every workspace first), same files-first-then-activation-rows ordering. NOT
 *   wrapped in a confirmation dialog the way `content_post_delete`/`deployment_execute_static_publish`
 *   are: this route itself is deliberately NOT wrapped in the change-set/revert gateway either
 *   (`uninstall.ts`'s own header — "there is no meaningful 'restore the prior state' for deleted
 *   bytes"), so there is no existing human-confirmation transport this tool could reuse without
 *   inventing one, and this pass does not invent one. The description below states the irreversibility
 *   in plain language instead, the same mitigation `plugins_set_enabled`'s own description already
 *   uses for its own DDL risk — whether that is sufficient, or this needs the stronger
 *   actor-class/confirmation gating `backup_execute_restore`/`database_execute_migrate_forward` get,
 *   is flagged as open in the audit and not decided here.
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

const UNINSTALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pluginId"],
  properties: {
    pluginId: { type: "string", minLength: 1, description: "The plugin id, as returned by plugins_list. Must be a site-installed plugin — a built-in has no on-disk artifact to remove and this is refused." },
  },
} as const;

/**
 * The Plugins domain's fixed agent-tool catalog — the three operations `routes/admin/plugins/`
 * exposes (list, set-enabled, uninstall — see this file's header for install/upload's absence).
 *
 * Ordered read-tool-first, matching the house convention (`identity/agent-tools.ts`'s own
 * rationale): a model cannot enable/disable/uninstall a plugin it does not know the id of, and
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
  {
    name: "plugins_uninstall",
    description:
      "PERMANENTLY removes a site-installed plugin: deletes its on-disk artifact, then its activation row in every workspace. This is NOT reversible — there is no revision history or trash to restore it from, unlike theme_trash_file's soft-delete; reinstalling means the operator re-uploading the plugin's files themselves. Refused if the plugin is a built-in (nothing to remove), or if it is currently enabled in ANY workspace (the on-disk artifact is shared across every workspace this instance serves, so uninstalling while another workspace still has it enabled would silently break that workspace) — call plugins_set_enabled with enabled:false everywhere it is on first. Confirm with the human before calling this; it does not raise its own confirmation dialog.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.plugins.enable" },
    inputSchema: UNINSTALL_SCHEMA,
  },
];
