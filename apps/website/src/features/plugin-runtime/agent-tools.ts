/**
 * @file SPEC-005 (ADR-005-ARCH) — the Plugins domain's agent-tool catalog, instantiating SPEC-016
 * REQ-22's naming/callability convention (the same shape `forms/agent-tools.ts`,
 * `identity/agent-tools.ts`, `features/content-types/agent-tools.ts`, `features/database/
 * agent-tools.ts`, and `features/recovery/agent-tools.ts` already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes and the
 * permission each one carries. Every entry maps 1:1 onto a real, already-shipped admin surface:
 * `content_read.plugin` mirrors `routes/admin/plugins/list.ts` (`PLUGINS_LIST`) and `plugins_set_enabled`
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
 *   bytes"). The description below states the irreversibility in plain language instead.
 *   CORRECTED 2026-09-09: this bullet used to justify that with "there is no existing
 *   human-confirmation transport this tool could reuse without inventing one" — already false when
 *   written (ADR-055 Decision 2's held-open exchange had been serving `content_post_delete` since
 *   2026-08-04), and now visibly so: `plugins_set_enabled` below reuses exactly that transport for
 *   its own enable path (`set-enabled-confirmation-ui.ts`). Whether `plugins_uninstall` should too is
 *   a live question this file no longer answers with a false premise; it was simply not part of the
 *   pass that gated enabling.
 *   RESOLVED 2026-09-16: `plugins_uninstall` now DOES raise a confirmation dialog and parks on the
 *   human's answer, reusing the exact SAME held-open exchange `plugins_set_enabled`'s enable path
 *   already reuses (`uninstall-confirmation-ui.ts`, ADR-055 Decision 2) — closing the "whether
 *   plugins_uninstall should too" question the paragraph above left open. Two sentences above are now
 *   stale as a result: "NOT wrapped in a confirmation dialog ... are" and "The description below
 *   states the irreversibility in plain language instead" — the description below states BOTH the
 *   irreversibility and the confirmation requirement now. Only the change-set/revert-gateway claim in
 *   that same passage is still accurate: deleting bytes still has no meaningful inverse to capture,
 *   so `executeCommand` is still not used here. Confirmation and revertability are orthogonal
 *   concerns; only the first one changed.
 * - `plugins_set_enabled` is ONE tool covering BOTH plugin families (2026-09-09) — the `.tovu-plugin`
 *   site/runtime family this module belongs to, AND `features/agent-plugins/`'s separate Agent Plugin
 *   family, selected by a REQUIRED `family` argument. Two tools would have been the smaller diff and
 *   the worse answer: the operator asking "turn on the Higgsfield plugin" does not know which of
 *   Tovu's two plugin systems that word means, and a model choosing between two near-identically
 *   named enable tools is the exact confusion this catalog exists to prevent. What is deliberately
 *   NOT folded in is install/uninstall: `DERIVED_RISK_BY_TOOL_ID` is keyed per tool id, so merging a
 *   reversible flag flip with an operation that runs third-party code or deletes bytes would force
 *   one risk band onto three very different blast radii.
 * - Enabling, in either family, raises a real human confirmation and PARKS on the answer
 *   (`set-enabled-confirmation-ui.ts`, ADR-055 Decision 2's held-open exchange). Disabling does not.
 *   See that file's header for why the asymmetry is the point rather than an omission.
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
 * enforcement is the SAME gate the human admin routes use: `content_read.plugin`'s inline `authorize()`
 * call and `plugins_set_enabled`'s `executeCommand`-wrapped permission check (ADR-021 §2) — this
 * module declares shape only and performs no I/O.
 *
 * Architectural role:
 * `features/plugin-runtime` domain declaration. Imports nothing from elsewhere in this package —
 * every entry's input shape is primitive (a string id, a string family, a boolean flag), so there is
 * no shared type to import without inventing a dependency this file does not otherwise need. In
 * particular the `family` enum is restated here rather than imported from
 * `set-enabled-confirmation-ui.ts`'s `PluginFamily`: this module is the CONTRACT the model reads, and
 * a contract that could silently follow a UI module's rename is not a contract. The two are pinned
 * together by test instead (`tool-registrations.plugins-set-enabled-families.test.ts`).
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

/** No arguments — `content_read.plugin` takes none. */
const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

const SET_ENABLED_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["family", "pluginId", "enabled"],
  properties: {
    family: {
      type: "string",
      enum: ["site-runtime", "agent-plugin"],
      description:
        "Which plugin SYSTEM the id belongs to. Required, and never guessed — Tovu has two unrelated systems that share the word 'plugin'. " +
        "Use 'agent-plugin' for an Agent Plugin (an agent-plugins.org package with a plugin.json, skills and an optional mcp.json — " +
        "anything search_agent_plugin_local returned, e.g. higgsfield-media). Use 'site-runtime' for a .tovu-plugin site/runtime plugin — " +
        "anything content_read.plugin returned. If you did not get the id from one of those two tools, call the matching one first rather " +
        "than picking a family.",
    },
    pluginId: {
      type: "string",
      minLength: 1,
      description:
        "The plugin id. For family 'site-runtime', as returned by content_read.plugin. For family 'agent-plugin', the plugin.json 'name' as " +
        "returned by search_agent_plugin_local. An id that is not installed/discovered in THIS workspace is refused, and nothing is written.",
    },
    enabled: {
      type: "boolean",
      description:
        "true to enable, false to disable. ENABLING ALWAYS ASKS THE HUMAN FIRST — this tool opens a confirmation dialog and waits for the " +
        "answer, because turning a plugin on changes what you yourself can do next; do not promise the user it is on until this call returns " +
        "with changed:true. Disabling is not confirmed (it only removes capability). For family 'site-runtime', enabling a plugin whose " +
        "manifest declares a data module runs schema DDL against the live database (ADR-023's snapshot-protected, transactional core-mediated " +
        "engine) and is refused unless the plugin's discovery status is 'valid'; disabling has no such precondition. For family 'agent-plugin', " +
        "enabling reports restartRequired:true — the activation is durable and takes effect immediately for prompt injection, but the plugin's " +
        "own agent_plugin_<id> tool is registered only when the agent daemon starts, so relay that restart note to the user instead of " +
        "claiming the plugin's tool is available now.",
    },
  },
} as const;

const UNINSTALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pluginId"],
  properties: {
    pluginId: { type: "string", minLength: 1, description: "The plugin id, as returned by content_read.plugin. Must be a site-installed plugin — a built-in has no on-disk artifact to remove and this is refused." },
  },
} as const;

/**
 * The Plugins domain's fixed agent-tool catalog — the three operations `routes/admin/plugins/`
 * exposes (list, set-enabled, uninstall — see this file's header for install/upload's absence).
 *
 * Ordered read-tool-first, matching the house convention (`identity/agent-tools.ts`'s own
 * rationale): a model cannot enable/disable/uninstall a plugin it does not know the id of, and
 * `content_read.plugin` is the only way to learn one.
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
      "Turns a plugin ON or OFF. This is the ONE tool for enabling and disabling plugins, and it covers BOTH of Tovu's plugin systems — " +
      "say which with the required 'family' argument: 'agent-plugin' for an Agent Plugin found by search_agent_plugin_local (e.g. the " +
      "higgsfield-media image/video plugin), 'site-runtime' for a .tovu-plugin site plugin listed by content_read.plugin. Use this when the " +
      "user asks to enable, disable, turn on, turn off, activate or deactivate a plugin, or when a plugin you need is installed but not " +
      "active. ENABLING OPENS A CONFIRMATION DIALOG AND WAITS for the human to approve it — enabling changes what you yourself can do next, " +
      "so it is not yours to grant; disabling is not confirmed. Refuses to enable a site-runtime plugin whose discovery status is 'invalid' " +
      "or 'incompatible'; enabling one with a data module runs live schema DDL (ADR-023) — reversible in the sense that disabling flips the " +
      "activation flag back, but not a pure no-op toggle. Installing and uninstalling are SEPARATE tools, deliberately: this one only flips " +
      "an already-installed plugin's switch and never adds or deletes anything.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.plugins.enable" },
    inputSchema: SET_ENABLED_SCHEMA,
  },
  {
    name: "plugins_uninstall",
    description:
      "PERMANENTLY removes a site-installed plugin: deletes its on-disk artifact, then its activation row in every workspace. This is NOT reversible — there is no revision history or trash to restore it from, unlike theme_trash_file's soft-delete; reinstalling means the operator re-uploading the plugin's files themselves. Refused if the plugin is a built-in (nothing to remove), or if it is currently enabled in ANY workspace (the on-disk artifact is shared across every workspace this instance serves, so uninstalling while another workspace still has it enabled would silently break that workspace) — call plugins_set_enabled with enabled:false everywhere it is on first. ALWAYS ASKS THE HUMAN FIRST: this tool opens a confirmation dialog and waits for their answer; nothing is removed unless they confirm, and a cancel or no answer comes back as a result, not an error.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "admin.plugins.enable" },
    inputSchema: UNINSTALL_SCHEMA,
  },
];
