import { createHash } from "node:crypto";

import { saveExternalMcpServer, type ExternalMcpStoreDeps, type SaveExternalMcpServerInput } from "#src/assistant/index";

import { classifyAgentPluginMcpServerTrust, readInstalledMcpServers } from "./capability-projection.js";
import { resolveAgentPluginLayout } from "./layout.js";
import type { McpServerConfig } from "./manifest.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file Phase 4 of the 2026-09-10 plugin-MCP-wiring work: turns an activated Agent Plugin's
 * auto-admitted remote MCP servers into real rows in the SAME external-MCP store
 * (`assistant/external-mcp-store.ts`) Settings → External MCP already reads at daemon boot
 * (`agent-daemon-server.ts`'s `resolveStoredExternalMcpConnections`) — reusing that path rather than
 * building a parallel one, per the dispatch brief.
 *
 * ---------------------------------------------------------------------------
 * What this does NOT do
 * ---------------------------------------------------------------------------
 * - Never touches a `stdio` server. `classifyAgentPluginMcpServerTrust` (`capability-projection.ts`)
 *   is consulted first, and only an `"auto-admit"` (remote) server ever reaches
 *   {@link saveExternalMcpServer}. There is no code path in this file that can launch a local
 *   process on a plugin's say-so — see Phase 3's own gate for the full argument.
 * - Never sets `allowedToolNames`. `mcp-federation/trust.ts` R2's default-deny allowlist is
 *   deliberately left for the operator: this file makes the CONNECTION discoverable (no more
 *   hand-typing a URL), not the individual remote tools admitted. An operator still visits
 *   Settings → External MCP once to probe and allowlist tools — the existing `probe.ts` route
 *   already lets them pick from a real discovered list rather than guessing names, which is what
 *   actually closes that gap, not this file.
 * - Never completes an OAuth handshake. `authMode: "oauth"` rows still need the operator's own
 *   browser-interactive consent (Higgsfield's authorization_code + PKCE flow has no other kind) —
 *   this file only makes sure the row EXISTS with the right URL and transport so that consent step
 *   is the operator's only remaining action, per the plugin's own header doc.
 * - Does not run at request time. It is a live network call is NOT made here (see
 *   `oauth` grant defaulting below) — only the row's OWN data is written. The daemon's own boot-time
 *   federation read (`resolveStoredExternalMcpConnections`) is what actually connects, and per that
 *   module's own doc, requires an assistant restart to pick up a newly-saved row.
 *
 * ---------------------------------------------------------------------------
 * Why authMode defaults to "none", not "oauth"
 * ---------------------------------------------------------------------------
 * The real Agent Plugins v1.0.0 mcp.schema.json defines NO auth field at all (verified live,
 * 2026-09-10 — see `manifest.ts`'s header). Guessing "oauth" for every remote server would attempt
 * RFC 8414 discovery against a plugin's server even when it needs no auth at all, failing where a
 * plain connection would have worked. `"none"` is the safe default; a plugin author who KNOWS their
 * server requires OAuth (Higgsfield's own `mcp.json` does) sets the `tovuAuthMode` extension
 * (`manifest.ts`) to say so explicitly.
 */

/** Connection ids minted here get this prefix, distinguishing an Agent-Plugin-derived row from one
 *  an operator hand-typed into Settings → External MCP — visible in the admin tab's own list, and a
 *  cheap way for a human (or a future cleanup script) to tell the two apart. */
const AGENT_PLUGIN_CONNECTION_ID_PREFIX = "ap-";

/** `mcp-federation/trust.ts`'s `CONNECTION_ID_PATTERN` caps a connection id at 40 characters. Split
 *  out as its own constant so the derivation below states its budget once, in one place. */
const MAX_CONNECTION_ID_LENGTH = 40;

/** Sanitizes one identifier fragment (a `pluginId` or a `mcp.json` server key) into the
 *  `[a-z0-9-]` charset {@link deriveAgentPluginConnectionId}'s output must stay inside — lowercases,
 *  replaces every run of disallowed characters with a single `-`, and trims leading/trailing `-`.
 *  @complexity O(n) in the fragment's length. */
function sanitizeConnectionIdFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Derives the stable, valid `external_mcp_servers.serverId` one plugin-declared server maps to.
 *
 * Deterministic in both directions that matter: the SAME `(pluginId, serverKey)` pair always
 * derives the SAME id (so disabling a plugin can find the row it created without a separate lookup
 * table), and two DIFFERENT pairs practically never collide even after truncation, because a 6-hex
 * digest of the untruncated pair is always appended — truncating the human-readable prefix can only
 * make the id less readable, never ambiguous with another plugin/server pair's id.
 *
 * @complexity O(n) in the combined fragment length, plus one SHA-256 over a short string.
 */
export function deriveAgentPluginConnectionId(pluginId: string, serverKey: string): string {
  const digest = createHash("sha256").update(`${pluginId}:${serverKey}`).digest("hex").slice(0, 6);
  const budget = MAX_CONNECTION_ID_LENGTH - AGENT_PLUGIN_CONNECTION_ID_PREFIX.length - 1 - digest.length;
  const readable = sanitizeConnectionIdFragment(`${pluginId}-${serverKey}`).slice(0, Math.max(budget, 0));
  const withoutTrailingDash = readable.replace(/-+$/g, "");
  return `${AGENT_PLUGIN_CONNECTION_ID_PREFIX}${withoutTrailingDash}-${digest}`;
}

/** One server this plugin declared that {@link planAgentPluginMcpFederation} will not upsert a row
 *  for, and why — reported rather than silently dropped, matching `mcp-federation/trust.ts`'s own
 *  "every refusal is reportable, never silent" discipline. */
export interface SkippedAgentPluginMcpServer {
  readonly serverKey: string;
  readonly reason: string;
}

/** One server {@link planAgentPluginMcpFederation} determined should become a row. Carries the
 *  derived id and the resolved config, but not yet `workspaceId`/`enabled`/`principalId` — those
 *  are per-CALL, not per-server, and {@link buildFederatedMcpSaveInput} adds them. */
export interface PlannedAgentPluginMcpUpsert {
  readonly connectionId: string;
  readonly serverKey: string;
  readonly url: string;
  readonly authMode: "oauth" | "none";
}

export interface AgentPluginMcpFederationPlan {
  readonly toUpsert: readonly PlannedAgentPluginMcpUpsert[];
  readonly skipped: readonly SkippedAgentPluginMcpServer[];
}

/** One server's classification result — either it is planned for upsert, or it is skipped with a
 *  reason. Split out of {@link planAgentPluginMcpFederation}'s loop so that function has exactly one
 *  branch point per entry instead of three sequential early-exits, keeping the loop's own
 *  break/continue count under the shop's style ceiling without changing behavior.
 *
 * Narrows on the server's OWN `type` first — not merely on `classifyAgentPluginMcpServerTrust`'s
 * return value — so `config.url` below is real TypeScript narrowing, not an assertion. The
 * classifier is still consulted right after: if its rule ever changes to reclassify a remote
 * transport as "requires-confirmation" without this file being updated to match, that mismatch is
 * caught here and refused rather than silently auto-wired against stale reasoning.
 *
 * @complexity O(1).
 */
function classifyAgentPluginMcpServerForFederation(
  pluginId: string,
  serverKey: string,
  config: McpServerConfig,
): { readonly kind: "upsert"; readonly planned: PlannedAgentPluginMcpUpsert } | { readonly kind: "skip"; readonly reason: string } {
  if (config.type === "stdio") {
    return { kind: "skip", reason: "declares a 'stdio' local process — requires explicit operator confirmation, never auto-wired from a plugin" };
  }
  if (classifyAgentPluginMcpServerTrust(config) !== "auto-admit") {
    return {
      kind: "skip",
      reason: "this server's trust classification is not 'auto-admit' — refusing to wire it until this file is re-verified against classifyAgentPluginMcpServerTrust's current rule",
    };
  }
  if (config.type === "sse") {
    return {
      kind: "skip",
      reason: "declares the legacy 'sse' transport, which this Tovu version's external-MCP store does not support (only stdio/streamable_http)",
    };
  }

  return {
    kind: "upsert",
    planned: {
      connectionId: deriveAgentPluginConnectionId(pluginId, serverKey),
      serverKey,
      url: config.url,
      authMode: config.tovuAuthMode ?? "none",
    },
  };
}

/**
 * Pure classification pass over one plugin's full mcp.json server configs — no I/O, no `saveExternalMcpServer`
 * call, so this is independently testable from the store's own DB-shaped dependencies.
 *
 * @complexity O(s) in the declared server count.
 */
export function planAgentPluginMcpFederation(input: {
  readonly pluginId: string;
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}): AgentPluginMcpFederationPlan {
  const toUpsert: PlannedAgentPluginMcpUpsert[] = [];
  const skipped: SkippedAgentPluginMcpServer[] = [];

  for (const [serverKey, config] of Object.entries(input.servers)) {
    const result = classifyAgentPluginMcpServerForFederation(input.pluginId, serverKey, config);
    if (result.kind === "upsert") toUpsert.push(result.planned);
    else skipped.push({ serverKey, reason: result.reason });
  }

  return { toUpsert, skipped };
}

/** Builds one planned upsert's {@link SaveExternalMcpServerInput} — split out of
 *  {@link applyAgentPluginMcpFederation} purely to keep that function's complexity under the shop
 *  ceiling. `allowedToolNames`/`writeAllowedToolNames`/`args`/`command` are deliberately empty; see
 *  this file's header for why the tool allowlist is left to the operator. */
function buildFederatedMcpSaveInput(
  planned: PlannedAgentPluginMcpUpsert,
  input: { readonly workspaceId: string; readonly pluginId: string; readonly enabled: boolean; readonly principalId: string },
): SaveExternalMcpServerInput {
  return {
    workspaceId: input.workspaceId,
    serverId: planned.connectionId,
    label: `${input.pluginId} · ${planned.serverKey}`,
    transport: "streamable_http",
    authMode: planned.authMode,
    enabled: input.enabled,
    command: "",
    url: planned.url,
    args: "",
    allowedToolNames: "",
    writeAllowedToolNames: "",
    // A brand-new oauth row structurally REQUIRES a grant (`external-mcp-store.ts`'s
    // `assertOAuthGrant`) even though nothing else is set — `authorization_code` is the only grant
    // Tovu's own RFC 8414/7591 discovery-then-DCR flow can complete without a device-code endpoint,
    // which the Agent Plugins spec has no field to declare anyway.
    ...(planned.authMode === "oauth" ? { oauth: { grant: "authorization_code" as const } } : {}),
    principalId: input.principalId,
  };
}

/**
 * Resolves one installed plugin's full, validated `mcp.json` server configs, given only its
 * `workspaceId`/`pluginId` — the pair a route naturally has, rather than the `packageRoot`
 * `readInstalledMcpServers` actually needs (`AgentPluginSearchCandidate`, the admin route's own read
 * model, deliberately never carries `packageRoot`: an absolute host path, per
 * `tool-registrations.ts`'s own header). Mirrors the identical `listInstalledPlugins` lookup
 * `set-enabled.ts`'s `setAgentPluginEnabled` already performs for its own installed-check — kept as
 * an independent, small duplication rather than widening that function's settled, tested return
 * shape just to smuggle a path through it.
 *
 * @returns `{}` for a plugin id not installed in this workspace — the caller (a route that already
 * 404s on that condition via `setAgentPluginEnabled`'s own precondition) never actually reaches this
 * case, but this function fails closed rather than throwing a second, redundant error for it.
 * @complexity O(d) in installed-digest count, plus one `mcp.json` read.
 */
export async function resolveAgentPluginMcpServers(input: {
  readonly workspaceId: string;
  readonly pluginId: string;
}): Promise<Readonly<Record<string, McpServerConfig>>> {
  const workspaceLayout = resolveAgentPluginLayout().forWorkspace(input.workspaceId);
  const installed = await listInstalledPlugins(workspaceLayout.packages);
  const plugin = installed.find((candidate) => candidate.pluginId === input.pluginId);
  return plugin ? readInstalledMcpServers(plugin.packageRoot) : {};
}

export interface ApplyAgentPluginMcpFederationInput {
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly servers: Readonly<Record<string, McpServerConfig>>;
  /** The plugin's OWN new activation state — an enable upserts (creates or reactivates) each row; a
   *  disable deactivates any that already exist, without inventing new ones (see this file's header
   *  addendum on the disable branch below). */
  readonly enabled: boolean;
  /** Attributed on the row exactly as an operator's own Settings → External MCP save would be —
   *  `saveExternalMcpServer`'s own `principalId` doc. */
  readonly principalId: string;
}

export interface ApplyAgentPluginMcpFederationResult {
  readonly applied: readonly string[];
  readonly skipped: readonly SkippedAgentPluginMcpServer[];
  readonly failed: readonly SkippedAgentPluginMcpServer[];
}

/**
 * Applies one plugin activation/deactivation decision to the external-MCP store: upserts a row per
 * auto-admitted remote server the plugin declares.
 *
 * On DISABLE, a connection id that has no existing row is skipped rather than created — there is
 * nothing useful about materializing a disabled, never-authorized row for a server the operator
 * never actually turned on, and doing so would clutter Settings → External MCP with dead rows for
 * every plugin anyone has ever merely installed.
 *
 * Per-server failures (a store validation error, an unconfigured secret store) are caught and
 * reported rather than thrown, matching `readEnabledExternalMcpConfigs`'s own fail-open posture: one
 * unwritable row must not stop every other server in the same plugin, or the plugin's own activation,
 * from succeeding.
 *
 * @complexity O(s) in the plugin's declared server count, each one save-or-skip round trip.
 */
export async function applyAgentPluginMcpFederation(
  deps: ExternalMcpStoreDeps,
  input: ApplyAgentPluginMcpFederationInput,
): Promise<ApplyAgentPluginMcpFederationResult> {
  const plan = planAgentPluginMcpFederation(input);
  const applied: string[] = [];
  const failed: SkippedAgentPluginMcpServer[] = [];

  for (const planned of plan.toUpsert) {
    if (!input.enabled) {
      const existing = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: planned.connectionId });
      if (!existing) continue;
    }

    try {
      await saveExternalMcpServer(deps, buildFederatedMcpSaveInput(planned, input));
      applied.push(planned.connectionId);
    } catch (err) {
      failed.push({ serverKey: planned.serverKey, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { applied, skipped: plan.skipped, failed };
}
