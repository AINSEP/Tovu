/** Tovu's admin transport projection of Jini-admitted providers and the site's chart preference. */
import { getEffective, type SettingsRepoPort } from "@jini-ai/core/settings";
import { CHART_TABLE_PROVIDER } from "@jini-ai/ui/charts";
import type { AdmittedBrowserProvider, BrowserProviderAsset } from "@jini-ai/plugins/host";
import type { AdminChartProviderSnapshot } from "#src/contracts/headless/index";

/** Build an immutable asset address without exposing a filesystem path.
 * @returns A workspace-scoped address matched only against admitted in-memory assets.
 * @complexity O(1), the reviewed asset paths have a fixed, bounded length.
 * @example chartProviderAssetUrl({ workspaceId, provider, asset });
 */
export function chartProviderAssetUrl(
  { workspaceId, provider, asset }: { workspaceId: string; provider: AdmittedBrowserProvider; asset: BrowserProviderAsset },
  _options: Record<string, never> = {},
): string {
  return `/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/chart-providers/assets/` +
    [provider.pluginId, provider.version, asset.digest, asset.path.split("/").at(-1)!].map(encodeURIComponent).join("/");
}

/** The site's chart preference: a stored (operator-set) value wins; otherwise the provider the host
 * injected; otherwise the core table. The definition's own default layer is ignored on purpose, so
 * core never names a chart library: the host that selects a provider plugin also names the default.
 * @complexity O(1), one effective setting read.
 */
async function readSiteChartProvider(
  { workspaceId, settingsRepo, defaultProvider }: { workspaceId: string; settingsRepo: SettingsRepoPort; defaultProvider: string | undefined },
  _options: Record<string, never> = {},
): Promise<string> {
  const setting = await getEffective({ repo: settingsRepo }, { namespace: "core.charts", key: "provider", scopeContext: { workspaceId } });
  const stored = setting?.sourceLayer !== "default" && typeof setting?.value === "string" ? setting.value : undefined;
  return stored ?? defaultProvider ?? CHART_TABLE_PROVIDER;
}

/** Read the workspace layer through the existing ledger; user preferences cannot change site policy.
 * `defaultProvider` is required so every host decides it: Tovu passes its selected Recharts provider,
 * a host without one passes `undefined` and gets the core table.
 * @returns Serializable admitted metadata, with a generation covering activation and preference.
 * @throws Propagates ledger failures; callers retain the core table instead of executing guessed assets.
 * @complexity O(p + a) projection for admitted providers p and assets a, plus one effective setting read.
 * @example readAdminChartProviderSnapshot({ workspaceId, settingsRepo, browserProviders, defaultProvider: RECHARTS_DEFAULT_PROVIDER });
 */
export async function readAdminChartProviderSnapshot(
  { workspaceId, settingsRepo, browserProviders, defaultProvider }: {
    workspaceId: string; settingsRepo: SettingsRepoPort;
    browserProviders: (input: Record<string, never>, options?: Record<string, never>) => { generation: number; providers: readonly AdmittedBrowserProvider[] };
    defaultProvider: string | undefined;
  }, _options: Record<string, never> = {},
): Promise<AdminChartProviderSnapshot> {
  const siteProvider = await readSiteChartProvider({ workspaceId, settingsRepo, defaultProvider });
  const admitted = browserProviders({});
  const providers = admitted.providers.map((provider) => {
    const javascript = provider.assets.find((asset) => asset.path === provider.declaration.javascript)!;
    const stylesheet = provider.assets.find((asset) => asset.path === provider.declaration.stylesheet);
    return { id: provider.declaration.id, kinds: provider.declaration.kinds,
      javascript: chartProviderAssetUrl({ workspaceId, provider, asset: javascript }),
      ...(stylesheet ? { stylesheet: chartProviderAssetUrl({ workspaceId, provider, asset: stylesheet }) } : {}),
    };
  });
  return { generation: JSON.stringify([admitted.generation, siteProvider, providers]), siteProvider, providers };
}
