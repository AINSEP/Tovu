import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveProductRoot } from "../../platform/site-dir/product-root.js";
import type { PublicThemeResources } from "@jini-ai/core/contracts/site/core-public-page-security-headers";

/**
 * @file The shipped public-theme resource declarations, loaded lazily. Kept apart from
 * `public-page-security-headers.ts` because the theme render workers import this (via `font-links.ts`)
 * and that file reaches the `@jini-ai/cms/forms` barrel, whose graph the workers must not load
 * (`worker-import-graph.test.ts`).
 */

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

/** Load product-owned resource data on first use, then reuse it. Read/parse failures propagate
 * at use rather than import and are not cached. @complexity O(b) file bytes once, then O(1). */
export function publicThemeResources(_required: Record<string, never>, _optional: Record<string, never> = {}): PublicThemeResources {
  resources ??= readPublicThemeResources({
    resourceFile: path.join(resolveProductRoot({}), "content", "themes", "public-resources.json"),
  });
  return resources;
}
