import type { UUID } from "@jini-ai/core/primitives";
import type { AuthorizeFn } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../features/webhooks/index.js";

import type { SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

import { createFederatedCallConfirmer, type FederatedApprovalDeps } from "./external-mcp-call-confirmation.js";
import { createExternalMcpConnectionGate } from "../features/external-mcp/external-mcp-oauth.js";
import { type ExternalMcpOAuthService } from "../features/external-mcp/contracts.js";
import { readEnabledExternalMcpConfigs, toResolvedFederatedConnections } from "../features/external-mcp/external-mcp-store.js";
import { type ExternalMcpOAuthTokenResolverPort, type ExternalMcpServerConfig, type ExternalMcpServerRepoPort } from "../features/external-mcp/contracts.js";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";
import type { McpAuthFailedError } from "@jini-ai/mcp/federation";
import type { FederationDeps } from "./mcp-federation/registrations.js";
import { DESKTOP_MCP_ID } from "./desktop-mcp-runtime.js";

/**
 * @file Shared stored-roster resolution and federation dependency binding for daemon and BYOK.
 * Each composition supplies its own log prefix so process-specific diagnostics remain identifiable.
 */

/** One roster-read failure, in the shape both the daemon's admissions route and BYOK's refusal
 *  diagnosis already expect. */
export interface StoredExternalMcpConnectionFailure {
  readonly connectionId: string;
  readonly reason: string;
}

/** Local manifest lookup port; remote annotations never grant read authority. */
type ResolvePluginReadOnlyRemoteNames = (input: {
  readonly agentPluginLayout: import("../features/agent-plugins/layout.js").AgentPluginLayout;
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly serverId: string;
  readonly url: string;
}, optional?: Record<string, never>) => Promise<ReadonlySet<string>>;

export interface StoredExternalMcpConnectionSourceDeps {
  readonly isPluginEnabled?: (pluginId: string) => Promise<boolean>;
  readonly agentPluginLayout: import("../features/agent-plugins/layout.js").AgentPluginLayout;
  readonly repo: ExternalMcpServerRepoPort;
  readonly sealer: SecretSealerPort;
  /** Resolves (and refreshes, if due) an `authMode: "oauth"` row's access token before its child
   *  process is launched with it. Omitted where no root wires OAuth-backed connections. */
  readonly oauth?: ExternalMcpOAuthTokenResolverPort;
  readonly workspaceId: UUID;
  /** Log-line prefix (`"[agent-daemon]"`, `"[assistant-byok]"`, ...) identifies the composition root. */
  readonly log: string;
  /** Local manifest lookup, never remote annotations. Injected to exercise roster reloads. */
  readonly resolvePluginReadOnlyRemoteNames?: ResolvePluginReadOnlyRemoteNames;
  /** The spawning desktop owns its exact legacy stdio identity. No label-based cleanup. */
  readonly desktopOwned?: boolean;
}

export interface StoredExternalMcpConnectionSource {
  /**
   * Reads the workspace's enabled external-MCP roster and resolves it into federation's launch
   * shape. Never rejects: a read failure (the whole call throwing) or a per-row resolution failure
   * both fall back to an empty connection list, with the failure logged and recorded for
   * {@link StoredExternalMcpConnectionSource.failures} instead of propagating.
   */
  resolve(): Promise<ResolvedFederatedConnection[]>;
  /**
   * The most recent call's per-row failures — REPLACED, not accumulated, on every {@link resolve}
   * call, so a stale failure from an earlier attempt never lingers next to a since-succeeded
   * connection. Empty before the first {@link resolve} call, and also after a call whose whole read
   * failed (a per-row failure could not be attributed in that case either).
   */
  failures(): readonly StoredExternalMcpConnectionFailure[];
}

/**
 * Loads stored launch configs and current bundled-plugin read declarations. Manifest lookup
 * failures omit read grants for that connection without removing usable connections.
 * @returns A reloadable source with the latest store-resolution failures.
 * @complexity O(c) configs plus one installed-package scan/manifest lookup per plugin connection;
 * O(c + r) output space for connection configs and read names. No remote I/O is added here.
 */
export function createStoredExternalMcpConnectionSource(
  deps: StoredExternalMcpConnectionSourceDeps,
): StoredExternalMcpConnectionSource {
  let configFailures: readonly StoredExternalMcpConnectionFailure[] = [];
  const isPluginEnabled = deps.isPluginEnabled ?? createPluginEnabledReader(deps);
  const resolvePluginReads = deps.resolvePluginReadOnlyRemoteNames ?? loadPluginReadOnlyRemoteNames;

  return {
    async resolve(): Promise<ResolvedFederatedConnection[]> {
      try {
        const repo = await withoutLegacyDesktop({ deps, isPluginEnabled });
        const { configs, failures } = await readEnabledExternalMcpConfigs(
          { repo, sealer: deps.sealer, oauth: deps.oauth },
          deps.workspaceId,
        );
        for (const failure of failures) {
          console.warn(`${deps.log} mcp-federation: stored server '${failure.serverId}' skipped — ${failure.reason}`);
        }
        configFailures = failures.map((failure) => ({ connectionId: failure.serverId, reason: failure.reason }));
        return toResolvedFederatedConnections(configs, await pluginReadOnlyNames({ deps, configs, resolvePluginReads }));
      } catch (error) {
        console.warn(
          `${deps.log} mcp-federation: the stored external-MCP roster could not be read, continuing without it — ${errorDetail(error)}`,
        );
        configFailures = [];
        return [];
      }
    },
    failures(): readonly StoredExternalMcpConnectionFailure[] {
      return configFailures;
    },
  };
}

/** Never launch the retired desktop stdio identity, even in a web-only server. An owned desktop
 * launch also removes its exact managed row before secrets/OAuth resolution can touch it.
 * Filtering fails closed if deletion fails; other rows retain their repository behavior.
 * @complexity One indexed lookup/delete, then O(c) filtering of the existing bounded roster. */
async function withoutLegacyDesktop({ deps, isPluginEnabled }: { deps: StoredExternalMcpConnectionSourceDeps; isPluginEnabled: (pluginId: string) => Promise<boolean> }, _options = {}): Promise<ExternalMcpServerRepoPort> {
  const legacy = (row: { serverId: string; transport: string }) => row.serverId === DESKTOP_MCP_ID && row.transport === "stdio";
  if (deps.desktopOwned) {
    try {
      const row = await deps.repo.findByServerId({ workspaceId: deps.workspaceId, serverId: DESKTOP_MCP_ID });
      if (row && legacy(row)) await deps.repo.deleteByServerId({ workspaceId: deps.workspaceId, serverId: DESKTOP_MCP_ID });
    } catch { console.warn(`${deps.log} legacy desktop MCP cleanup unavailable; stdio admission suppressed`); }
  }
  return {
    listByWorkspaceId: async workspaceId => {
      const rows = (await deps.repo.listByWorkspaceId(workspaceId)).filter(row => !legacy(row));
      const visible = await Promise.all(rows.map(async row => !row.provisionedByPluginId || await isPluginEnabled(row.provisionedByPluginId)));
      return rows.filter((_row, index) => visible[index]);
    },
    findByServerId: input => deps.repo.findByServerId(input),
    upsert: record => deps.repo.upsert(record),
    deleteByServerId: input => deps.repo.deleteByServerId(input),
    tryClaimOAuthRefreshLease: input => deps.repo.tryClaimOAuthRefreshLease(input),
    releaseOAuthRefreshLease: input => deps.repo.releaseOAuthRefreshLease(input),
  };
}

/** Keep the host activation adapter lazy to avoid the boot cycle. One stat per call;
 * activation contents are read only on a changed revision, shared by roster and call gates. */
function createPluginEnabledReader(inputs: Pick<StoredExternalMcpConnectionSourceDeps, 'agentPluginLayout' | 'workspaceId'>): (pluginId: string) => Promise<boolean> {
  let pluginReader: Promise<(pluginId: string) => Promise<boolean>> | undefined;
  return async pluginId => {
    pluginReader ??= import('../features/agent-plugins/activation-effects.js').then(({ createAgentPluginEnabledReader }) =>
      createAgentPluginEnabledReader({ workspaceRoot: inputs.agentPluginLayout.forWorkspace(inputs.workspaceId).root }));
    return (await pluginReader)(pluginId);
  };
}

// Defer the plugin adapter until roster resolution: its provisioning half reaches the
// assistant barrel, so importing it eagerly would make this module part of that boot cycle.
async function loadPluginReadOnlyRemoteNames(
  input: Parameters<ResolvePluginReadOnlyRemoteNames>[0],
): ReturnType<ResolvePluginReadOnlyRemoteNames> {
  return (await import("../features/agent-plugins/federate-mcp.js")).resolveAgentPluginReadOnlyRemoteNames(input);
}

/** Read-only remote names for each plugin-provisioned remote connection; other connections get none.
 * @complexity O(c) configs plus one manifest lookup per plugin-provisioned remote connection. */
async function pluginReadOnlyNames({ deps, configs, resolvePluginReads }: {
  deps: StoredExternalMcpConnectionSourceDeps; configs: readonly ExternalMcpServerConfig[];
  resolvePluginReads: ResolvePluginReadOnlyRemoteNames;
}, _options = {}): Promise<Map<string, ReadonlySet<string>>> {
  const readOnlyNames = new Map<string, ReadonlySet<string>>();
  for (const config of configs) {
    if (!config.provisionedByPluginId || config.target.kind !== "streamable_http") continue;
    try {
      readOnlyNames.set(config.serverId, await resolvePluginReads({
        agentPluginLayout: deps.agentPluginLayout,
        workspaceId: deps.workspaceId,
        pluginId: config.provisionedByPluginId,
        serverId: config.serverId,
        url: config.target.url,
      }));
    } catch (error) {
      // Classification fails closed without dropping unrelated, otherwise usable connections.
      console.warn(`${deps.log} mcp-federation: plugin read declarations for '${config.serverId}' unavailable — ${errorDetail(error)}`);
    }
  }
  return readOnlyNames;
}

/** A thrown value's message for a diagnostic line. */
function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Builds the `FederationDeps` shared by the boot admission pass and every reload pass: the SAME
 * gate/failure-reporting wiring must back both, or a connection admitted by a reload could be held
 * to different liveness behaviour than one admitted at boot for no reason other than which pass
 * happened to register it (mirrors `agent-daemon-server.ts`'s own reasoning at `:1267-1270`).
 */
export function buildExternalMcpFederationDeps(inputs: {
  readonly agentPluginLayout: StoredExternalMcpConnectionSourceDeps['agentPluginLayout'];
  readonly isPluginEnabled?: (pluginId: string) => Promise<boolean>;
  readonly authorize: AuthorizeFn;
  readonly workspaceId: UUID;
  readonly repo: ExternalMcpServerRepoPort;
  /** When present, a live 401/403 mid-session records `needs_reauth` (so the gate below catches the
   *  NEXT call cheaply) and replaces the transport-shaped error with the gate's own terminal
   *  message. Absent, `onAuthFailed` is left unset — not set to a no-op — so `FederationDeps`'s own
   *  "propagate unchanged" default applies. */
  readonly oauth?: Pick<ExternalMcpOAuthService, "reportAuthFailure">;
  /**
   * G3: the exchange store the root's MCP-UI click route is mounted with. When present, every
   * federated tool that is not marked read-only asks the human on a per-call Confirm/Cancel card
   * (`external-mcp-call-confirmation.ts`). Absent, `confirmCall` is left unset and those tools are
   * refused at the call — fail closed, nothing is sent.
   */
  readonly surfaceExchanges?: SurfaceExchangeStore;
  /**
   * G3 remembered approvals: where "Allow for this chat" / "Always allow" are kept and how a run
   * finds its conversation (`external-mcp-call-confirmation.ts`). Only read when `surfaceExchanges`
   * is present. Absent parts are simply not offered on the card.
   */
  readonly approvals?: Omit<FederatedApprovalDeps, "workspaceId" | "authorize">;
}): FederationDeps {
  const isPluginEnabled = inputs.isPluginEnabled ?? createPluginEnabledReader(inputs);
  const assertConnectionUsable = createExternalMcpConnectionGate({
    workspaceId: inputs.workspaceId,
    repo: inputs.repo,
    isPluginEnabled,
  });
  const { oauth, surfaceExchanges } = inputs;
  return {
    authorize: inputs.authorize,
    workspaceId: inputs.workspaceId,
    assertConnectionUsable,
    ...(oauth
      ? { onAuthFailed: (connectionId: string, error: McpAuthFailedError) => oauth.reportAuthFailure(connectionId, error) }
      : {}),
    ...(surfaceExchanges
      ? {
          confirmCall: createFederatedCallConfirmer(
            { surfaceExchanges },
            { ...inputs.approvals, workspaceId: inputs.workspaceId, authorize: inputs.authorize },
          ),
        }
      : {}),
  };
}
