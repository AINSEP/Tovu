import type {
  AdminComposioConfig,
  AdminConnector,
  AdminExecutionCredential,
  AdminExecutionCredentialPatch,
  AdminExternalMcpServer,
  AdminMediaProviderMap,
  SiteAssistantCredential,
  SiteAssistantCredentialPatch,
} from "@/lib/api";

/**
 * @file What `useOtherCredentials` needs from the outside world, as an interface rather than a
 * direct `lib/api` import — same `useX(dependencies)` / `useWiredX()` shape
 * `access-tokens-port.hooks.ts` uses for Tier 1. Six methods (or method pairs), one per Tier-2 store
 * (`rules.ts`'s `OTHER_CREDENTIAL_STORES`), every one of them a thin bind onto an `api.*` call that
 * ALREADY exists and already backs a real settings screen — this page adds no new HTTP surface here
 * either, only a second reader (and, for four of the six, a second writer) of the same endpoints.
 *
 * Deliberately not one generic `get`/`set`/`remove` trio: the six stores return six genuinely
 * different shapes (a single write-only credential view, a provider-keyed map, a marker-only config,
 * a connector list, a server list), and a generic signature would just move that difference into a
 * runtime `unknown` cast at every call site — the same reasoning `AccessTokensPort` gives for keeping
 * `publish`/`sourceControl` as two flat method groups instead of one.
 */
export interface OtherCredentialsPort {
  getSiteAssistantCredential(): Promise<{ data: SiteAssistantCredential }>;
  setSiteAssistantCredential(patch: SiteAssistantCredentialPatch): Promise<{ data: SiteAssistantCredential }>;
  deleteSiteAssistantCredential(): Promise<{ data: SiteAssistantCredential }>;

  getAdminByokCredential(): Promise<{ data: AdminExecutionCredential }>;
  setAdminByokCredential(patch: AdminExecutionCredentialPatch): Promise<{ data: AdminExecutionCredential }>;
  deleteAdminByokCredential(): Promise<{ data: AdminExecutionCredential }>;

  getMediaProviders(): Promise<AdminMediaProviderMap>;
  /** Sends the WHOLE map — a provider absent from `providers` is deleted server-side (`put-providers.ts`'s
   *  own doc), so a caller replacing or removing ONE provider's key must still round-trip every other
   *  provider's own entry unchanged. See `use-other-credentials.hooks.ts`'s `replaceMediaProviderKey`/
   *  `removeMediaProviderKey` for where that reconstruction happens. */
  saveMediaProviders(providers: AdminMediaProviderMap): Promise<AdminMediaProviderMap>;

  getComposioConfig(): Promise<AdminComposioConfig>;
  /** A string replaces the key; `null` clears it — the same "one call does both Replace and Remove"
   *  shape `api.saveComposioConfig` already has. */
  saveComposioConfig(apiKey: string | null): Promise<AdminComposioConfig>;

  /** The static connector catalog (names, no live call) — paired with {@link getConnectorStatuses}
   *  for the live per-connector state, rather than `api.listConnectors(true)`'s heavier live refetch,
   *  since this page only needs to REPORT existing connections, not re-authorize anything. */
  listConnectors(): Promise<{ connectors: AdminConnector[] }>;
  getConnectorStatuses(): Promise<Record<string, { status: string; accountLabel?: string; lastError?: string }>>;
  disconnectConnector(connectorId: string): Promise<AdminConnector>;

  listExternalMcpServers(): Promise<{ servers: AdminExternalMcpServer[] }>;
  deleteExternalMcpServer(serverId: string): Promise<{ removed: boolean; restartRequired: boolean }>;
}
