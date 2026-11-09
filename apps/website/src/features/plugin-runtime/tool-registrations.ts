/** Historical host rationale retained from the original wiring; portable behavior is now in host-tools/. */
// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
/**
 * @file Plugins' half of ADR-049 Decision 4 (SPEC-005/ADR-005-ARCH): maps `agent-tools.ts`'s two
 * catalog entries onto the two operations `routes/admin/plugins/` exposes, as `ToolRegistration`s.
 * The entire catalog is wired.
 *
 * Authorization shape: `admin.plugins.read` is checked by the list handler itself via the kit's
 * `requireToolPermission` (`discoverPlugins` is a pure read with no gate to inherit);
 * `admin.plugins.enable` is enforced by the SAME `executeCommand` composition
 * `routes/admin/plugins/set-enabled.ts` itself uses — plugin activation has no domain-layer
 * chokepoint of its own to defer to, so this handler IS that route's composition (see
 * `setPluginEnabled`'s file header). One evaluator either way, per ADR-021 §2.
 *
 * ---------------------------------------------------------------------------
 * `plugins_list` also reports installed Agent Plugins (2026-08-23 fix)
 * ---------------------------------------------------------------------------
 * `plugins_list` used to claim it lists "every discovered plugin" while only ever calling
 * `routeDeps.discoverPlugins()` — the site/runtime plugin family (`.tovu-plugin` built-ins plus
 * site-installed). It never mentioned Agent Plugins (Jini's separate `packages/agent-plugins/`
 * family, installed under a digest-keyed dir and enumerated by `listInstalledPlugins()` in
 * `features/agent-plugins/resolve-agent-plugin-refs.js`), so an operator asking "what plugins do I
 * have installed" got a confidently incomplete answer with no signal that anything was missing.
 *
 * The merge happens HERE, in the `plugins_list` handler, not inside `discoverPlugins()` — deliberately.
 * `discoverPlugins()` has a second caller below, `plugins_set_enabled`, which needs an activation
 * record and a trust/validation lifecycle (`pluginActivationRepo`, discovery `status`/`tier`) that
 * Agent Plugins have none of. Folding Agent Plugins into `discoverPlugins()` would make
 * `plugins_set_enabled` offer to enable/disable something with no activation concept to flip — a real
 * bug, not a refactor. `discoverPlugins()` and `plugins_set_enabled` are untouched by this fix.
 *
 * Response shape: `{ plugins: [...unchanged...], agentPlugins: [...] }` — two arrays, never flattened
 * into one, so a caller cannot mistake one family's row shape for the other's (site rows carry
 * `enabled`/`trustTier`/`validationStatus`; Agent Plugin rows carry none of that — see
 * `AgentPluginListRow` below, which reports only what `InstalledAgentPlugin` genuinely has).
 *
 * Permission: reuses `admin.plugins.read` for both halves rather than adding a second gate. Both are
 * "list what is installed" reads with no mutation and no distinct sensitivity from each other — the
 * same operator who may see site plugin ids/versions/status has no lesser standing to see Agent
 * Plugin ids/skill names. A separate `admin.agent-plugins.read` permission would be defensible too,
 * but would be new-permission-for-its-own-sake with no threat model this handler's callers describe.
 *
 * Workspace scoping: Agent Plugins are resolved for `routeDeps.workspaceId` — the SAME workspace this
 * handler already scopes `pluginActivationRepo.getActivation` to — via
 * `routeDeps.agentPluginLayout.forWorkspace(routeDeps.workspaceId)`, matching every other caller of
 * `listInstalledPlugins` (`resolve-agent-plugin-refs.ts`, `features/agent-plugins/
 * tool-registrations.ts`). Anything else would leak one workspace's installed Agent Plugins into
 * another's `plugins_list` response, which `layout.ts`'s own tenant-isolation header treats as the
 * primary threat this whole subtree defends against.
 *
 * Failure isolation: `listAgentPluginsForResponse()` below wraps the whole Agent Plugin read in a
 * `try/catch` — a failure there (a misconfigured `TOVU_AGENT_PLUGINS_DIR`, or anything else) degrades
 * to an empty `agentPlugins` array rather than failing the tool call outright, so a problem in the
 * newer, less-exercised half of this tool can never take down the site-plugin half that already
 * worked. `listInstalledPlugins` itself already returns `[]` on `ENOENT` (no packages dir yet — the
 * common "nothing installed" case) and silently skips any single digest that fails to index; the
 * `try/catch` here only guards the remaining outer failure surface (layout resolution itself).
 *
 * No absolute host path (`InstalledAgentPlugin.packageRoot`, or a skill's `skillPath` resolved
 * against it) is ever put on the response — `toAgentPluginListRow()` below reads only `pluginId`,
 * `version`, `archiveDigest`, skill NAMES, and public export contracts, the same "no `handle`-shaped value ever serializes"
 * rule `features/agent-plugins/tool-registrations.ts`'s own header states for its tools.
 */
// Keep the domain projection local: importing it from server/admin would invert the composition boundary.
// `plugins_uninstall` — mirrors `routes/admin/plugins/uninstall.ts`'s own composition exactly (same
// business-rule module, same deps shape). See `agent-tools.ts`'s header for why this is NOT wrapped
// in `executeCommand`, matching that route's own deliberate choice. `uninstallPlugin`'s own thrown
// errors (`PluginNotFoundError`/`PluginNotUninstallableError`/`PluginEnabledError`) are propagated
// undecorated. The one
// exception is `PluginChangedSincePreviewError`, which `uninstallConfirmedPlugin` turns into a
// not-removed result: it is not a refusal of the caller's input but a change while the confirmation
// dialog was open (t91 F2.2).
// The Agent Plugins half of `plugins_list` (see this file's header) — a deliberate, disclosed
// cross-domain read. `resolve-agent-plugin-refs.ts`/`layout.ts` only, never
// `features/agent-plugins/tool-registrations.ts` (a separate workstream's file; not touched here).
// The Agent Plugin half of `plugins_set_enabled` (2026-09-09). `set-enabled.ts` is that feature's own
// business rule — a DOMAIN module, deliberately not `agent-plugins/tool-registrations.ts` — so this
// adds no `plugin-runtime -> agent-plugins/tool-registrations` edge. See its header, and the
// "one tool, two families" section below.
// t91 F1.1/R2 (2026-09-16). `Jini/packages/plugins/src/host/activation.ts` is the domain module that already defines these errors;
// importing it here adds no `plugin-runtime -> agent-plugins/tool-registrations` edge (same
// reasoning as the `set-enabled.js` import above).
// The Agent Plugins MCP-provisioning half of `plugins_set_enabled` (2026-09-15). The route's own
// enable path calls these same two primitives; see `applyAgentPluginDecision` below for why the
// in-chat enable must not skip them.
// The Agent Plugin branch of `plugins_uninstall` (S4, 2026-09-24) — the deleted standalone
// `agent_plugins_uninstall` tool's own logic, moved rather than duplicated. `uninstall-tool.ts` is
// this domain's entry point into that logic, deliberately not `agent-plugins/tool-registrations.ts`
// (a separate workstream's file; not touched here, same reasoning as the `set-enabled.js` import
// above). See that file's header for the merge.


/**
 * ===========================================================================================
 * `plugins_set_enabled` — one tool, two plugin families
 * ===========================================================================================
 * Tovu has two unrelated plugin systems that share the word "plugin":
 *
 * - `.tovu-plugin` SITE/RUNTIME plugins — this feature. Discovered by `discoverPlugins()`, activated
 *   as a database row through `Jini/packages/plugins/src/host/activation.ts`'s `setPluginEnabled`, enable-hook may run ADR-023 DDL.
 * - AGENT PLUGINS — `features/agent-plugins/`. agent-plugins.org packages on disk, activated as a
 *   JSON record through `agent-plugins/set-enabled.ts`, whose `SKILL.md` is injected into a run's
 *   prompt and whose `agent_plugin_<id>` tool only exists while it is active.
 *
 * Before 2026-09-09 the assistant could toggle the first and had NO tool at all for the second, so
 * "find the Higgsfield plugin and use it" dead-ended in chat at the point of turning it on. The fix
 * is one tool with an explicit `family` argument rather than a second, near-identically-named enable
 * tool — a model choosing between `plugins_set_enabled` and `agent_plugins_set_enabled` is precisely
 * the confusion the catalog exists to prevent, and the operator asking to "turn on the Higgsfield
 * plugin" does not know which system that word means either.
 *
 * `family` is REQUIRED and never inferred from the id. The two namespaces are independent, so an id
 * present in both is possible, and guessing has already produced real work in the wrong directory.
 *
 * WHAT IS NOT FOLDED IN, and why it is a rule rather than a preference: install and uninstall stay
 * separate tools. `DERIVED_RISK_BY_TOOL_ID` is keyed PER TOOL ID, so one tool gets exactly one risk
 * band. Enabling is reversible and touches a flag; installing runs third-party code; uninstalling
 * deletes bytes. Merging them would force one band onto three very different blast radii, and the
 * wiring gate that reads that map fails CLOSED.
 */

/** One parsed `plugins_set_enabled` call. */

import { pluginManagementToolIds } from './plugin-tool-ids.js';
import type { Tracker } from '@jini-ai/diagnostics/observability';
import type { PluginExportCatalogPort } from '../../contracts/headless/plugin-export-catalog.js';
import type { OperatorLocaleDeps, PluginHostPort, AgentPluginLayout, AgentPluginUninstallToolDeps, SetAgentPluginEnabledInput } from '../../contracts/headless/index.js';
import type { Clock } from '@jini-ai/core/primitives';
import type { OutboxPort } from '@jini-ai/cms/core';
import type { AuthorizeFn, ChangeSetRepoPort } from '../../contracts/core/commands/index.js';
import type { RememberedApprovalPort, ToolContributor, ToolRegistration } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import type { PluginActivationRepoPort, PluginConflict, RemovePluginFn } from '@jini-ai/plugins/host';
import type { PluginDiscoveryRecord, PluginInstallerPort } from '@jini-ai/plugins/host/node';
import type { InstalledAgentPlugin, SetAgentPluginEnabledResult } from '@jini-ai/agent-plugins/lifecycle';
import type { PluginProviderFacesPort } from './service-ports.js';
import { buildPluginManagementRegistrations, pluginManagementDerivedRiskFor, pluginApprovalIdentity as portableApprovalIdentity } from './host-tools/management.js';
import { bindPluginManagementTools } from './host-tool-binding.js';
import type { PluginFamily } from './agent-tools.js';
export { describeEnableApproval, type EnableConfirmationSubject } from './enable-confirmation-ui.js';


/**
 * The exact slice of the route-deps bag Plugins' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root for the `RouteDeps` god type specifically — the `toAdminPluginResponse` import
 * above is a separate, already-disclosed back-edge (`server/http/admin/plugins`) left untouched per
 * the dispatch's explicit out-of-scope list. `server/routes/*` satisfies this structurally by
 * passing its existing `RouteDeps` object; nothing there changes.
 */
export interface PluginsToolDeps extends OperatorLocaleDeps {
  readonly tracker?: Tracker;
  readonly pluginExports?: PluginExportCatalogPort;
  readonly providerFaces: PluginProviderFacesPort;
  readonly notifyRosterChanged: import("../../contracts/core/tool-access-change.js").NotifyToolAccessChanged;
  readonly pluginSource?: import('@jini-ai/plugins/host/node').PluginSourcePort;
  readonly pluginSourcePolicy?: import('@jini-ai/plugins/host').PluginSourcePolicyPort;
  readonly pluginHost?: PluginHostPort;
  readonly agentPluginLayout: AgentPluginLayout;
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  /** Uses the existing activation owner; injection lets callers model lock failures without module replacement. */
  assertAgentPluginActivationsWritable?: (required: { workspaceRoot: string }) => Promise<void>;
  /** Bind the same lifecycle owner with host effects; no module replacement is needed for failures. */
  setAgentPluginEnabled?: (required: SetAgentPluginEnabledInput) => Promise<SetAgentPluginEnabledResult>;
  listInstalledAgentPlugins?: (workspaceRoot: string) => Promise<readonly InstalledAgentPlugin[]>;
  /** Bound to the existing remembered-approval store; only enable escalations get reusable keys. */
  nativeApprovalMemory?: RememberedApprovalPort;
  uninstallAgentPlugin?: AgentPluginUninstallToolDeps["uninstallAgentPlugin"];
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** 2026-10-04 — see `routes/types.ts`'s `PluginRuntimeDeps.listPluginConflicts`. */
  listPluginConflicts?: () => Promise<ReadonlyMap<string, readonly PluginConflict[]>>;
  removePlugin: RemovePluginFn;
  /** The admin Install Plugin routes' installer; absent when the site has no plugin install dir.
   *  Read by `install-tool.ts`'s `plugins_install`, not by this file's tools. */
  pluginInstaller?: PluginInstallerPort;
}
export const pluginsDerivedRisk = pluginManagementDerivedRiskFor({ toolIds: pluginManagementToolIds });
export function buildPluginsRegistrations(routeDeps: PluginsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  return buildPluginManagementRegistrations(bindPluginManagementTools({ deps: routeDeps, surfaces }));
}
export function pluginApprovalIdentity(required: { deps: PluginsToolDeps; request: { family: PluginFamily; pluginId: string } }, _optional = {}) {
  return portableApprovalIdentity({ deps: bindPluginManagementTools({ deps: required.deps }), request: required.request });
}


/**
 * Contributes Plugins' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildPluginsRegistrations`/
 * `pluginsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2).
 * Unlike `database` (tried and reverted earlier in this batch), this domain's own imports are all
 * `core/commands` plus its own sibling files (`admin-response.ts`, `Jini/packages/plugins/src/host/activation.ts`, `agent-tools.ts`,
 * `Jini/packages/plugins/src/host/node/discovery.ts`) — it does not reach `features/database`/`db` at all, so it does not carry that
 * domain's round-trip risk. Every importer outside `server/*` is none — nothing else imports this
 * domain by name.
 */
export function contributePluginsTools(
  required: { createPluginHost?: (required: { deps: PluginsToolDeps }) => PluginHostPort } = {},
  _optional: Record<string, never> = {},
): ToolContributor<PluginsToolDeps, AssistantSurfaceDeps> {
  return { domain: "plugins", build: (deps, surfaces) => buildPluginsRegistrations({
    ...deps, pluginHost: deps.pluginHost ?? required.createPluginHost?.({ deps }),
  }, surfaces), risk: pluginsDerivedRisk };
}
