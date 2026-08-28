/**
 * @file Content-types' agent-tool registrations — re-exported from `@jini-ai/cms/content-types`.
 *
 * A shim rather than a rewrite of the one importer, deliberately, mirroring `identity/` and
 * `navigation/`'s own reasoning. `assistant/tool-registrations.ts` imports all 22 domains as a
 * single uniform block of `../<domain>/tool-registrations` lines, and this file keeps that block
 * uniform. When more domains move, this file and its siblings retire together.
 *
 * 2026-08-17 (Stage 2 batch 2 of the registry rollout): converted to
 * `assistant/tool-contribution-registry.ts`'s explicit-call registry, same as `identity`/`members`/
 * `taxonomy`/`redirects`/`widgets` — see that file's header for why. `widgets` (this batch's own
 * first conversion) imports `features/content-types` internally
 * (`widgets/{write-service,embed-service,region-area-service,deps,entry-payload}.ts`), which is why
 * this domain converts AFTER `widgets`, not before: `widgets` was still a legacy static
 * `DOMAIN_SLICES` entry until its own conversion, and converting `content-types` first would have
 * closed `assistant -> widgets -> content-types -> assistant` (the same shape that forced the
 * `themes`/`post` reverts in the prior batch). With `widgets` already off the static array, no
 * remaining still-legacy domain imports `content-types`, so this edge is safe.
 */
import type { ToolContributor } from "#src/assistant/index";
import {
  buildContentTypesRegistrations,
  contentTypesDerivedRisk,
  type ContentTypesToolDeps,
} from "@jini-ai/cms/content-types";

export { buildContentTypesRegistrations, contentTypesDerivedRisk, type ContentTypesToolDeps };

/**
 * Contributes Content-types' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildContentTypesRegistrations`/
 * `contentTypesDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeContentTypesTools(): ToolContributor {
  return { domain: "content-types", build: buildContentTypesRegistrations, risk: contentTypesDerivedRisk };
}
