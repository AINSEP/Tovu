/** Consumer-owned service boundaries. Composition binds concrete services and secret stores. */
import type { ChatAgentPlugins } from "@jini-ai/agent-plugins/lifecycle";
import type { SecretCardForm } from "@jini-ai/ui/mcp-ui/secret-card";
import type { ExternalMcpConnectStart, ExternalMcpServerRepoPort, ExternalMcpServerView, SaveExternalMcpServerInput } from "../external-mcp/contracts.js";
import type { PluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import type { DeclaredApiConnection } from "../api-connections/contribution.js";
import type { ApiConnectionConnectStatus } from "../api-connections/connect.js";

/** Roster persistence and safe classification; sealing/keyring dependencies stay in composition. */
export interface AgentPluginMcpPort {
  readonly repo: Pick<ExternalMcpServerRepoPort, "findByServerId" | "upsert" | "deleteByServerId">;
  saveServer(input: SaveExternalMcpServerInput, options?: Record<string, never>): Promise<ExternalMcpServerView>;
  classifyError(input: { error: unknown }, options?: Record<string, never>): "validation" | "unconfigured" | "other";
  notifyRosterChanged(input: Record<string, never>, options?: Record<string, never>): Promise<void>;
}

/** Connect-time OAuth discovery and the existing validation error identity, adapted by composition. */
export interface AgentPluginOAuthPort {
  beginConnect(input: { serverId: string; redirectUri?: string }, options?: Record<string, never>): Promise<ExternalMcpConnectStart>;
  isValidationError(input: { error: unknown }, options?: Record<string, never>): boolean;
}

/** Plugin-declared credential cards and the guarded, read-only token probe. */
export interface PluginCredentialsPort {
  apply(input: { card?: PluginCredentialCard; form: SecretCardForm }, options?: Record<string, never>): SecretCardForm;
  loadSafe(input: { workspaceId: string }, options?: Record<string, never>): Promise<readonly PluginCredentialCard[]>;
  find(input: { workspaceId: string; saveKind: PluginCredentialCard["saveKind"]; target: string }, options?: Record<string, never>): Promise<PluginCredentialCard | undefined>;
  probe(input: { probeUrl: string; token: string }, options?: Record<string, never>): Promise<"ok" | "refused" | "unavailable">;
}

/** Effective operator preferences with principal resolution supplied by the host. */
export interface AgentPluginPreferencesPort {
  locale(input: { workspaceId: string; principalId: string }, options?: Record<string, never>): Promise<string>;
  /** Anything but the stored Ask or Off preference (including no value) resolves to Auto. */
  mode(input: { workspaceId: string; principalId: string }, options?: Record<string, never>): Promise<ChatAgentPlugins>;
  saveAuto(input: { workspaceId: string; principalId: string }, options?: Record<string, never>): Promise<void>;
}

/** Declared API connections; the host retains OAuth clients, browser binding and token custody. */
export interface AgentPluginApiConnectionsPort {
  listConnections(input: { pluginId: string }, options?: Record<string, never>): Promise<readonly DeclaredApiConnection[]>;
  connect(input: { connection: DeclaredApiConnection; actorId: string; signal: AbortSignal; pollIntervalMs: number; waitTimeoutMs: number; showSignIn: (input: { readonly signInUrl: string }) => Promise<void> }, options?: Record<string, never>): Promise<ApiConnectionConnectStatus>;
}

/** Resolved host paths; consumers take only the facts they need. */
export interface AgentPluginPathsPort {
  readonly siteDir: string;
  readonly bundledSourceRoot: string;
}
