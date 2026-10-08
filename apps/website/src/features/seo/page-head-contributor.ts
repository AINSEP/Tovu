import { buildHeadElements, type GetEntryMetaDeps, type PageHeadHook } from "@jini-ai/cms/seo";

/**
 * @file SEO's host PageHeadHook (ADR-PIPE-008 Decision, C-003). Ordered descriptor production
 * lives in Jini/packages/cms/src/seo/page-head.ts. Registered once at app boot into the
 * core-owned page-head registry, never imported directly by render.ts.
 */

/** Default contributor-level priority (irrelevant with a single v1 contributor; kept explicit for future ones). */
const DEFAULT_CONTRIBUTOR_PRIORITY = 100;

/** Bind Tovu's contributor priority to Jini's pure head producer.
 * The reserved root slug identifies the content-owned home across template, generic, and bare
 * renders. Only an explicit workspace title counts, never the setting default/display fallback.
 * @example createSeoPageHeadHook({ deps: seoDeps, rootSlug, siteTitle }, {})
 * @complexity O(1) wiring; handle retains the producer's bounded reads and errors.
 */
export function createSeoPageHeadHook(
  required: {
    deps: GetEntryMetaDeps;
    rootSlug: string;
    siteTitle: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<string | undefined>;
  },
  optional: { priority?: number } = {},
): PageHeadHook {
  return {
    priority: optional.priority ?? DEFAULT_CONTRIBUTOR_PRIORITY,
    handle: (ctx) => buildHeadElements({ ...required, ctx }, {}),
  };
}
