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
 * `resolveAgentPluginLayout().forWorkspace(routeDeps.workspaceId)`, matching every other caller of
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
 * `version`, `archiveDigest`, and skill NAMES, the same "no `handle`-shaped value ever serializes"
 * rule `features/agent-plugins/tool-registrations.ts`'s own header states for its tools.
 */
import {
  AGENT_TOOL_PRINCIPAL_KIND,
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
  type OutboxPort,
} from "@jini-ai/cms/core";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { executeCommand, type AuthorizeFn, type ChangeSetRepoPort } from "../../contracts/core/commands/index.js";
import {
  resolveConfirmationDecision,
  type AssistantSurfaceDeps,
  type ConfirmationOutcome,
} from "../../contracts/core/tool-surface-exchanges.js";
import type { ExternalMcpStoreDeps, ToolContributor } from "#src/assistant/index";
// Now sourced from this same module — `toAdminPluginResponse` moved to
// `features/plugin-runtime/admin-response.ts` (this domain's own projection), closing the back-edge
// into `server/http/admin` this file used to carry. `server/http/admin/plugins.ts` re-exports the
// same symbol so its own HTTP-route consumers are unaffected.
import { toAdminPluginResponse } from "./admin-response.js";
import {
  setPluginEnabled,
  type PluginActivationRecord,
  type PluginActivationRepoPort,
} from "./activation.js";
import { pluginAgentToolCatalog } from "./agent-tools.js";
import type { PluginDiscoveryRecord } from "./discovery.js";
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
import {
  PluginChangedSincePreviewError,
  previewUninstallPlugin,
  uninstallPlugin,
  type PluginUninstallPreview,
  type UninstallPluginRequired,
} from "./uninstall.js";
// The Agent Plugins half of `plugins_list` (see this file's header) — a deliberate, disclosed
// cross-domain read. `resolve-agent-plugin-refs.ts`/`layout.ts` only, never
// `features/agent-plugins/tool-registrations.ts` (a separate workstream's file; not touched here).
import { resolveAgentPluginLayout } from "../agent-plugins/layout.js";
import { listInstalledPlugins } from "../agent-plugins/resolve-agent-plugin-refs.js";
import type { InstalledAgentPlugin } from "../agent-plugins/install.js";
// The Agent Plugin half of `plugins_set_enabled` (2026-09-09). `set-enabled.ts` is that feature's own
// business rule — a DOMAIN module, deliberately not `agent-plugins/tool-registrations.ts` — so this
// adds no `plugin-runtime -> agent-plugins/tool-registrations` edge. See its header, and the
// "one tool, two families" section below.
import { AgentPluginNotInstalledError, setAgentPluginEnabled } from "../agent-plugins/set-enabled.js";
// t91 F1.1 (2026-09-16). `activation.ts` is the domain module that already defines this error;
// importing it here adds no `plugin-runtime -> agent-plugins/tool-registrations` edge (same
// reasoning as the `set-enabled.js` import above).
import { AgentPluginActivationsUnreadableError, assertAgentPluginActivationsWritable } from "../agent-plugins/activation.js";
// The Agent Plugins MCP-provisioning half of `plugins_set_enabled` (2026-09-15). The route's own
// enable path calls these same two primitives; see `applyAgentPluginDecision` below for why the
// in-chat enable must not skip them.
import { provisionAgentPluginMcpServers, resolveAgentPluginMcpServers } from "../agent-plugins/federate-mcp.js";
import { buildEnableConfirmationResource, PLUGINS_SET_ENABLED_TOOL_ID, type PluginFamily } from "./set-enabled-confirmation-ui.js";
import { buildUninstallConfirmationResource, PLUGINS_UNINSTALL_TOOL_ID } from "./uninstall-confirmation-ui.js";

const CATALOG_BY_ID = indexCatalogById(pluginAgentToolCatalog);

/**
 * The exact slice of the route-deps bag Plugins' tool handlers read. Declared structurally (rather
 * than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge into the
 * composition root for the `RouteDeps` god type specifically — the `toAdminPluginResponse` import
 * above is a separate, already-disclosed back-edge (`server/http/admin/plugins`) left untouched per
 * the dispatch's explicit out-of-scope list. `server/routes/*` satisfies this structurally by
 * passing its existing `RouteDeps` object; nothing there changes.
 */
export interface PluginsToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  changeSets: ChangeSetRepoPort;
  outbox: OutboxPort;
  pluginActivationRepo: PluginActivationRepoPort;
  discoverPlugins: () => Promise<readonly PluginDiscoveryRecord[]>;
  onPluginEnabled: (pluginId: string) => Promise<void>;
  onPluginDisabled: (pluginId: string) => void;
  /** The actual on-disk artifact removal for `plugins_uninstall` — same field name and same
   *  composition-root binding `routes/admin/plugins/uninstall.ts` already reads
   *  (`server/runtime/composition/plugin-runtime.ts`'s `onPluginUninstalled`), so this domain adds
   *  no second implementation of "how a plugin's files actually get removed". */
  onPluginUninstalled: (pluginId: string) => Promise<void>;
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
  // -> uninstallPlugin (uninstall.ts): deps.onPluginUninstalled (real filesystem removal) plus
  //    pluginActivationRepo.deleteActivation() per matching workspace. Durable and irreversible —
  //    see agent-tools.ts's own description; no revert/change-set capture exists for this operation.
  ["plugins_uninstall", "mutates-durable-state"],
]);

/**
 * ===========================================================================================
 * `plugins_set_enabled` — one tool, two plugin families
 * ===========================================================================================
 * Tovu has two unrelated plugin systems that share the word "plugin":
 *
 * - `.tovu-plugin` SITE/RUNTIME plugins — this feature. Discovered by `discoverPlugins()`, activated
 *   as a database row through `activation.ts`'s `setPluginEnabled`, enable-hook may run ADR-023 DDL.
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
  throw new ToolInputError(
    "'family' is required and must be exactly one of: 'site-runtime' (a .tovu-plugin site plugin, as listed by " +
      "content_read.plugin) or 'agent-plugin' (an Agent Plugin, as returned by search_agent_plugin_local). Tovu has two " +
      "unrelated plugin systems and this tool never guesses between them — if you are unsure, call the matching list/search " +
      "tool first and use the family whose results contained this id.",
  );
}

/** @complexity O(1). */
function readSetEnabledRequest(rawInput: unknown): SetEnabledRequest {
  const input = requireInputRecord(rawInput);
  const family = readFamily(input);
  const pluginId = requireString(input, "pluginId");
  if (typeof input["enabled"] !== "boolean") {
    throw new ToolInputError("'enabled' (boolean) is required — true to turn the plugin on, false to turn it off");
  }
  return { family, pluginId, enabled: input["enabled"] };
}

/**
 * Raises the enable-confirmation dialog and parks on the human's answer.
 *
 * Fails CLOSED when the execution context cannot hold a call open, exactly like
 * `content_post_delete`: degrading to "enable it and mention that we could not ask" would make the
 * confirmation decorative in precisely the contexts that most need it. Disabling is unaffected —
 * it never reaches here.
 *
 * @throws {Error} When there is no `emitSurface` to raise a dialog through.
 * @complexity O(1) plus the human's own latency, bounded by the exchange store's TTLs.
 */
async function confirmEnable(
  surfaces: AssistantSurfaceDeps,
  ctx: Pick<ToolExecutionContext, "principal" | "signal"> & Partial<Pick<ToolExecutionContext, "emitSurface">>,
  request: SetEnabledRequest,
): Promise<ConfirmationOutcome> {
  const emitSurface = ctx.emitSurface;
  if (!emitSurface) {
    throw new Error(
      "plugins_set_enabled: this execution context has no interactive confirmation channel (no emitSurface), so a plugin " +
        "cannot be enabled from here — enabling changes what the assistant itself can do and is not the model's to grant. " +
        "Nothing was changed. Ask the operator to enable it from the admin, or disable (which needs no confirmation).",
    );
  }

  const exchange = surfaces.surfaceExchanges.open({ toolId: PLUGINS_SET_ENABLED_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui = buildEnableConfirmationResource({
    subject: { family: request.family, pluginId: request.pluginId },
    exchangeId: exchange.id,
  });

  // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
  // handler open until the idle deadline — mirrors `content_post_delete`'s identical guard.
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** ADR-055 Decision 6: a no-answer is a RESULT, not an exception. Nothing was changed either way,
 *  and the model is still alive to read this and say something sensible. @complexity O(1). */
function notConfirmedResult(outcome: ConfirmationOutcome, request: SetEnabledRequest): unknown {
  const base = { changed: false, family: request.family, pluginId: request.pluginId, restartRequired: false };
  if (outcome.confirmed) return base; // unreachable; keeps the return type honest for callers
  if (outcome.reason === "declined") {
    return { ...base, cancelled: true, note: `The user declined. '${request.pluginId}' was NOT enabled and nothing changed.` };
  }
  return {
    ...base,
    cancelled: false,
    reason: outcome.reason,
    note:
      outcome.reason === "expired"
        ? `The user did not answer the confirmation before it expired. '${request.pluginId}' was NOT enabled.`
        : `The confirmation was closed because the run ended. '${request.pluginId}' was NOT enabled.`,
  };
}

/**
 * Raises the uninstall-confirmation dialog and parks on the human's answer.
 *
 * Fails CLOSED when the execution context cannot hold a call open, exactly like
 * `content_post_delete`/`plugins_set_enabled`/`agent_plugins_uninstall`: degrading to "remove it and
 * mention we could not ask" would make the confirmation decorative in precisely the contexts that
 * most need it — deleting bytes has no meaningful undo, so this is the one point where the human's
 * answer actually matters.
 *
 * @throws {Error} When there is no `emitSurface` to raise a dialog through.
 * @complexity O(1) plus the human's own latency, bounded by the exchange store's TTLs.
 */
async function confirmUninstall(
  surfaces: AssistantSurfaceDeps,
  ctx: Pick<ToolExecutionContext, "principal" | "signal"> & Partial<Pick<ToolExecutionContext, "emitSurface">>,
  preview: PluginUninstallPreview,
): Promise<ConfirmationOutcome> {
  const emitSurface = ctx.emitSurface;
  if (!emitSurface) {
    throw new Error(
      "plugins_uninstall: this execution context has no interactive confirmation channel (no emitSurface), so a " +
        "permanent uninstall cannot be gated here. Nothing was removed.",
    );
  }

  const exchange = surfaces.surfaceExchanges.open({ toolId: PLUGINS_UNINSTALL_TOOL_ID, principalId: ctx.principal.id }, emitSurface);
  const ui = buildUninstallConfirmationResource({ preview, exchangeId: exchange.id });

  // A cancelled run must not leave a dialog holding a call nobody is listening to, nor hold this
  // handler open until the idle deadline — mirrors `confirmEnable`'s identical guard above.
  const closeOnAbort = () => exchange.close();
  ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
  try {
    return await resolveConfirmationDecision(exchange, { channel: "mcp-ui", payload: { resource: ui } });
  } finally {
    ctx.signal.removeEventListener("abort", closeOnAbort);
  }
}

/** ADR-055 Decision 6: a no-answer is a RESULT, not an exception. Nothing was removed either way,
 *  and the model is still alive to read this and say something sensible. @complexity O(1). */
function notConfirmedUninstallResult(outcome: ConfirmationOutcome, pluginId: string): unknown {
  const base = { pluginId, uninstalled: false };
  if (outcome.confirmed) return base; // unreachable; keeps the return type honest for callers
  if (outcome.reason === "declined") {
    return { ...base, cancelled: true, note: `The user declined. '${pluginId}' was NOT uninstalled and nothing changed.` };
  }
  return {
    ...base,
    cancelled: false,
    reason: outcome.reason,
    note:
      outcome.reason === "expired"
        ? `The user did not answer the confirmation before it expired. '${pluginId}' was NOT uninstalled.`
        : `The confirmation was closed because the run ended. '${pluginId}' was NOT uninstalled.`,
  };
}

/** A fresh `uninstallPlugin` request. Discovery is re-read on every call, so the post-confirmation write never resolves
 *  its target from the snapshot taken before a human was asked. @complexity one discovery scan. */
async function uninstallRequestFor(routeDeps: PluginsToolDeps, pluginId: string): Promise<UninstallPluginRequired> {
  const discovery = await routeDeps.discoverPlugins();
  return { deps: { repo: routeDeps.pluginActivationRepo, discovery, onUninstall: routeDeps.onPluginUninstalled }, input: { pluginId } };
}

/**
 * The post-confirmation half of `plugins_uninstall` (t91 F2.2): re-discovers, then uninstalls only if the plugin is
 * still the name and version the dialog showed. A change is a not-removed RESULT (ADR-055 Decision 6), the same union
 * member `expired`/`abandoned` use; every other refusal still propagates undecorated, per this file's convention.
 * @complexity one discovery scan plus `uninstallPlugin`.
 */
async function uninstallConfirmedPlugin(routeDeps: PluginsToolDeps, preview: PluginUninstallPreview): Promise<unknown> {
  const { pluginId } = preview;
  try {
    const result = await uninstallPlugin(await uninstallRequestFor(routeDeps, pluginId), { confirmedPreview: preview });
    return { pluginId, clearedWorkspaceIds: result.clearedWorkspaceIds };
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
 * disable note says so (t91 F1.3).
 * @complexity O(1).
 */
function restartNoteFor(request: SetEnabledRequest): string {
  if (request.family === "agent-plugin") {
    return request.enabled
      ? `Enabled and saved. Its guidance is available to runs that pin it immediately, but the plugin's own ` +
          `agent_plugin_${request.pluginId} tool is registered only when the agent daemon starts — tell the user Tovu has to be ` +
          `restarted before that tool can be called, rather than implying it is usable right now.`
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
 * Best-effort: provisions `pluginId`'s auto-admitted remote MCP servers into the external-MCP store
 * on a successful enable. Calls the SAME two primitives
 * (`resolveAgentPluginMcpServers` + `provisionAgentPluginMcpServers`) the admin route's own
 * `provisionAgentPluginMcpServersBestEffort` does, so the in-chat enable and the admin toggle have
 * identical side effects. Create-if-absent, never clobbering an existing row (`federate-mcp.ts`'s
 * header); a failure is logged, never thrown, matching that route's own fail-open posture — the
 * plugin's own activation, the operation this tool is named for, must not fail because one MCP row
 * could not be written.
 * @complexity O(s) in the plugin's declared server count.
 */
async function provisionAgentPluginMcpServersBestEffort(
  routeDeps: PluginsToolDeps,
  input: { readonly pluginId: string; readonly principalId: string },
): Promise<void> {
  try {
    const servers = await resolveAgentPluginMcpServers({ workspaceId: routeDeps.workspaceId, pluginId: input.pluginId });
    const result = await provisionAgentPluginMcpServers(
      {
        repo: routeDeps.externalMcpServerRepo,
        sealer: routeDeps.siteAssistantSecretSealer,
        keyring: routeDeps.siteAssistantSecretKeyring,
        clock: routeDeps.clock,
      },
      { workspaceId: routeDeps.workspaceId, pluginId: input.pluginId, servers, principalId: input.principalId },
    );
    for (const failure of result.failed) {
      console.warn(`[agent-plugins] '${input.pluginId}': MCP provisioning for server '${failure.serverKey}' failed — ${failure.reason}`);
    }
  } catch (error) {
    console.warn(
      `[agent-plugins] '${input.pluginId}': MCP provisioning could not run — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The Agent Plugin branch. Reuses `agent-plugins/set-enabled.ts` — the SAME composition
 * `AGENT_PLUGIN_SET_ENABLED` (the admin route) calls, so there is one writer and one definition of
 * "installed in this workspace", not a second copy that could drift.
 * @complexity O(d) in installed-digest count plus one small file rewrite.
 */
async function applyAgentPluginDecision(routeDeps: PluginsToolDeps, principalId: string, request: SetEnabledRequest): Promise<unknown> {
  try {
    const result = await setAgentPluginEnabled({
      workspaceId: routeDeps.workspaceId,
      pluginId: request.pluginId,
      enabled: request.enabled,
      actor: principalId,
    });
    // Enabling an Agent Plugin also provisions its auto-admitted MCP servers, exactly as the admin
    // route's enable branch does; disabling has nothing to provision. Without this, the same logical
    // enable produced a partially enabled plugin in chat while the admin toggle produced the
    // documented disabled connection rows — see this file's header.
    if (result.enabled) {
      await provisionAgentPluginMcpServersBestEffort(routeDeps, { pluginId: request.pluginId, principalId });
    }
    return {
      changed: true,
      cancelled: false,
      family: request.family,
      agentPlugin: { pluginId: result.pluginId, enabled: result.enabled },
      restartRequired: result.enabled,
      note: restartNoteFor(request),
    };
  } catch (error) {
    // Re-classified at the tool boundary for the same reason `readFamily` throws one: an id that is
    // not installed here IS a caller-input problem with an actionable fix (search first, then use a
    // real id), and a bare `Error` would reach the model as an opaque failure instead. The message
    // carries only the plugin id the caller already sent — nothing internal leaks.
    if (error instanceof AgentPluginNotInstalledError) throw new ToolInputError(error.message);
    // t91 F1.1 (2026-09-16): nothing changed, so this is a RESULT the model can relay — matching
    // ADR-055 Decision 6's `changed: false` shape — not a redacted failure. See
    // `activationsUnreadableResult` below.
    if (error instanceof AgentPluginActivationsUnreadableError) return activationsUnreadableResult(request, error);
    throw error;
  }
}

/**
 * Pre-flight for an Agent Plugin ENABLE, run before the confirmation dialog: the not-changed result when this
 * workspace's activations.json cannot be read, otherwise `undefined`.
 *
 * `applyAgentPluginDecision` would refuse the same write anyway, but only after a human had confirmed it — asking
 * them to approve something that cannot happen, then reporting "nothing changed" (t91 §7.2). This reads the file
 * with the same strict reader every writer uses, so it refuses exactly the files the write would. The file can
 * still break while the dialog is open; `applyAgentPluginDecision`'s own catch covers that. Disabling raises no
 * dialog, so it needs no pre-flight.
 *
 * @complexity One small file read.
 */
async function unwritableAgentPluginActivationsResult(routeDeps: PluginsToolDeps, request: SetEnabledRequest): Promise<unknown> {
  try {
    await assertAgentPluginActivationsWritable(resolveAgentPluginLayout().forWorkspace(routeDeps.workspaceId).root);
    return undefined;
  } catch (error) {
    if (error instanceof AgentPluginActivationsUnreadableError) return activationsUnreadableResult(request, error);
    throw error;
  }
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

/**
 * The `.tovu-plugin` site/runtime branch — unchanged in mechanism from before this file grew a
 * second family: the SAME `executeCommand` composition `routes/admin/plugins/set-enabled.ts` uses,
 * with the same `captureInverse`/`rollback` pair.
 * @complexity O(p) in discovered-plugin count, plus the command gateway's own writes.
 */
async function applySiteRuntimeDecision(routeDeps: PluginsToolDeps, principalId: string, request: SetEnabledRequest): Promise<unknown> {
  const { pluginId, enabled } = request;
  const discovery = await routeDeps.discoverPlugins();
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
  if (!record) throw new ToolInputError(`plugin '${pluginId}' was not found in the current discovery snapshot`);
  return {
    changed: true,
    cancelled: false,
    family: request.family,
    plugin: toAdminPluginResponse(record, result.activation),
    restartRequired: enabled,
    note: restartNoteFor(request),
  };
}

export function buildPluginsRegistrations(routeDeps: PluginsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    plugins_list: async (ctx) => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.plugins.read" });

      const discovery = await routeDeps.discoverPlugins();
      const plugins = await Promise.all(
        discovery.map(async (record) => {
          const activation = await routeDeps.pluginActivationRepo.getActivation({ workspaceId: routeDeps.workspaceId, pluginId: record.id });
          return toAdminPluginResponse(record, activation);
        }),
      );
      return { plugins };
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
    plugins_set_enabled: async (ctx) => {
      const request = readSetEnabledRequest(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "admin.plugins.enable",
        entityType: request.family === "agent-plugin" ? "agent-plugin" : "plugin",
        entityId: request.pluginId,
      });

      if (request.enabled) {
        const refused = request.family === "agent-plugin" ? await unwritableAgentPluginActivationsResult(routeDeps, request) : undefined;
        if (refused !== undefined) return refused;
        const outcome = await confirmEnable(surfaces, ctx, request);
        if (!outcome.confirmed) return notConfirmedResult(outcome, request);
      }

      return request.family === "agent-plugin"
        ? applyAgentPluginDecision(routeDeps, ctx.principal.id, request)
        : applySiteRuntimeDecision(routeDeps, ctx.principal.id, request);
    },

    /**
     * Mirrors `routes/admin/plugins/uninstall.ts`'s own business rules exactly: same permission, same
     * `uninstallPlugin()` module, same `deps.onPluginUninstalled` mechanism binding. NOT wrapped in
     * `executeCommand` — matching that route's own deliberate choice (`uninstall.ts`'s header: "there
     * is no meaningful 'restore the prior state' for deleted bytes"), so there is nothing here for a
     * `captureInverse`/`rollback` pair to capture. That is a statement about revertability, not about
     * consent — the two are orthogonal, and this DOES now confirm (2026-09-16, see `agent-tools.ts`'s
     * header for why the prior "confirm with the human before calling this" description was never
     * actually enforced here, only asked of the model in prose).
     *
     * Order is load-bearing, same as `plugins_set_enabled` above: parse -> authorize -> preview ->
     * confirm -> re-discover and write only if the plugin is still what the dialog showed.
     * `previewUninstallPlugin` runs BEFORE the dialog so an unknown, built-in, or still-enabled plugin
     * is refused without ever asking a human to approve an uninstall that was never going to happen —
     * reuses the SAME held-open exchange `plugins_set_enabled`'s enable path already does
     * (`uninstall-confirmation-ui.ts`).
     */
    plugins_uninstall: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const pluginId = requireString(input, "pluginId");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: "admin.plugins.enable", entityType: "plugin", entityId: pluginId });

      const preview = await previewUninstallPlugin(await uninstallRequestFor(routeDeps, pluginId)); // throws PluginNotFoundError/NotUninstallableError/EnabledError BEFORE any dialog

      const outcome = await confirmUninstall(surfaces, ctx, preview);
      if (!outcome.confirmed) return notConfirmedUninstallResult(outcome, pluginId);

      return uninstallConfirmedPlugin(routeDeps, preview);
    },
  };

  // No `unwiredToolIds`: Plugins wires its ENTIRE catalog, same tripwire discipline as Forms.
  return buildDomainRegistrations({
    domain: "plugins",
    catalogModule: "features/plugin-runtime/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: pluginsDerivedRisk,
  });
}

/**
 * Contributes Plugins' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildPluginsRegistrations`/
 * `pluginsDerivedRisk` by name; this is the seam that replaced it (2026-08-17, Stage 2 batch 2).
 * Unlike `database` (tried and reverted earlier in this batch), this domain's own imports are all
 * `core/commands` plus its own sibling files (`admin-response.ts`, `activation.ts`, `agent-tools.ts`,
 * `discovery.ts`) — it does not reach `features/database`/`db` at all, so it does not carry that
 * domain's round-trip risk. Every importer outside `server/*` is none — nothing else imports this
 * domain by name.
 */
export function contributePluginsTools(): ToolContributor {
  return { domain: "plugins", build: buildPluginsRegistrations, risk: pluginsDerivedRisk };
}
