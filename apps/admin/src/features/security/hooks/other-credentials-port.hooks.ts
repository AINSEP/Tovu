import type {
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
 * `access-tokens-port.hooks.ts` uses for Tier 1. One method group per Tier-2 store
 * (`rules.ts`'s `OTHER_CREDENTIAL_STORES`), every one of them a thin bind onto an `api.*` call that
 * ALREADY exists and already backs a real settings screen — this page adds no new HTTP surface here
 * either, only a second reader (and, for three of the four, a second writer) of the same endpoints.
 *
 * Deliberately not one generic `get`/`set`/`remove` trio: the four stores return genuinely
 * different shapes (a single write-only credential view, a provider-keyed map, a server list), and a generic signature would just move that difference into a
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

  listExternalMcpServers(): Promise<{ servers: AdminExternalMcpServer[] }>;
  deleteExternalMcpServer(serverId: string): Promise<{ removed: boolean; restartRequired: boolean }>;
}
