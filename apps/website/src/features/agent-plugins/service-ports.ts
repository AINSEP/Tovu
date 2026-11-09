/** Consumer-owned service boundaries. Composition binds concrete services and secret stores. */
import type { ChatAgentPlugins } from "@jini-ai/agent-plugins/lifecycle";
import type { SurfaceCardsPort, SurfaceCardSecretForm as SecretCardForm } from "@jini-ai/core/contracts/cards";
import type { ExternalMcpConnectStart } from "../external-mcp/contracts.js";
import type { AgentPluginMcpPort as PortableAgentPluginMcpPort, AgentPluginMcpProjectionPorts, AgentPluginMcpServicesPort as PortableAgentPluginMcpServicesPort } from "@jini-ai/agent-plugins/connect";
/** The MCP ports moved to `@jini-ai/agent-plugins/connect` (A9); re-exported so Tovu callers keep this path,
 * bound to Tovu's tool-access change record. */
export type { AgentPluginMcpRecord, AgentPluginMcpSave, AgentPluginMcpView, AgentPluginMcpRepo, AgentPluginMcpAccessSnapshot, AgentPluginMcpProjections, AgentPluginMcpProjectionPorts } from "@jini-ai/agent-plugins/connect";
export type AgentPluginMcpPort = PortableAgentPluginMcpPort<import("@jini-ai/daemon").ToolAccessChange>;
export type AgentPluginMcpServicesPort = PortableAgentPluginMcpServicesPort<import("@jini-ai/daemon").ToolAccessChange>;
import type { PluginCredentialCard } from "@jini-ai/core/contracts/credentials";
import type { DeclaredApiConnection } from "../api-connections/contribution.js";
import type { ApiConnectionConnectStatus } from "../api-connections/connect.js";


/** Connect-time OAuth discovery and the existing validation error identity, adapted by composition. */
export interface AgentPluginOAuthPort {
  beginConnect(input: { serverId: string; redirectUri?: string; delivery?: "hosted" }, options?: Record<string, never>): Promise<ExternalMcpConnectStart>;
  /** @agent-note Same rule as {@link AgentPluginSignInPort.isSignInRefusal}: true only for a refusal
   * that opened no card (the key-card fallback is offered); every other fault propagates unchanged. */
  isSignInRefusal(input: { error: unknown }, options?: Record<string, never>): boolean;
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
  /** Effective mode plus the addressed personal layer's revision, fixed before the approval. */
  snapshot(input: { workspaceId: string; principalId: string }, options?: Record<string, never>): Promise<{ mode: ChatAgentPlugins; revisionSeq: number }>;
  saveAuto(input: { workspaceId: string; principalId: string; expectedRevisionSeq?: number }, options?: Record<string, never>): Promise<void>;
}

/** Declared API connections; the host retains OAuth clients, browser binding and token custody. */
export interface AgentPluginApiConnectionsPort {
  readonly sharingAvailable?: boolean;
  listConnections(input: { pluginId: string }, options?: Record<string, never>): Promise<readonly DeclaredApiConnection[]>;
  connect(input: { destination?: 'site' | 'shared'; connection: DeclaredApiConnection; actorId: string; signal: AbortSignal; pollIntervalMs: number; waitTimeoutMs: number; showSignIn: (input: { readonly signInUrl: string }) => Promise<void> }, options?: Record<string, never>): Promise<ApiConnectionConnectStatus>;
}

/** Resolved host paths; consumers take only the facts they need. */
export interface AgentPluginPathsPort {
  readonly siteDir: string;
  readonly bundledSourceRoot: string;
}

/** Old Tovu entry signatures only: custom projections always come with their classifier. */
export type AgentPluginMcpContext = AgentPluginMcpProjectionPorts | { readonly projections?: undefined; readonly classifyError?: AgentPluginMcpPort['classifyError'] };
export interface AgentPluginSignInPort {
  readonly beginConnect: AgentPluginOAuthPort['beginConnect'];
  /** @agent-note True only for a refusal that opened NO card, so chat offers the key-card fallback;
   * any other fault returns false and propagates unchanged. Matching does not make a message safe:
   * the consumer passes model-facing text through the core redaction boundary. */
  isSignInRefusal(required: { error: unknown }, optional?: Record<string, never>): boolean;
}
/** Resource stays concrete through waitAtSignInCard's card callback. */
export type AgentPluginCardsPort<Resource> = SurfaceCardsPort<Resource>;
export type AgentPluginCardBuilders<Resource> = Omit<AgentPluginCardsPort<Resource>, 'waitAtSignInCard'>;
