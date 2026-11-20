import { describeFormCollectionProviders, type FormCollectionRegistry } from '@jini-ai/cms/forms';
import { createPublicPageSecurityHeaderSet } from "../../contracts/core/public-page-security-headers.js";
import type { SecurityHeaderSet } from "@jini-ai/core/contracts/server/security-headers";
import { publicThemeResources } from "./public-theme-resources.js";

export { publicThemeResources, readPublicThemeResources } from "./public-theme-resources.js";

let headers: SecurityHeaderSet | undefined;
const providerHeaders = new WeakMap<FormCollectionRegistry, { signature: string; headers: SecurityHeaderSet }>();

/** Reuse headers until the app-scoped provider origins change. Descriptions stay live so a retired
 * lease immediately withdraws its origins. @complexity O(p × d) to check declarations; header construction
 * runs only on change, with one cached set per registry and no new I/O after theme loading. */
export function publicPageSecurityHeaders({ formCollectionProviders }: { formCollectionProviders?: () => FormCollectionRegistry }, _optional: Record<string, never> = {}): SecurityHeaderSet {
  if (formCollectionProviders) {
    const providers = formCollectionProviders();
    const frameOrigins = describeFormCollectionProviders({ providers }).filter(provider => provider.available).flatMap(provider => provider.frameOrigins);
    const signature = JSON.stringify(frameOrigins);
    const cached = providerHeaders.get(providers);
    if (cached?.signature === signature) return cached.headers;
    const next = createPublicPageSecurityHeaderSet({ resources: publicThemeResources({}) }, { frameOrigins });
    providerHeaders.set(providers, { signature, headers: next });
    return next;
  }
  headers ??= createPublicPageSecurityHeaderSet({ resources: publicThemeResources({}) });
  return headers;
}
