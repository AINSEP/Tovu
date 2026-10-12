import { buildHeadElements, type GetEntryMetaDeps, type PageHeadHook } from "@jini-ai/cms/seo";
import { resolveSeoCoverImage, withCoverSeoDefaults } from "./cover-image.js";

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
 * @complexity O(1) wiring; entry rendering adds O(n + a) shared cover selection/media reads.
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
    handle: async (ctx) => {
      if (!ctx.entry) return buildHeadElements({ ...required, ctx }, {});
      const post = await required.deps.postRepo.findById({ workspaceId: ctx.workspaceId, id: ctx.entry.id });
      if (!post) return buildHeadElements({ ...required, ctx }, {});
      const cover = await resolveSeoCoverImage({ deps: required.deps, post });
      const projected = withCoverSeoDefaults({ post, cover });
      // Bind only the read port passed to the producer. A transient default must never reach a
      // write service, admin DTO or the shared seoDeps object used elsewhere in this process.
      const deps = { ...required.deps, postRepo: {
        findById: async () => projected,
        extractPlainText: required.deps.postRepo.extractPlainText.bind(required.deps.postRepo),
        isTrashed: required.deps.postRepo.isTrashed.bind(required.deps.postRepo),
      } };
      const elements = await buildHeadElements({ ...required, deps, ctx }, {});
      const ogImage = elements.find((element) => element.kind === "og" && element.property === "og:image");
      if (ogImage?.kind !== "og") return elements;
      // The owner permits an external body URL for OG only; it is not a schema image fallback.
      if (cover?.url === ogImage.content) return elements;
      // JSON-LD's entry image is the evaluator's final OG choice, including explicit overrides.
      return elements.map((element) => element.kind === "jsonld" && element.data["@type"] !== "BreadcrumbList"
        ? { ...element, data: { ...element.data, image: ogImage.content } }
        : element);
    },
  };
}
