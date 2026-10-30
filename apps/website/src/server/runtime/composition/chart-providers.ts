/** Tovu's admin transport projection of Jini-admitted providers and the site's chart preference. */
import { getEffective, type SettingsRepoPort } from "@jini-ai/core/settings";
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

/** Read the workspace layer through the existing ledger; user preferences cannot change site policy.
 * @returns Serializable admitted metadata, with a generation covering activation and preference.
 * @throws Propagates ledger failures; callers retain the core table instead of executing guessed assets.
 * @complexity O(p + a) projection for admitted providers p and assets a, plus one effective setting read.
 * @example readAdminChartProviderSnapshot({ workspaceId, settingsRepo, browserProviders });
 */
export async function readAdminChartProviderSnapshot(
  { workspaceId, settingsRepo, browserProviders }: {
    workspaceId: string; settingsRepo: SettingsRepoPort;
    browserProviders: (input: Record<string, never>, options?: Record<string, never>) => { generation: number; providers: readonly AdmittedBrowserProvider[] };
  }, _options: Record<string, never> = {},
): Promise<AdminChartProviderSnapshot> {
  const setting = await getEffective({ repo: settingsRepo }, { namespace: "core.charts", key: "provider", scopeContext: { workspaceId } });
  const siteProvider = typeof setting?.value === "string" ? setting.value : "plugin.recharts";
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
