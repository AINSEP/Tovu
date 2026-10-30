/** Assistant-owned host ports; server composition supplies their implementations. */
import type { Principal, ToolRegistration } from '@jini-ai/core';
import type { AuthorizeFn } from '@jini-ai/cms/core';
import type { ChatStoreFactory } from './persistence/tenant-scope.js';

export type { ProviderConfigSource } from '@jini-ai/plugins/host';

/** Registered local source identity, shared with the host's discovery adapter. */
export type RegisteredSiteSource = { siteId: string; name: string; dir: string };
type BuildRegistrations<TDeps> = (deps: TDeps) => ToolRegistration[];
type PeerResolution = { handler: ToolRegistration['handler']; principal: Principal; site: RegisteredSiteSource };

export interface PeerSiteReads<TDeps> {
  /** Host-owned scope policy keeps the assistant free of runtime imports of server composition. */
  readonly readDomains: ReadonlySet<string>;
  /** Single reads refused inside an otherwise cross-site domain. */
  readonly excludedReadTools?: ReadonlySet<string>;
  /** Exact registry-name comparison; never opens a database. Throws a path-free local-host/registry refusal. */
  isCurrentSite(required: { siteName: string }, optional?: Record<string, never>): boolean;
  /** The caller adapter gates installation ownership. The builder must return only allowlisted
   * read registrations; resolution supplies the target's attenuated owner and fixed refusals.
   */
  resolve(required: { siteName: string; toolId: string; callerPrincipalId: string; buildRegistrations: BuildRegistrations<TDeps> }, optional?: Record<string, never>): Promise<'current' | PeerResolution>;
  /** Drain active handlers, cancel idle timers and close all cached handles. Idempotent. */
  close(): Promise<void>;
}

/** The host factory already returns Jini's owner-scoped ChatHistoryStore contract. */
export interface AssistantHistoryHostDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  chatHistory: ChatStoreFactory;
}

export type { AutomaticPluginDeps } from '../features/agent-plugins/automatic-agent-plugins.js';
