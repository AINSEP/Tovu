import type { AuthorizeFn, UUID } from "@jini-ai/cms/core";

import type { SecretSealerPort } from "../features/webhooks/index.js";

import { createExternalMcpConnectionGate, type ExternalMcpOAuthService } from "./external-mcp-oauth.js";
import {
  readEnabledExternalMcpConfigs,
  toResolvedFederatedConnections,
  type ExternalMcpOAuthTokenResolverPort,
  type ExternalMcpServerRepoPort,
} from "./external-mcp-store.js";
import type { ResolvedFederatedConnection } from "./mcp-federation/config.js";
import type { McpAuthFailedError } from "./mcp-federation/mcp-protocol.js";
import type { FederationDeps } from "./mcp-federation/registrations.js";

/**
 * @file The stored-roster half of `design-byok-external-mcp-2026-09-24.md` §2.1 piece 1: what used
 * to be `agent-daemon-server.ts`'s private `resolveStoredExternalMcpConnections` (`:1233-1262`) plus
 * the module-level `externalMcpConfigFailures` binding it wrote (`:1231`), and the `federationDeps`
 * object literal from that same file's `start()` (`:1271-1289`). Moved unchanged apart from the log
 * prefix, which becomes a parameter so BYOK's `[assistant-byok]` lines and the daemon's
 * `[agent-daemon]` lines both stay byte-identical to what each already printed.
 */

/** One roster-read failure, in the shape both the daemon's admissions route and BYOK's refusal
 *  diagnosis already expect. */
export interface StoredExternalMcpConnectionFailure {
  readonly connectionId: string;
  readonly reason: string;
}

export interface StoredExternalMcpConnectionSourceDeps {
  readonly repo: ExternalMcpServerRepoPort;
  readonly sealer: SecretSealerPort;
  /** Resolves (and refreshes, if due) an `authMode: "oauth"` row's access token before its child
   *  process is launched with it. Omitted where no root wires OAuth-backed connections. */
  readonly oauth?: ExternalMcpOAuthTokenResolverPort;
  readonly workspaceId: UUID;
  /** Log-line prefix (`"[agent-daemon]"`, `"[assistant-byok]"`, ...), so each root's console output
   *  stays exactly what it was before this moved out from under it. */
  readonly log: string;
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

export function createStoredExternalMcpConnectionSource(
  deps: StoredExternalMcpConnectionSourceDeps,
): StoredExternalMcpConnectionSource {
  let configFailures: readonly StoredExternalMcpConnectionFailure[] = [];

  return {
    async resolve(): Promise<ResolvedFederatedConnection[]> {
      try {
        const { configs, failures } = await readEnabledExternalMcpConfigs(
          { repo: deps.repo, sealer: deps.sealer, oauth: deps.oauth },
          deps.workspaceId,
        );
        for (const failure of failures) {
          console.warn(`${deps.log} mcp-federation: stored server '${failure.serverId}' skipped — ${failure.reason}`);
        }
        configFailures = failures.map((failure) => ({ connectionId: failure.serverId, reason: failure.reason }));
        return toResolvedFederatedConnections(configs);
      } catch (error) {
        console.warn(
          `${deps.log} mcp-federation: the stored external-MCP roster could not be read, continuing without it — ${error instanceof Error ? error.message : String(error)}`,
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

/**
 * Builds the `FederationDeps` shared by the boot admission pass and every reload pass: the SAME
 * gate/failure-reporting wiring must back both, or a connection admitted by a reload could be held
 * to different liveness behaviour than one admitted at boot for no reason other than which pass
 * happened to register it (mirrors `agent-daemon-server.ts`'s own reasoning at `:1267-1270`).
 */
export function buildExternalMcpFederationDeps(inputs: {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: UUID;
  readonly repo: ExternalMcpServerRepoPort;
  /** When present, a live 401/403 mid-session records `needs_reauth` (so the gate below catches the
   *  NEXT call cheaply) and replaces the transport-shaped error with the gate's own terminal
   *  message. Absent, `onAuthFailed` is left unset — not set to a no-op — so `FederationDeps`'s own
   *  "propagate unchanged" default applies. */
  readonly oauth?: Pick<ExternalMcpOAuthService, "reportAuthFailure">;
}): FederationDeps {
  const assertConnectionUsable = createExternalMcpConnectionGate({
    workspaceId: inputs.workspaceId,
    repo: inputs.repo,
  });
  if (!inputs.oauth) {
    return { authorize: inputs.authorize, workspaceId: inputs.workspaceId, assertConnectionUsable };
  }
  const oauth = inputs.oauth;
  return {
    authorize: inputs.authorize,
    workspaceId: inputs.workspaceId,
    assertConnectionUsable,
    onAuthFailed: (connectionId: string, error: McpAuthFailedError) => oauth.reportAuthFailure(connectionId, error),
  };
}
