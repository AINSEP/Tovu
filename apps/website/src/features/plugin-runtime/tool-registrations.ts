import type { Tracker } from "@jini-ai/diagnostics/observability";
import type { PluginExportRuntime, PluginExportCatalogRow } from "../agent-plugins/exports/runtime.js";
import { AGENT_PLUGIN_CONTRACT_VERSION, AgentPluginHostIncompatibleError, AgentPluginUpdateError, checkAgentPluginCompatibility } from "@jini-ai/agent-plugins/lifecycle";
import { toolMetadata } from '../../contracts/core/tool-metadata/plugin-runtime.js';

// activation.ts was deleted; Jini owns the lifecycle, this host binding owns its effects.
import type { AgentPluginHostCapability, PluginHostPort, AgentPluginLayout, OperatorLocaleDeps, AgentPluginUninstallToolDeps, SetAgentPluginEnabledInput } from "../../contracts/headless/plugin-host.js";
import { type Clock, nowIso } from "@jini-ai/core/primitives";
import { adaptLegacyAuthorize } from "@jini-ai/cms/core";
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
import { AGENT_TOOL_PRINCIPAL_KIND, buildDomainRegistrations, indexCatalogById, requireInputRecord, requireNoInput, requireString, type AgentToolSideEffect, type DerivedRiskByToolId, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { requireToolPermission, type OutboxPort } from "@jini-ai/cms/core";
import { ToolInputError, type RememberedApprovalPort } from "@jini-ai/core";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../contracts/core/commands/index.js";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { approvalToolHandler, notConfirmedResult } from "../../contracts/core/human-confirm.js";
import { federatedToolApprovalFingerprint } from "@jini-ai/mcp/federation";
import type { ExternalMcpStoreDeps, ToolContributor } from "#src/assistant/index";
// Keep the domain projection local: importing it from server/admin would invert the composition boundary.
import { toAdminPluginResponse } from "./admin-response.js";
import { addedPluginCapabilities, pluginCapabilitySet, setPluginEnabled, type PluginActivationRecord, type PluginActivationRepoPort } from "@jini-ai/plugins/host";
import { pluginAgentToolCatalog } from "./agent-tools.js";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";
import { PluginConflictError, type PluginConflict } from "@jini-ai/plugins/host";
import { withModelFacingErrors, type ModelFacingErrorRule } from "@jini-ai/core/model-facing-tool-errors";
// `plugins_uninstall` — mirrors `routes/admin/plugins/uninstall.ts`'s own composition exactly (same
// business-rule module, same deps shape). See `agent-tools.ts`'s header for why this is NOT wrapped
// in `executeCommand`, matching that route's own deliberate choice. `uninstallPlugin`'s own thrown
// errors (`PluginNotFoundError`/`PluginNotUninstallableError`/`PluginEnabledError`) are propagated
// undecorated, same as every other error this domain's `plugins_set_enabled` handler already lets
// through unreclassified — this file has never used the `ToolInputError`/`withSchemaOnRejection`
// convention other domains use, and this addition does not introduce it unilaterally. The one
// exception is `PluginChangedSincePreviewError`, which `uninstallConfirmedPlugin` turns into a
// not-removed result: it is not a refusal of the caller's input but a change while the confirmation
// dialog was open (t91 F2.2).
import { PluginChangedSincePreviewError, previewUninstallPlugin, uninstallPlugin, type PluginUninstallPreview, type RemovePluginFn, type UninstallPluginRequired } from "@jini-ai/plugins/host";
// The Agent Plugins half of `plugins_list` (see this file's header) — a deliberate, disclosed
// cross-domain read. `resolve-agent-plugin-refs.ts`/`layout.ts` only, never
// `features/agent-plugins/tool-registrations.ts` (a separate workstream's file; not touched here).
import type { InstalledAgentPlugin } from "@jini-ai/agent-plugins/lifecycle";
// The Agent Plugin half of `plugins_set_enabled` (2026-09-09). `set-enabled.ts` is that feature's own
// business rule — a DOMAIN module, deliberately not `agent-plugins/tool-registrations.ts` — so this
// adds no `plugin-runtime -> agent-plugins/tool-registrations` edge. See its header, and the
// "one tool, two families" section below.
import { AgentPluginNotInstalledError, type SetAgentPluginEnabledResult } from "@jini-ai/agent-plugins/lifecycle";
import { AgentPluginLinkedError, bindProviderFacePorts, linkedProviderOf } from "../agent-plugins/provider-plugin-link.js";
// t91 F1.1/R2 (2026-09-16). `Jini/packages/plugins/src/host/activation.ts` is the domain module that already defines these errors;
// importing it here adds no `plugin-runtime -> agent-plugins/tool-registrations` edge (same
// reasoning as the `set-enabled.js` import above).
import { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError } from "@jini-ai/agent-plugins/lifecycle";
// The Agent Plugins MCP-provisioning half of `plugins_set_enabled` (2026-09-15). The route's own
// enable path calls these same two primitives; see `applyAgentPluginDecision` below for why the
// in-chat enable must not skip them.
import { describeEnableApproval, PLUGINS_SET_ENABLED_TOOL_ID, type PluginFamily } from "./set-enabled-confirmation-ui.js";
import { describeUninstallApproval, PLUGINS_UNINSTALL_TOOL_ID } from "./uninstall-confirmation-ui.js";
// The Agent Plugin branch of `plugins_uninstall` (S4, 2026-09-24) — the deleted standalone
// `agent_plugins_uninstall` tool's own logic, moved rather than duplicated. `uninstall-tool.ts` is
// this domain's entry point into that logic, deliberately not `agent-plugins/tool-registrations.ts`
// (a separate workstream's file; not touched here, same reasoning as the `set-enabled.js` import
// above). See that file's header for the merge.
import type { PluginInstallerPort } from "@jini-ai/plugins/host/node";

/** The historical cross-family rationale above still applies; the composition root now binds
 * those owners behind a host capability. A missing binding is an explicit refusal. */
function requireAgentPluginHost(deps: PluginsToolDeps): AgentPluginHostCapability {
  const capability = deps.pluginHost?.getHostCapability({ capability: "agent-plugin-lifecycle" });
  if (!capability) throw new ToolInputError({ message: "The host does not provide agent-plugin lifecycle operations." });
  return capability;
}
async function listInstalledAgentPlugins(deps: PluginsToolDeps): Promise<readonly InstalledAgentPlugin[]> {
  if (deps.listInstalledAgentPlugins) return deps.listInstalledAgentPlugins(deps.agentPluginLayout.forWorkspace(deps.workspaceId).root);
  return requireAgentPluginHost(deps).listInstalled({}, {});
}

const CATALOG_BY_ID = indexCatalogById({ catalog: pluginAgentToolCatalog });

/** One `plugins_list` response row for an installed Agent Plugin — see this file's header,
 *  "`plugins_list` also reports installed Agent Plugins", for why only these public fields and export contracts (never
 *  `packageRoot` or a skill's `skillPath`) ever leave this module. */
interface AgentPluginListRow {
  readonly pluginId: string;
  readonly version: string | null;
  readonly archiveDigest: string;
  readonly skills: readonly string[];
  readonly exports: readonly PluginExportCatalogRow[];
}

function toAgentPluginListRow(required: { plugin: InstalledAgentPlugin; exports: readonly PluginExportCatalogRow[] }, _options = {}): AgentPluginListRow {
  const p = required.plugin;
  return { pluginId: p.pluginId, version: p.version ?? null, archiveDigest: p.archiveDigest, skills: p.skills.map((s) => s.name), exports: required.exports };
}

/** Reads every installed Agent Plugin for `plugins_list`'s Agent Plugin half. Degrades to `[]` on
 *  any failure (see this file's header, "Failure isolation") rather than failing the whole tool
 *  call over the newer, less-exercised half of this tool. */
async function listAgentPluginsForResponse(routeDeps: PluginsToolDeps): Promise<readonly AgentPluginListRow[]> {
  try {
    const installed = await listInstalledAgentPlugins(routeDeps);
    const exports = await routeDeps.pluginExports?.catalog({ workspaceId: routeDeps.workspaceId }).catch(() => new Map());
    return installed.map(plugin => toAgentPluginListRow({ plugin, exports: exports?.get(plugin.pluginId) ?? [] }));
  } catch {
    return [];
  }
}

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
  readonly pluginExports?: PluginExportRuntime;
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
  /** The external-MCP store slice `provisionAgentPluginMcpServers` writes into. Enabling an Agent
   *  Plugin from chat must provision its auto-admitted MCP servers exactly as the admin toggle does
   *  (`server/inbound/admin-http/routes/agent-plugins/set-enabled.ts`); these are the same fields
   *  that route's `AgentPluginsRouteDeps` threads. The `clock` above is already the fourth
   *  `ExternalMcpStoreDeps` field, so it is not repeated here. */
  externalMcpServerRepo: ExternalMcpStoreDeps["repo"];
  siteAssistantSecretSealer: ExternalMcpStoreDeps["sealer"];
  siteAssistantSecretKeyring: ExternalMcpStoreDeps["keyring"];
}

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const pluginsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> discoverPlugins() + pluginActivationRepo.getActivation() per record: reads only.
  ["plugins_list", "none"],
  // -> executeCommand(...) -> setPluginEnabled (activation.ts): pluginActivationRepo.save() plus
  //    (on enable) the injected onEnabled hook, which can run ADR-023 schema DDL against the live
  //    database. Genuinely mutating, not a metadata-only flip.
  ["plugins_set_enabled", "mutates-durable-state"],
  // -> uninstallPlugin (uninstall.ts) for family 'site-runtime': the package directory moves to the
  //    60-day Trash, durable and reversible only through the human Admin Trash surface. ->
  //    runAgentPluginUninstall (agent-plugins/uninstall-tool.ts) for family 'agent-plugin': the
  //    package is deleted from disk with no Trash and no undo. One tool id, one risk band (S4,
  //    2026-09-24) — `deletes-durable-state`, the worse of the two families' blast radii, since this
  //    map is keyed per tool id, not per family.
  ["plugins_uninstall", "deletes-durable-state"],
]);

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
interface SetEnabledRequest {
  readonly family: PluginFamily;
  readonly pluginId: string;
  readonly enabled: boolean;
}

/** Reads `family` as an explicit choice between the two real systems.
 *
 *  A `ToolInputError`, not a bare `Error`: this genuinely IS "the caller's input was the problem, and
 *  a different input fixes it", and a bare `Error` out of a tool handler is redacted into an opaque
 *  failure by the daemon — so the one message that could tell the model which family to name would
 *  never reach it. @complexity O(1). */
function readFamily(input: Record<string, unknown>): PluginFamily {
  const raw = input["family"];
  if (raw === "site-runtime" || raw === "agent-plugin") return raw;
  throw new ToolInputError({ message: "'family' is required and must be exactly one of: 'site-runtime' (a .tovu-plugin site plugin, as listed by " +
      "content_read.plugin) or 'agent-plugin' (an Agent Plugin, as returned by search_agent_plugin_local). Tovu has two " +
      "unrelated plugin systems and this tool never guesses between them — if you are unsure, call the matching list/search " +
      "tool first and use the family whose results contained this id." });
}

/** @complexity O(1). */
function readSetEnabledRequest(rawInput: unknown): SetEnabledRequest {
  const input = requireInputRecord({ input: rawInput });
  const family = readFamily(input);
  const pluginId = requireString({ input: input, key: "pluginId" });
  if (typeof input["enabled"] !== "boolean") {
    throw new ToolInputError({ message: "'enabled' (boolean) is required — true to turn the plugin on, false to turn it off" });
  }
  return { family, pluginId, enabled: input["enabled"] };
}

/** What one plugin's enable approval is bound to; `discovery` is the site-runtime snapshot it was read from. */
interface PluginApprovalIdentity {
  readonly key: string;
  readonly version?: string;
  readonly label: string;
  readonly discovery?: readonly PluginDiscoveryRecord[];
}

/** Identity/version binding before and after consent. The existing MCP fingerprint owner
 * hashes the version/digest metadata; no second hashing or approval store is introduced.
 * Disabling removes capability, so it needs no identity grant and never raises a dialog.
 * @complexity One family discovery scan, bounded by the installed package count. */
export async function pluginApprovalIdentity(
  { deps: routeDeps, request }: { deps: PluginsToolDeps; request: Pick<SetEnabledRequest, "family" | "pluginId"> }, _optional = {},
): Promise<PluginApprovalIdentity> {
  let revision: string;
  let version: string | undefined;
  let label: string | undefined;
  let discovery: readonly PluginDiscoveryRecord[] | undefined;
  let schema: Readonly<Record<string, unknown>> = {};
  if (request.family === "agent-plugin") {
    const plugins = await listInstalledAgentPlugins(routeDeps);
    const installed = plugins.filter(plugin => plugin.pluginId === request.pluginId);
    if (installed.length === 0) throw new ToolInputError({ message: `Agent Plugin '${request.pluginId}' is not installed` });
    // Every installed digest participates, independent of discovery ordering.
    revision = JSON.stringify(installed.map(plugin => [plugin.version ?? null, plugin.archiveDigest]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    version = installed.map(plugin => plugin.version).filter((value): value is string => value !== undefined).sort().join(", ");
  } else {
    discovery = structuredClone(await routeDeps.discoverPlugins());
    const plugin = discovery.find(plugin => plugin.id === request.pluginId);
    if (!plugin) throw new ToolInputError({ message: `plugin '${request.pluginId}' was not found in the current discovery snapshot` });
    revision = plugin.version;
    schema = { ...plugin.manifest };
    version = plugin.version; label = plugin.name;
  }
  const fingerprint = federatedToolApprovalFingerprint({ fingerprintDomain: "tovu.native-escalation.v1",
    identity: { connectionId: JSON.stringify([routeDeps.workspaceId, request.family, request.pluginId]),
      remoteName: PLUGINS_SET_ENABLED_TOOL_ID, origin: { kind: "roster", admissionRevision: revision },
      declaredAnnotations: undefined, description: "Enable this plugin identity", inputSchema: schema },
  });
  return { key: fingerprint, version, label: label ?? request.pluginId, discovery };
}

/** A fresh `uninstallPlugin` request. Discovery is re-read on every call, so the post-confirmation write never resolves
 *  its target from the snapshot taken before a human was asked. @complexity one discovery scan. */
async function uninstallRequestFor(
  routeDeps: PluginsToolDeps,
  pluginId: string,
  principalId: string,
): Promise<UninstallPluginRequired> {
  const discovery = await routeDeps.discoverPlugins();
  return {
    deps: { repo: routeDeps.pluginActivationRepo, discovery, remove: routeDeps.removePlugin },
    input: {
      pluginId,
      workspaceId: routeDeps.workspaceId,
      at: nowIso({ clock: routeDeps.clock }),
      actor: { principalId, pluginId: "assistant" },
    },
  };
}

/**
 * The post-confirmation half of `plugins_uninstall` (t91 F2.2): re-discovers, then uninstalls only if the plugin is
 * still the name and version the dialog showed. A change is a not-removed RESULT (ADR-055 Decision 6), the same union
 * member `expired`/`abandoned` use; every other refusal still propagates undecorated, per this file's convention.
 * @complexity one discovery scan plus `uninstallPlugin`.
 */
async function uninstallConfirmedPlugin(
  routeDeps: PluginsToolDeps,
  preview: PluginUninstallPreview,
  principalId: string,
): Promise<unknown> {
  const { pluginId } = preview;
  try {
    const result = await uninstallPlugin(await uninstallRequestFor(routeDeps, pluginId, principalId), { confirmedPreview: preview });
    return { pluginId, trashed: result.trashed };
  } catch (error) {
    if (!(error instanceof PluginChangedSincePreviewError)) throw error;
    return {
      pluginId,
      uninstalled: false,
      cancelled: false,
      reason: "changed-since-confirmation",
      note:
        `'${pluginId}' changed after the user was asked: the confirmation showed ${preview.name} version ${preview.version}, and that ` +
        "is no longer what is installed. Nothing was removed. Call plugins_uninstall again so the user can review and confirm what is installed now.",
    };
  }
}

/**
 * What a caller must still do after a successful toggle, per family and direction.
 *
 * This exists because "enabled: true" alone was actively misleading. The activation record is
 * durable and re-read per run, so the GATE moves immediately — but a plugin's own tool
 * (`agent_plugin_<id>` for Agent Plugins, a capability tool for site plugins) is registered once, at
 * agent-daemon boot, and the `search_tools` index is a one-shot snapshot taken right after
 * (`agent-daemon-server.ts`). So a freshly enabled plugin's TOOL is not callable in the daemon that
 * is running now. Reporting plain success and letting the operator discover that themselves is the
 * confusion this field exists to prevent.
 *
 * The two directions are deliberately NOT symmetric, for BOTH families, and the notes say so. DISABLE
 * lands immediately on the tool as well, because each tool's own `ToolPolicy` re-reads the activation
 * record per call: `agent_plugin_<id>` via `features/agent-plugins/tool-registrations.ts`'s REVOCATION
 * note, `plugin_capability_<id>` via `capability-tool-registrations.ts`'s "Revocation" section
 * (t91 F1.2). ENABLE still needs a restart, because there is no registration to re-admit: an
 * append-only `ToolRegistry` has nothing to un-skip.
 *
 * Neither Agent Plugin note may imply that the plugin's provisioned external MCP connections were
 * turned off — they never are (`agent-plugins/federate-mcp.ts`'s header, "THE ROW SURVIVES"), so the
 * disable note says so (t91 F1.3). Turning that connection off DOES stop them at once: the per-call connection gate
 * re-reads the row on every call and refuses once the connection is disabled, deleted, OAuth-disconnected, or
 * narrowed (`external-mcp-revocation.ts`), even though the tool stays admitted and listed — and its live session, if
 * any, stays open — until restart (`mcp-federation/reload.ts`), which is why the External MCP routes still answer
 * `restartRequired: true`.
 * @complexity O(1).
 */
function restartNoteFor(request: SetEnabledRequest): string {
  if (request.family === "agent-plugin") {
    return request.enabled
      ? `Enabled and saved. Read its guidance now with load_agent_plugin({pluginId:"${request.pluginId}"}) and use ` +
          `agent_plugin_connect for account sign-in when needed. Its legacy agent_plugin_${request.pluginId} tool may ` +
          `still be unavailable in this session; use the available tools and explain any remaining limitation. Do not ask the person to restart Tovu.`
      : `Disabled and saved. This takes effect immediately, with no restart: the activation record is re-read at ` +
          `the start of every run AND again before every agent_plugin_${request.pluginId} call, so the plugin's own ` +
          `tool stops answering at once rather than lingering until Tovu restarts. This does NOT change any external ` +
          `MCP server connection the plugin set up: if an operator turned one on, its mcp__<server>__* tools keep ` +
          `working until that connection is disabled under Integrations → External MCP.`;
  }
  return request.enabled
    ? "Enabled and saved. The plugin's hooks are live now, but any tool it contributes is registered only when the agent " +
        "daemon starts — tell the user Tovu has to be restarted before that tool can be called."
    : "Disabled and saved. This takes effect immediately, with no restart: any tool this plugin contributed stays listed " +
        "in the running daemon until Tovu restarts, but every call to it is refused from now on.";
}

/**
 * The Agent Plugin branch. Reuses `agent-plugins/set-enabled.ts` — the SAME composition
 * `AGENT_PLUGIN_SET_ENABLED` (the admin route) calls, so there is one writer and one definition of
 * "installed in this workspace", not a second copy that could drift.
 * @complexity O(d) in installed-digest count plus one small file rewrite.
 */
async function applyAgentPluginDecision(routeDeps: PluginsToolDeps, principalId: string, request: SetEnabledRequest): Promise<unknown> {
  try {
    const input = {
      workspaceId: routeDeps.workspaceId,
      pluginId: request.pluginId,
      enabled: request.enabled,
      actor: principalId,
    };
    const result = await (routeDeps.setAgentPluginEnabled
      ? routeDeps.setAgentPluginEnabled({ ...input, agentPluginLayout: routeDeps.agentPluginLayout })
      : requireAgentPluginHost(routeDeps).setEnabled(input));
    // Enabling an Agent Plugin also provisions its auto-admitted MCP servers, exactly as the admin
    // route's enable branch does; disabling has nothing to provision. Without this, the same logical
    // enable produced a partially enabled plugin in chat while the admin toggle produced the
    // documented disabled connection rows — see this file's header.
    //
    // Best-effort: provisions `pluginId`'s auto-admitted remote MCP servers into the external-MCP store
    // on a successful enable. Calls the SAME two primitives
    // (`resolveAgentPluginMcpServers` + `provisionAgentPluginMcpServers`) the admin route's own
    // `provisionAgentPluginMcpServersBestEffort` does, so the in-chat enable and the admin toggle have
    // identical side effects. Create-if-absent, never clobbering an existing row (`federate-mcp.ts`'s
    // header); a failure is logged, never thrown, matching that route's own fail-open posture — the
    // plugin's own activation, the operation this tool is named for, must not fail because one MCP row
    // could not be written. O(s) in the plugin's declared server count.
    if (result.enabled) {
      await requireAgentPluginHost(routeDeps).provisionMcp({ pluginId: request.pluginId, principalId }, {});
    }
    return {
      changed: true,
      cancelled: false,
      family: request.family,
      agentPlugin: { pluginId: result.pluginId, enabled: result.enabled },
      warnings: result.warnings ?? [],
      restartRequired: result.enabled,
      note: restartNoteFor(request),
    };
  } catch (error) {
    // Re-classified at the tool boundary for the same reason `readFamily` throws one: an id that is
    // not installed here IS a caller-input problem with an actionable fix (search first, then use a
    // real id), and a bare `Error` would reach the model as an opaque failure instead. The message
    // carries only the plugin id the caller already sent — nothing internal leaks.
    if (error instanceof AgentPluginNotInstalledError) throw new ToolInputError({ message: error.message });
    if (error instanceof AgentPluginLinkedError) return linkedFaceResult(request, error);
    // t91 F1.1/R2 (2026-09-16): nothing changed, so this is a RESULT the model can relay — matching
    // ADR-055 Decision 6's `changed: false` shape — not a redacted failure. See
    // `activationsRefusalResult` below.
    const refusal = activationsRefusalResult(request, error);
    if (refusal !== undefined) return refusal;
    throw error;
  }
}

/**
 * Pre-flight for an Agent Plugin ENABLE, run before the confirmation dialog: the not-changed result when this
 * workspace's activations.json cannot be read or cannot be locked, otherwise `undefined`.
 *
 * `applyAgentPluginDecision` would refuse the same write anyway, but only after a human had confirmed it — asking
 * them to approve something that cannot happen, then reporting "nothing changed" (t91 §7.2). This reads the file
 * with the same strict reader every writer uses, so it refuses exactly the files the write would. The file can
 * still break while the dialog is open; `applyAgentPluginDecision`'s own catch covers that. Disabling raises no
 * dialog, so it needs no pre-flight.
 *
 * @complexity One small file read, plus `assertAgentPluginActivationsWritable`'s own cross-process lock
 * acquisition and release — not a pure read: it also creates the workspace root if it is absent.
 */
async function unwritableAgentPluginActivationsResult(routeDeps: PluginsToolDeps, request: SetEnabledRequest): Promise<unknown> {
  try {
    if (routeDeps.assertAgentPluginActivationsWritable) {
      await routeDeps.assertAgentPluginActivationsWritable({ workspaceRoot: routeDeps.agentPluginLayout.forWorkspace(routeDeps.workspaceId).root });
    } else {
      await requireAgentPluginHost(routeDeps).assertWritable({}, {});
    }
    return undefined;
  } catch (error) {
    const refusal = activationsRefusalResult(request, error);
    if (refusal !== undefined) return refusal;
    throw error;
  }
}

/**
 * Pre-flight for an Agent Plugin ENABLE, run before the confirmation dialog: the host-incompatible result when any
 * installed revision of the plugin declares a host range this Tovu does not satisfy, otherwise `undefined`.
 *
 * Same reason as {@link unwritableAgentPluginActivationsResult}: the write would refuse it anyway, but only after a
 * human had approved something that cannot happen. Uses the lifecycle owner's own compatibility check against the
 * same contract version, and, like its enable, requires every installed revision of the id to pass. `hostOk` does
 * not depend on other plugins' capabilities, so none are supplied.
 * @complexity O(p) in installed-plugin count.
 */
async function hostIncompatibleEnableResult(routeDeps: PluginsToolDeps, request: SetEnabledRequest): Promise<unknown> {
  const revisions = (await listInstalledAgentPlugins(routeDeps)).filter(plugin => plugin.pluginId === request.pluginId);
  const incompatible = revisions.some(revision => !checkAgentPluginCompatibility({ manifest: revision, hostVersion: AGENT_PLUGIN_CONTRACT_VERSION, activeProvides: [] }).hostOk);
  return incompatible ? hostIncompatibleResult(request, new AgentPluginHostIncompatibleError({ pluginId: request.pluginId })) : undefined;
}

/** A provider plugin's assistant face has no switch of its own (`agent-plugins/provider-plugin-link.ts`):
 *  nothing changed, and the note names the provider plugin to switch instead. @complexity O(1). */
function linkedFaceResult(request: SetEnabledRequest, error: AgentPluginLinkedError): unknown {
  return { changed: false, cancelled: false, family: request.family, pluginId: request.pluginId, restartRequired: false,
    reason: "linked", code: error.code, providerPluginId: error.providerPluginId, note: `Nothing changed. ${error.message}` };
}

/** Pre-flight: a linked face is refused before the confirmation dialog, not after it. A link that cannot be
 *  read here is left to the write, which checks again. @complexity One manifest read per installed revision. */
async function linkedFaceEnableResult(routeDeps: PluginsToolDeps, request: SetEnabledRequest): Promise<unknown> {
  const ports = bindProviderFacePorts({ workspaceRoot: () => routeDeps.agentPluginLayout.forWorkspace(routeDeps.workspaceId).root });
  const providerPluginId = await linkedProviderOf({ ports, pluginId: request.pluginId }).catch(() => undefined);
  return providerPluginId === undefined ? undefined : linkedFaceResult(request, new AgentPluginLinkedError({ pluginId: request.pluginId, providerPluginId }));
}

/** Every Agent Plugin enable pre-flight, in order; the first not-changed result wins. @complexity As its three checks. */
async function agentPluginEnablePreflight(routeDeps: PluginsToolDeps, request: SetEnabledRequest): Promise<unknown> {
  return (await unwritableAgentPluginActivationsResult(routeDeps, request)) ?? (await linkedFaceEnableResult(routeDeps, request)) ?? hostIncompatibleEnableResult(routeDeps, request);
}

/** An interrupted update of this plugin waits for boot recovery (`PLUGIN_UPDATE_PENDING`, or an
 *  unreadable recovery record): its on/off decision is frozen until then, the same 409 the admin
 *  switch answers. Nothing changed, so an ADR-055 Decision 6 result. @complexity O(1). */
function updatePendingResult(request: SetEnabledRequest, error: AgentPluginUpdateError): unknown {
  return {
    changed: false,
    cancelled: false,
    family: request.family,
    pluginId: request.pluginId,
    restartRequired: false,
    reason: "update-pending",
    code: error.code,
    note: `Nothing changed: an interrupted update of '${request.pluginId}' is still waiting to be recovered, so it was NOT ` +
      `${request.enabled ? "enabled" : "disabled"}. ${updateJournalNextStep(error)}`,
  };
}

/** Only a pending update recovers at start. Any other journal refusal (an unreadable record, an
 *  unsafe recorded path) survives a restart, so telling the user to restart would loop them.
 *  @complexity O(1). */
function updateJournalNextStep(error: AgentPluginUpdateError): string {
  return error.code === "PLUGIN_UPDATE_PENDING"
    ? "Tell the user to restart Tovu (recovery runs at start) and then try again."
    : `Its update recovery record needs manual repair (${error.code}); restarting Tovu will not fix it. Tell the user an operator has to repair it first.`;
}

/** The plugin declares a host range this Tovu does not satisfy, so it cannot be enabled: the same
 *  refusal the admin switch answers with 409 `PLUGIN_HOST_INCOMPATIBLE`. Nothing changed, so it is
 *  an ADR-055 Decision 6 result, not a failure. @complexity O(1). */
function hostIncompatibleResult(request: SetEnabledRequest, error: AgentPluginHostIncompatibleError): unknown {
  return {
    changed: false,
    cancelled: false,
    family: request.family,
    pluginId: request.pluginId,
    restartRequired: false,
    reason: "host-incompatible",
    code: error.code,
    note: `Nothing changed: '${request.pluginId}' is not made for this Tovu version, so it was NOT enabled. ` +
      "Tell the user it needs a version of the plugin that supports this Tovu.",
  };
}

/** ADR-055 Decision 6 shape: nothing changed, so it is a RESULT the model can relay, not a redacted
 *  failure. The host path and parse detail stay in the server log via the `console.warn` below;
 *  `note` carries only the fixed, path-free E3 text.
 *  @complexity O(1). */
function activationsUnreadableResult(request: SetEnabledRequest, error: AgentPluginActivationsUnreadableError): unknown {
  console.warn(`[agent-plugins] '${request.pluginId}': plugins_set_enabled refused — ${error.message}`);
  return {
    changed: false,
    cancelled: false,
    family: request.family,
    pluginId: request.pluginId,
    restartRequired: false,
    reason: "activations-unreadable",
    note:
      `Nothing changed: this workspace's Agent Plugin activation record could not be read, so '${request.pluginId}' was NOT ` +
      `${request.enabled ? "enabled" : "disabled"}. Tell the user an operator has to repair activations.json first (the server ` +
      "log names the file and the fault); until then every Agent Plugin tool call in this workspace is refused.",
  };
}

/** t91 R2 (2026-09-16): another Tovu process held the cross-process activations.json write lock and
 *  the wait timed out, or this process lost the lock before it could commit. Same ADR-055 Decision 6
 *  shape as {@link activationsUnreadableResult}: nothing changed, so it is a RESULT the model can
 *  relay. The host lock path stays in the server log via `console.warn`; `note` is fixed and
 *  path-free.
 *  @complexity O(1). */
function activationsBusyResult(request: SetEnabledRequest, error: AgentPluginActivationsBusyError): unknown {
  console.warn(`[agent-plugins] '${request.pluginId}': plugins_set_enabled refused — ${error.message}`);
  return {
    changed: false,
    cancelled: false,
    family: request.family,
    pluginId: request.pluginId,
    restartRequired: false,
    reason: "activations-busy",
    note:
      `Nothing changed: another Tovu process was writing this workspace's Agent Plugin activation record at the same ` +
      `moment, so '${request.pluginId}' was NOT ${request.enabled ? "enabled" : "disabled"}. Tell the user nothing was ` +
      "changed and to try again in a moment; if it keeps happening, the server log names the lock file.",
  };
}

/** Dispatches a thrown activation error to the matching not-changed RESULT — Unreadable to
 *  {@link activationsUnreadableResult}, Busy to {@link activationsBusyResult} — or `undefined` for
 *  any other error, so the caller can rethrow it unchanged. Shared by both
 *  {@link applyAgentPluginDecision} and {@link unwritableAgentPluginActivationsResult} so the two
 *  call sites classify activation failures identically.
 *  @complexity O(1). */
function activationsRefusalResult(request: SetEnabledRequest, error: unknown): unknown | undefined {
  if (error instanceof AgentPluginHostIncompatibleError) return hostIncompatibleResult(request, error);
  if (error instanceof AgentPluginUpdateError) return updatePendingResult(request, error);
  if (error instanceof AgentPluginActivationsUnreadableError) return activationsUnreadableResult(request, error);
  if (error instanceof AgentPluginActivationsBusyError) return activationsBusyResult(request, error);
  return undefined;
}

/**
 * The `.tovu-plugin` site/runtime branch — unchanged in mechanism from before this file grew a
 * second family: the SAME `executeCommand` composition `routes/admin/plugins/set-enabled.ts` uses,
 * with the same `captureInverse`/`rollback` pair.
 * @complexity O(p) in discovered-plugin count, plus the command gateway's own writes.
 */
async function applySiteRuntimeDecision(routeDeps: PluginsToolDeps, principalId: string, request: SetEnabledRequest, optional: { discovery?: readonly PluginDiscoveryRecord[] } = {}): Promise<unknown> {
  const { pluginId, enabled } = request;
  // Reuse the manifest that passed the post-approval identity check, avoiding another discovery
  // read between checking the approved version/digest and the activation owner loading it.
  const discovery = optional.discovery ?? await routeDeps.discoverPlugins();
  // Captured by `captureInverse` below, reused verbatim by `rollback` — mirrors
  // `routes/admin/plugins/set-enabled.ts`'s identical `priorActivation` shape exactly, since this
  // handler IS that route's own `executeCommand` composition.
  let priorActivation: PluginActivationRecord | null = null;

  const { result } = await executeCommand<{ activation: PluginActivationRecord }>({
    deps: {
      clock: routeDeps.clock,
      idGen: routeDeps.idGen,
      changeSets: routeDeps.changeSets,
      outbox: routeDeps.outbox,
      authorize: routeDeps.authorize,
    },
    command: {
      workspaceId: routeDeps.workspaceId,
      actor: { id: principalId, kind: AGENT_TOOL_PRINCIPAL_KIND },
      summary: `Agent set plugin '${pluginId}' enabled=${enabled}`,
      permission: "admin.plugins.enable",
    },
    mutation: {
      entityType: "plugin-activation",
      entityId: pluginId,
      operation: "update",
      captureInverse: async () => {
        priorActivation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId });
        return { enabled: priorActivation?.enabled ?? false };
      },
      execute: () =>
        setPluginEnabled({
          deps: {
            clock: routeDeps.clock,
            repo: routeDeps.pluginActivationRepo,
            discovery,
            onEnabled: routeDeps.onPluginEnabled,
            onDisabled: routeDeps.onPluginDisabled,
          },
          input: { workspaceId: routeDeps.workspaceId, pluginId, enabled },
        }),
      rollback: async () => {
        if (priorActivation) {
          await routeDeps.pluginActivationRepo.save(priorActivation);
        } else {
          await routeDeps.pluginActivationRepo.deleteActivation({ workspaceId: routeDeps.workspaceId, pluginId });
        }
        if (priorActivation?.enabled) {
          await routeDeps.onPluginEnabled(pluginId);
        } else {
          routeDeps.onPluginDisabled(pluginId);
        }
      },
    },
  });

  const record = discovery.find((r) => r.id === pluginId);
  if (!record) throw new ToolInputError({ message: `plugin '${pluginId}' was not found in the current discovery snapshot` });
  if (((priorActivation as PluginActivationRecord | null)?.enabled ?? false) !== result.activation.enabled) routeDeps.tracker?.capture({ name: "plugin_toggled", userId: principalId }, { properties: { pluginId: record.id, pluginKind: "cms", enabled: result.activation.enabled, source: "assistant" } });
  return {
    changed: true,
    cancelled: false,
    family: request.family,
    plugin: toAdminPluginResponse(record, result.activation),
    restartRequired: enabled,
    note: restartNoteFor(request),
  };
}

/** The `admin.plugins.enable` check every write path in this file runs, through the kit's evaluator.
 * @complexity O(1) plus one authorization evaluation. */
async function requireEnablePermission(
  routeDeps: PluginsToolDeps,
  required: { readonly principalId: string; readonly entityType: string; readonly entityId: string },
): Promise<void> {
  await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: required.principalId, permission: "admin.plugins.enable" }, { entityType: required.entityType, entityId: required.entityId });
}

/** `plugins_set_enabled`'s permission check, scoped to the family's own entity type. @complexity O(1) plus one evaluation. */
function requireSetEnabledPermission(routeDeps: PluginsToolDeps, required: { readonly principalId: string; readonly request: SetEnabledRequest }): Promise<void> {
  const { principalId, request } = required;
  return requireEnablePermission(routeDeps, { principalId, entityType: request.family === "agent-plugin" ? "agent-plugin" : "plugin", entityId: request.pluginId });
}

/** What the owner's consent to a site-package enable rests on. Only a site-sourced `.tovu-plugin`
 * that is being enabled can be "sealed here" or carry a capability set; every other call has none. */
interface SiteConsent {
  readonly sealedHere: boolean;
  readonly capabilities: readonly string[] | undefined;
  readonly added: readonly string[];
}

/** The site-sourced record a site-runtime ENABLE's approval identity was read from, else `undefined`
 * (a disable, an Agent Plugin, or a built-in package). @complexity O(p) in the snapshot's plugin count. */
function siteRecordBeingEnabled(
  required: { readonly request: SetEnabledRequest; readonly identity: PluginApprovalIdentity | undefined },
): PluginDiscoveryRecord | undefined {
  const { request, identity } = required;
  const record = identity?.discovery?.find(record => record.id === request.pluginId);
  return request.enabled && request.family === "site-runtime" && record?.source === "site" ? record : undefined;
}

/** Reads the seal and the capabilities beyond the owner's last approval, in that order, for the
 * record the approval identity was read from (so `record.version` IS the identity's version).
 * @complexity O(c) in the manifest's declared capability count, plus two source-port reads. */
async function siteConsentFor(
  routeDeps: PluginsToolDeps,
  required: { readonly request: SetEnabledRequest; readonly identity: PluginApprovalIdentity | undefined },
): Promise<SiteConsent> {
  const { request } = required;
  const record = siteRecordBeingEnabled(required);
  if (record === undefined) return { sealedHere: false, capabilities: undefined, added: [] };
  const sealedHere = routeDeps.pluginSource ? await routeDeps.pluginSource.isSealedHere({ id: request.pluginId, version: record.version }, {}) : false;
  const capabilities = record.manifest ? pluginCapabilitySet({ manifest: record.manifest }) : undefined;
  const added = capabilities === undefined ? [] : addedPluginCapabilities({ approved: await routeDeps.pluginSource?.readApproval({ id: request.pluginId }, {}), next: capabilities });
  return { sealedHere, capabilities, added };
}

/** Whether this enable must show the owner a card (before any remembered approval is consulted).
 * @complexity O(1) plus the policy's own decision. */
function enableNeedsConfirmation(routeDeps: PluginsToolDeps, consent: SiteConsent): boolean {
  // Consent gap (2026-10-12): "sealed here" may mean sealed by the assistant itself, so it skips
  // the card only when this version adds nothing beyond what the owner last approved.
  return (consent.sealedHere && consent.capabilities === undefined) || (routeDeps.pluginSourcePolicy?.confirmEnable({ sealedHere: consent.sealedHere, added: consent.added }, {}) ?? true);
}

/** One prepared `plugins_set_enabled` call: everything the card names and the write re-checks. */
interface SetEnabledPrepared {
  readonly request: SetEnabledRequest;
  readonly identity: PluginApprovalIdentity | undefined;
  readonly refusal: unknown;
  readonly confirm: boolean;
  readonly capabilities: readonly string[] | undefined;
  readonly added: readonly string[];
}

/** parse -> authorize -> (Agent Plugin enable: activations.json writable?) -> identity -> consent
 * inputs. See the `plugins_set_enabled` handler's own comment for why this order is load-bearing.
 * @complexity One family discovery scan plus the source/policy reads in {@link siteConsentFor}. */
async function prepareSetEnabled(routeDeps: PluginsToolDeps, required: { readonly ctx: ToolExecutionContext }): Promise<SetEnabledPrepared> {
  const { ctx } = required;
  const request = readSetEnabledRequest(ctx.input);
  await requireSetEnabledPermission(routeDeps, { principalId: ctx.principal.id, request });
  const refusal = request.enabled && request.family === "agent-plugin" ? await agentPluginEnablePreflight(routeDeps, request) : undefined;
  const identity = request.enabled && refusal === undefined ? await pluginApprovalIdentity({ deps: routeDeps, request }) : undefined;
  const consent = await siteConsentFor(routeDeps, { request, identity });
  return { request, identity, refusal, confirm: enableNeedsConfirmation(routeDeps, consent), capabilities: consent.capabilities, added: consent.added };
}

/** Re-reads an enable's identity after consent; a different key means the human approved something
 * that is no longer what is installed. Disabling binds no identity.
 * @throws {ToolInputError} `PLUGINS_STALE_APPROVAL` when the version or digest changed.
 * @complexity One family discovery scan. */
async function currentApprovedIdentity(
  routeDeps: PluginsToolDeps,
  required: { readonly request: SetEnabledRequest; readonly identity: PluginApprovalIdentity | undefined },
): Promise<PluginApprovalIdentity | undefined> {
  const { request, identity } = required;
  if (!request.enabled) return undefined;
  const current = await pluginApprovalIdentity({ deps: routeDeps, request });
  if (current.key !== identity?.key) throw new ToolInputError({ message: "PLUGINS_STALE_APPROVAL: The plugin version or digest changed. Review and approve it again. Nothing was changed." });
  return current;
}

/** Fails CLOSED without an interactive transport: degrading to "remove it and mention we could
 * not ask" would make confirmation decorative in precisely the contexts that most need it.
 * A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
 * handler open until the idle deadline. Core/host approval ports now own that abort lifecycle.
 * ADR-055 Decision 6: a no-answer is a RESULT, not an exception. Nothing was changed or removed
 * either way, and the model is still alive to read this and say something sensible.
 *
 * The confirmed (or card-free) half: refusal -> re-authorize -> identity unchanged -> not cancelled
 * -> record the approval -> write.
 * @complexity One family discovery scan plus the family's own write. */
async function runSetEnabled(
  routeDeps: PluginsToolDeps,
  required: { readonly ctx: ToolExecutionContext; readonly prepared: SetEnabledPrepared },
): Promise<unknown> {
  const { ctx, prepared: { request, identity, refusal, confirm, capabilities } } = required;
  if (refusal !== undefined) return refusal;
  await requireSetEnabledPermission(routeDeps, { principalId: ctx.principal.id, request });
  const currentIdentity = await currentApprovedIdentity(routeDeps, { request, identity });
  // A cancelled run must neither keep a card open until the deadline nor grant capability.
  if (ctx.signal.aborted) return { changed: false, ...notConfirmedResult({ confirmed: false, reason: "abandoned" }) };
  // The owner approved exactly these capabilities (the identity key pins the manifest). Recorded
  // before the write so a failed record leaves the plugin off rather than enabled unrecorded.
  if (confirm && capabilities !== undefined && routeDeps.pluginSource) await routeDeps.pluginSource.recordApproval({ id: request.pluginId, capabilities }, {});
  return request.family === "agent-plugin"
    ? applyAgentPluginDecision(routeDeps, ctx.principal.id, request)
    : applySiteRuntimeDecision(routeDeps, ctx.principal.id, request, { discovery: currentIdentity?.discovery });
}

/**
 * This domain's model-facing allowlist (`contracts/core/model-facing-tool-errors.ts`). Only the
 * conflict refusal is listed (2026-10-04): its message names plugin ids/names and the manifest's own
 * declared names — nothing internal — and it is the one refusal an agent can act on by itself
 * ("turn the other plugin off first"). Without the rule it reached the model as a redacted
 * INTERNAL_ERROR, indistinguishable from a crash. Every other error here keeps its existing
 * classification, unchanged.
 */
const PLUGINS_MODEL_FACING_ERRORS: readonly ModelFacingErrorRule[] = [
  {
    error: PluginConflictError,
    code: "PLUGINS_CONFLICT",
    guidance: "Tell the user which plugin holds the name; disabling that plugin first is their call",
  },
];

export function buildPluginsRegistrations(routeDeps: PluginsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    plugins_list: async (ctx) => {
      requireNoInput({ input: ctx.input });
      await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: routeDeps.authorize }), workspaceId: routeDeps.workspaceId, principalId: ctx.principal.id, permission: "admin.plugins.read" });

      const discovery = await routeDeps.discoverPlugins();
      const conflicts = (await routeDeps.listPluginConflicts?.()) ?? new Map<string, readonly PluginConflict[]>();
      const plugins = await Promise.all(
        discovery.map(async (record) => {
          const activation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId: record.id });
          return toAdminPluginResponse(record, activation, { conflicts: conflicts.get(record.id) ?? [] });
        }),
      );
      const agentPlugins = await listAgentPluginsForResponse(routeDeps);
      return { plugins, agentPlugins };
    },

    /**
     * ONE tool, BOTH plugin families. See `agent-tools.ts`'s header for why enable/disable is
     * consolidated here while install/uninstall deliberately are not, and
     * `set-enabled-confirmation-ui.ts`'s for why enabling asks a human and disabling does not.
     *
     * Order is load-bearing: parse -> authorize -> (Agent Plugin enable: activations.json readable?) -> confirm -> write. The explicit
     * `requireToolPermission` ahead of the dialog is NOT a second policy (the site-runtime branch's
     * `executeCommand` still performs its own check on the same permission with the same evaluator,
     * per ADR-021 §2) — it gates SHOWING THE DIALOG, which is its own disclosure: a principal with no
     * `admin.plugins.enable` grant must not be able to make a confirmation prompt appear in a human's
     * chat naming a plugin, let alone reach the write behind it.
     */
    plugins_set_enabled: approvalToolHandler({ surfaces,
      prepare: ({ ctx }) => prepareSetEnabled(routeDeps, { ctx }),
      describe: ({ prepared: { request, identity, added } }) => describeEnableApproval({
        subject: { family: request.family, pluginId: request.pluginId, version: identity?.version, label: identity?.label, adds: added },
      }),
      run: ({ ctx, prepared }) => runSetEnabled(routeDeps, { ctx, prepared }),
    }, { flag: "changed", ask: ({ prepared }) => prepared.request.enabled && prepared.refusal === undefined && prepared.confirm,
      rememberKey: ({ prepared }) => prepared.request.enabled ? prepared.identity?.key : undefined,
      remembered: routeDeps.nativeApprovalMemory,
      declined: ({ reason, prepared }) => ({ changed: false, family: prepared?.request.family,
        pluginId: prepared?.request.pluginId, restartRequired: false, ...notConfirmedResult({ confirmed: false, reason }) }),
    }),

    /**
     * ONE tool, BOTH plugin families (S4, 2026-09-24) — the same merge `plugins_set_enabled` above
     * got on 2026-09-09, for the identical reason: two near-identically-named uninstall tools
     * (`plugins_uninstall` and the now-deleted `agent_plugins_uninstall`) is the exact confusion this
     * catalog exists to prevent, and the operator asking to "uninstall the Higgsfield plugin" does not
     * know which of Tovu's two plugin systems that word means either.
     *
     * The 'site-runtime' branch is UNCHANGED: mirrors `routes/admin/plugins/uninstall.ts`'s own
     * business rules exactly — same permission, same `uninstallPlugin()` module, same pre-bound Trash
     * removal binding. NOT wrapped in `executeCommand` — matching that route's own deliberate choice
     * (`Jini/packages/plugins/src/host/uninstall.ts`'s header: "there is no meaningful 'restore the prior state' for deleted bytes"),
     * so there is nothing here for a `captureInverse`/`rollback` pair to capture. That is a statement
     * about revertability, not about consent — the two are orthogonal, and this DOES now confirm
     * (2026-09-16, see `agent-tools.ts`'s header). Order is load-bearing: parse -> authorize -> preview
     * -> confirm -> re-discover and write only if the plugin is still what the dialog showed.
     * `previewUninstallPlugin` runs BEFORE the dialog so an unknown, built-in, or still-enabled plugin
     * is refused without ever asking a human to approve an uninstall that was never going to happen.
     *
     * The 'agent-plugin' branch delegates to `runAgentPluginUninstall` (`agent-plugins/
     * uninstall-tool.ts`) for its ENTIRE order (permission, preview-or-refusal, confirm, write) —
     * unlike `plugins_set_enabled`, whose single pre-branch `requireToolPermission` call covers both
     * families, this tool's permission check stays INSIDE each branch, exactly where the deleted
     * standalone tool ran it. Both branches reuse the SAME held-open exchange
     * (`uninstall-confirmation-ui.ts` in each family's own module), and both redeem through this one
     * `plugins_uninstall` id — see `PLUGINS_UNINSTALL_TOOL_ID` in each.
     */
    plugins_uninstall: async (ctx, optional = {}) => {
      ctx = { ...ctx, input: structuredClone(ctx.input), principal: { ...ctx.principal }, run: { ...ctx.run } };
      const input = requireInputRecord({ input: ctx.input });
      const family = readFamily(input);
      const pluginId = requireString({ input: input, key: "pluginId" });

      if (family === "agent-plugin") return requireAgentPluginHost(routeDeps).uninstall({ surfaces, ctx, pluginId, executionOptions: optional }, {});

      await requireEnablePermission(routeDeps, { principalId: ctx.principal.id, entityType: "plugin", entityId: pluginId });

      const preview = await previewUninstallPlugin(await uninstallRequestFor(routeDeps, pluginId, ctx.principal.id)); // throws PluginNotFoundError/NotUninstallableError/EnabledError BEFORE any dialog

      return approvalToolHandler({ surfaces,
        prepare: async () => preview,
        describe: ({ prepared }) => describeUninstallApproval({ preview: prepared }),
        run: async ({ ctx: approvedCtx, prepared }) => {
          await requireEnablePermission(routeDeps, { principalId: approvedCtx.principal.id, entityType: "plugin", entityId: pluginId });
          if (approvedCtx.signal.aborted) return { uninstalled: false, ...notConfirmedResult({ confirmed: false, reason: "abandoned" }) };
          return uninstallConfirmedPlugin(routeDeps, prepared, approvedCtx.principal.id);
        },
      }, { flag: "uninstalled", declined: ({ reason }) => ({ pluginId, uninstalled: false, ...notConfirmedResult({ confirmed: false, reason }) }) })(ctx, optional);
    },
  };

  // No `unwiredToolIds`: Plugins wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({ metadata: toolMetadata,
    domain: "plugins",
    catalogModule: "features/plugin-runtime/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers: withModelFacingErrors({ handlers, rules: PLUGINS_MODEL_FACING_ERRORS }),
    derivedRisk: pluginsDerivedRisk,
  });
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
): ToolContributor {
  return { domain: "plugins", build: (deps, surfaces) => buildPluginsRegistrations({
    ...deps, pluginHost: deps.pluginHost ?? required.createPluginHost?.({ deps }),
  }, surfaces), risk: pluginsDerivedRisk };
}
