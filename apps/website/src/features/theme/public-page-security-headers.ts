import { describeFormCollectionProviders, type FormCollectionRegistry } from '@jini-ai/cms/forms';
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveProductRoot } from "../../platform/site-dir/product-root.js";
import { createPublicPageSecurityHeaderSet, type PublicThemeResources, type SecurityHeaderSet } from "../../contracts/core/public-page-security-headers.js";

/**
 * Read the shipped theme resource data through a text-reader port. Site themes cannot silently
 * override the shared public-page policy. Missing/invalid product data throws rather than weakening it.
 * @param required Product-owned resource file, included with content/themes in every payload.
 * @param optional Text reader for isolated contract tests.
 * @returns Parsed theme resource declarations; no plugin activation or executable code.
 * @complexity O(b) resource-file bytes; one synchronous read.
 */
export function readPublicThemeResources(required: { resourceFile: string }, optional: {
  readText?: (file: string) => string;
} = {}): PublicThemeResources {
  const readText = optional.readText ?? ((file: string) => readFileSync(file, "utf8"));
  return JSON.parse(readText(required.resourceFile));
}

let resources: PublicThemeResources | undefined;
let headers: SecurityHeaderSet | undefined;
const providerHeaders = new WeakMap<FormCollectionRegistry, { signature: string; headers: SecurityHeaderSet }>();

/** Load product-owned resource data on first use, then reuse it. Read/parse failures propagate
 * at use rather than import and are not cached. @complexity O(b) file bytes once, then O(1). */
export function publicThemeResources(_required: Record<string, never>, _optional: Record<string, never> = {}): PublicThemeResources {
  resources ??= readPublicThemeResources({
    resourceFile: path.join(resolveProductRoot(), "content", "themes", "public-resources.json"),
  });
  return resources;
}

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
