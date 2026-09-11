import { saveExternalMcpServer, type ExternalMcpStoreDeps } from "#src/assistant/index";

import { classifyAgentPluginMcpServerTrust, readInstalledMcpServers } from "./capability-projection.js";
import { resolveAgentPluginLayout } from "./layout.js";
import type { McpServerConfig } from "./manifest.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

/**
 * @file Phase 4 of the 2026-09-10 plugin-MCP-wiring work: PROVISIONS an activated Agent Plugin's
 * auto-admitted remote MCP servers as real rows in the SAME external-MCP store
 * (`assistant/external-mcp-store.ts`) Settings → External MCP already owns — reusing that path
 * rather than building a parallel one. A provisioned row appears in Settings → External MCP exactly
 * like an operator-typed one: the same allowlist/"may write" tool picker, the same enable toggle,
 * the same revoke button. There is no second, plugin-only registration path.
 *
 * ---------------------------------------------------------------------------
 * 2026-09-10, owner refinement — three collision rules, and why each exists
 * ---------------------------------------------------------------------------
 * A `higgsfield` row already exists on the live dev site with connected OAuth tokens, an allowlist,
 * and write grants — created by hand, by an operator following the bundled skill's old instructions,
 * before this file existed. That row is the concrete case every rule below defends:
 *
 * 1. **NEVER CLOBBER AN EXISTING ROW.** {@link provisionAgentPluginMcpServers} calls
 *    `deps.repo.findByServerId` BEFORE ever calling {@link saveExternalMcpServer}. If a row already
 *    exists at the derived id — for ANY reason: an operator's own hand-configured connection, or a
 *    row this same plugin provisioned on a previous enable — it is left COMPLETELY untouched and
 *    reported in {@link ProvisionAgentPluginMcpServersResult.alreadyProvisioned}. This is why
 *    {@link deriveAgentPluginConnectionId} below no longer hashes or namespaces the id: an id
 *    genuinely equal to what an operator would have hand-typed (the plugin's own declared server
 *    key, e.g. `higgsfield`) is what lets this rule protect the ACTUAL pre-existing row, not some
 *    other, uniquely-derived id that would silently create a second, redundant connection beside it.
 *    The trade this accepts: two different plugins declaring the identical server key in the same
 *    workspace will collide on id, and whichever is provisioned FIRST wins — the second's server is
 *    reported `alreadyProvisioned` and never gets its own row. That is an acceptable, narrow
 *    trade for matching exactly what manual creation would have produced, and it fails in the safe
 *    direction (a missed provision, never a stomped one).
 *    KNOWN RACE: the existence check and the create are not one atomic operation (no compare-and-set
 *    primitive exists on `ExternalMcpServerRepoPort` today, unlike `tryClaimOAuthRefreshLease`'s
 *    purpose-built one). Two concurrent provisioning attempts for the SAME id are harmless — both
 *    derive and would write the identical disabled/empty-allowlist config. A provisioning attempt
 *    racing an operator's concurrent hand-edit of the same id is the one real gap, and it is the
 *    same class of risk any two concurrent saves to this store already have — not a new one, but
 *    also not eliminated by this file. Closing it fully needs a new repo primitive, deliberately not
 *    added here as disproportionate to this feature's scope.
 *
 * 2. **SEED DISABLED, LIKE BUNDLED PLUGINS ALREADY DO.** Mirrors `activation.ts`'s
 *    `recordBundledAgentPluginIfAbsent`: idempotent, create-if-absent, and — because rule 1 already
 *    means an existing row is never revisited — a row this file created is never re-enabled by a
 *    later boot or a later plugin toggle either. `enabled: false` is passed on the ONE
 *    {@link saveExternalMcpServer} call that creates a brand-new row; there is no code path here that
 *    ever sets `enabled: true` on any row, new or existing.
 *
 * 3. **PROVISIONING IS NOT AUTHORIZATION.** `allowedToolNames`/`writeAllowedToolNames` are always
 *    `""` on a newly created row, even though a plugin's `mcp.json`/skill content might suggest
 *    names. A downloaded marketplace package must not be able to grant itself tool access — the same
 *    trust argument Phase 3's stdio split makes, applied here to the allowlist instead of to
 *    execution. The operator ticks tools in Settings → External MCP's picker, which already lets
 *    them choose from a live, server-advertised list (`probe.ts`) rather than guessing names.
 *
 * ---------------------------------------------------------------------------
 * What happens on plugin disable or uninstall: THE ROW SURVIVES
 * ---------------------------------------------------------------------------
 * Nothing in this file, and nothing this dispatch added to `set-enabled.ts` or
 * `features/agent-plugins/uninstall.ts`, ever deletes or disables a provisioned row when its plugin
 * is turned off or removed. This is a deliberate position, not an oversight: a provisioned row may
 * already hold OAuth tokens the operator earned through a real browser sign-in, and deleting an
 * external MCP connection is UNRECOVERABLE in this app (`project_external_mcp_delete_is_unrecoverable`
 * — no soft-delete, no undo). Silently destroying that on a disable/uninstall would be a strictly
 * worse failure mode than leaving an inert, disabled row behind. `provisioned_by_plugin_id`
 * (`schema.ts`) records which plugin created a surviving row, so a FUTURE uninstall flow can offer
 * to remove it explicitly — an operator decision, never an automatic side effect of this file.
 *
 * ---------------------------------------------------------------------------
 * What this does NOT do
 * ---------------------------------------------------------------------------
 * - Never touches a `stdio` server. `classifyAgentPluginMcpServerTrust` (`capability-projection.ts`)
 *   is consulted first, and only an `"auto-admit"` (remote) server ever reaches
 *   {@link saveExternalMcpServer}. There is no code path in this file that can launch a local
 *   process on a plugin's say-so — see Phase 3's own gate for the full argument.
 * - Never completes an OAuth handshake. `authMode: "oauth"` rows still need the operator's own
 *   browser-interactive consent (Higgsfield's authorization_code + PKCE flow has no other kind) —
 *   this file only makes sure the row EXISTS with the right URL and transport so that consent step
 *   is the operator's only remaining action.
 * - Does not run at request time and makes no live network call. Only the row's own data is
 *   written. The daemon's boot-time federation read (`resolveStoredExternalMcpConnections`) is what
 *   actually connects, and per that module's own doc, requires an assistant restart to pick up a
 *   newly-provisioned (and since-enabled) row.
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

/** `mcp-federation/trust.ts`'s `CONNECTION_ID_PATTERN` caps a connection id at 40 characters. */
const MAX_CONNECTION_ID_LENGTH = 40;

/**
 * Derives the `external_mcp_servers.serverId` one plugin-declared server maps to: its OWN declared
 * server key (the `mcp.json` object member name), sanitized into `CONNECTION_ID_PATTERN`'s
 * `[a-z0-9][a-z0-9-]{0,39}` charset — lowercased, every run of other characters collapsed to one
 * `-`, leading/trailing `-` trimmed, truncated to 40.
 *
 * Deliberately NOT namespaced by `pluginId` and NOT hash-suffixed (an earlier revision of this file
 * did both, for collision safety) — see this file's header, rule 1: the id must equal what an
 * operator would have hand-typed, because matching that exact id is what lets a pre-existing,
 * hand-configured row (e.g. `higgsfield`) be recognized and left untouched rather than shadowed by a
 * second, uniquely-derived connection beside it.
 *
 * @returns The derived id, or `null` when the server key sanitizes to nothing usable (e.g. a key
 * made entirely of characters outside `[a-z0-9-]`) — reported as a skip by
 * {@link classifyAgentPluginMcpServerForFederation}, never thrown.
 * @complexity O(n) in the server key's length.
 */
export function deriveAgentPluginConnectionId(serverKey: string): string | null {
  const sanitized = serverKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CONNECTION_ID_LENGTH)
    .replace(/-+$/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

/** One server this plugin declared that {@link planAgentPluginMcpFederation} will not attempt to
 *  provision, and why — reported rather than silently dropped, matching `mcp-federation/trust.ts`'s
 *  own "every refusal is reportable, never silent" discipline. */
export interface SkippedAgentPluginMcpServer {
  readonly serverKey: string;
  readonly reason: string;
}

/** One server {@link planAgentPluginMcpFederation} determined should be provisioned (subject to
 *  rule 1's existence check at apply time). Carries the derived id and the resolved config, but not
 *  yet `workspaceId`/`principalId` — those are per-CALL, not per-server. */
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

/** One server's classification result — either it is planned for provisioning, or it is skipped
 *  with a reason. Split out of {@link planAgentPluginMcpFederation}'s loop so that function has
 *  exactly one branch point per entry instead of several sequential early-exits.
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

  const connectionId = deriveAgentPluginConnectionId(serverKey);
  if (connectionId === null) {
    return { kind: "skip", reason: `server key '${serverKey}' has no valid characters to derive a connection id from` };
  }

  return { kind: "upsert", planned: { connectionId, serverKey, url: config.url, authMode: config.tovuAuthMode ?? "none" } };
}

/**
 * Pure classification pass over one plugin's full mcp.json server configs — no I/O, no
 * `saveExternalMcpServer` call, so this is independently testable from the store's own DB-shaped
 * dependencies.
 *
 * @complexity O(s) in the declared server count.
 */
export function planAgentPluginMcpFederation(input: {
  readonly servers: Readonly<Record<string, McpServerConfig>>;
}): AgentPluginMcpFederationPlan {
  const toUpsert: PlannedAgentPluginMcpUpsert[] = [];
  const skipped: SkippedAgentPluginMcpServer[] = [];

  for (const [serverKey, config] of Object.entries(input.servers)) {
    const result = classifyAgentPluginMcpServerForFederation(serverKey, config);
    if (result.kind === "upsert") toUpsert.push(result.planned);
    else skipped.push({ serverKey, reason: result.reason });
  }

  return { toUpsert, skipped };
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

export interface ProvisionAgentPluginMcpServersInput {
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly servers: Readonly<Record<string, McpServerConfig>>;
  /** Attributed on the row exactly as an operator's own Settings → External MCP save would be —
   *  `saveExternalMcpServer`'s own `principalId` doc. */
  readonly principalId: string;
}

export interface ProvisionAgentPluginMcpServersResult {
  /** Connection ids for which a brand-new, disabled row was created this call. */
  readonly provisioned: readonly string[];
  /** Connection ids that already had a row (operator-created or provisioned earlier) and were left
   *  completely untouched — rule 1. */
  readonly alreadyProvisioned: readonly string[];
  readonly skipped: readonly SkippedAgentPluginMcpServer[];
  readonly failed: readonly SkippedAgentPluginMcpServer[];
}

/** Builds the ONE-TIME creation input for a planned server that rule 1's existence check already
 *  confirmed has no row yet. Split out of {@link provisionAgentPluginMcpServers} purely to keep that
 *  function's complexity under the shop ceiling. `enabled: false` and empty allowlists are rules 2
 *  and 3 — see this file's header. */
function buildProvisioningSaveInput(
  planned: PlannedAgentPluginMcpUpsert,
  input: { readonly workspaceId: string; readonly pluginId: string; readonly principalId: string },
) {
  return {
    workspaceId: input.workspaceId,
    serverId: planned.connectionId,
    label: `${input.pluginId} · ${planned.serverKey}`,
    transport: "streamable_http" as const,
    authMode: planned.authMode,
    enabled: false,
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
    provisionedByPluginId: input.pluginId,
  };
}

/**
 * Idempotently provisions one plugin's auto-admitted remote MCP servers into the external-MCP
 * store, called when an operator ENABLES the plugin (never on disable — see this file's header:
 * disabling a plugin has no effect on any row).
 *
 * Rule 1 is enforced per server, right here: `deps.repo.findByServerId` runs BEFORE any write, and a
 * hit means this server is reported `alreadyProvisioned` and `saveExternalMcpServer` is never
 * called for it — no field of an existing row, however it got there, is ever touched by this
 * function.
 *
 * Per-server failures (a store validation error, an unconfigured secret store) are caught and
 * reported rather than thrown, matching `readEnabledExternalMcpConfigs`'s own fail-open posture: one
 * unwritable row must not stop every other server in the same plugin, or the plugin's own
 * activation, from succeeding.
 *
 * @complexity O(s) in the plugin's declared server count, each one an existence check plus at most
 * one create.
 */
export async function provisionAgentPluginMcpServers(
  deps: ExternalMcpStoreDeps,
  input: ProvisionAgentPluginMcpServersInput,
): Promise<ProvisionAgentPluginMcpServersResult> {
  const plan = planAgentPluginMcpFederation(input);
  const provisioned: string[] = [];
  const alreadyProvisioned: string[] = [];
  const failed: SkippedAgentPluginMcpServer[] = [];

  for (const planned of plan.toUpsert) {
    const existing = await deps.repo.findByServerId({ workspaceId: input.workspaceId, serverId: planned.connectionId });
    if (existing) {
      alreadyProvisioned.push(planned.connectionId);
      continue;
    }

    try {
      await saveExternalMcpServer(deps, buildProvisioningSaveInput(planned, input));
      provisioned.push(planned.connectionId);
    } catch (err) {
      failed.push({ serverKey: planned.serverKey, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { provisioned, alreadyProvisioned, skipped: plan.skipped, failed };
}
