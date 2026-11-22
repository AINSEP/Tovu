/**
 * @file The `content-analyzer` built-in's binding of `analyzeContent` (`@jini-ai/cms/seo/content-analysis`)
 * to the renderer's slug rule (AW-7 Tier 2): TOC anchors use `toSlug`, so transliterated headings
 * match the ids the site renderer emits. The TipTap adapter lives in `./tiptap-blocks.ts` and the
 * plugin wiring in `./plugin.ts`.
 */
import { analyzeContent as analyzeWithSlugify, type AnalyzeContentOptional, type AnalyzeContentRequired, type ContentAnalysisReport } from "@jini-ai/cms/seo/content-analysis";
import { toSlug } from "#src/platform/html/slug";

/** Scores one piece of content with the renderer's slug rule; see `analyzeContent` in Jini. */
export function analyzeContent(required: Omit<AnalyzeContentRequired, "slugify">, optional: AnalyzeContentOptional = {}): ContentAnalysisReport {
  return analyzeWithSlugify({ ...required, slugify: toSlug }, optional);
}
