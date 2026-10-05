/**
 * @file `content-analyzer`'s executable entry module — what the Tier-2 worker imports (AW-7 Tier 2).
 *
 * Purpose:
 * Attaches one `content.entry.beforeSave` filter that scores the entry's title + TipTap body and
 * returns the 6-field `ext.content-analyzer.*` patch (keys un-prefixed, exactly like word-count's
 * `{ count }`; the host namespaces them).
 *
 * Architectural role:
 * This is exactly what a third party would ship as `server/index.mjs`: it imports ONLY `@tovu/sdk`
 * and its own pure sibling modules — never Tovu internals — because it runs inside a worker on the
 * far side of the plugin ABI (ADR-024 §3/§4) and the server process never imports it
 * (`./index.ts`'s `importModule` refuses). Everything crossing that boundary is structured-clone
 * plain data, which is WHY `report` is a JSON string: `ExtPatch` values are scalars only.
 */
import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE, type ContentEntryDraft, type ExtPatch } from "@tovu/sdk";

import { analyzeContent } from "./analyze-content.js";
import { summarizeReport } from "./summary.js";
import { tiptapToBlocks } from "./tiptap-blocks.js";

/**
 * Hook point for the entry's meta description. `ContentEntryDraft` has no such field yet (SDK
 * 0.2.0), so today this always yields `undefined` and the `meta-description-length` check skips;
 * the moment the host adds a `metaDescription` string to the draft, it is picked up here with no
 * other change.
 *
 * @param entry - The read-only draft the filter received.
 * @returns The meta description when the draft carries one as a string, else `undefined`.
 */
export function readMetaDescription(entry: Readonly<ContentEntryDraft>): string | undefined {
  const { metaDescription } = entry as Readonly<ContentEntryDraft> & { readonly metaDescription?: unknown };
  return typeof metaDescription === "string" ? metaDescription : undefined;
}

/**
 * Scores one entry draft into the plugin's `ext` patch.
 *
 * @param entry - The read-only draft (`title`, `bodyJson`, optional future `metaDescription`).
 * @returns `{ score, wordCount, readingTimeMinutes, readability, summary, report }`.
 * @complexity O(size of bodyJson).
 */
export function buildContentAnalyzerPatch(entry: Readonly<ContentEntryDraft>): ExtPatch {
  const metaDescription = readMetaDescription(entry);
  const report = analyzeContent(
    { title: entry.title, blocks: tiptapToBlocks(entry.bodyJson) },
    metaDescription === undefined ? {} : { metaDescription },
  );
  return {
    score: report.score,
    wordCount: report.wordCount,
    readingTimeMinutes: report.readingTimeMinutes,
    readability: report.readability.fleschReadingEase,
    summary: summarizeReport(report),
    report: JSON.stringify(report),
  };
}

export default definePlugin({
  setup(sdk) {
    sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async (entry) => buildContentAnalyzerPatch(entry));
  },
});
