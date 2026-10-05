/**
 * @file `summarizeReport` — turns a `ContentAnalysisReport` into one concise, model-facing English
 * paragraph (the `content-analyzer` built-in's `ext.content-analyzer.summary` field, AW-7 Tier 2).
 *
 * Purpose:
 * The agent answers "analyze this page" by reading this text back, so it states the score, words,
 * reading time, readability band + grade, then one short ACTIONABLE sentence per non-pass check (in
 * check order) and the table-of-contents heading count. The structured numbers stay in the report
 * JSON; this is prose only.
 *
 * Architectural role:
 * Pure, no Tovu imports beyond the sibling scorer's types — travels with `./analyze-content.ts` to
 * `@jini-ai/visibility/seo` later. English only by design: a UI localizes from the report's check
 * `params`, not from this string.
 */
import type { CheckId, ContentAnalysisReport, ContentCheck } from "./analyze-content.js";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const CHECK_SENTENCES: Record<CheckId, (check: ContentCheck) => string> = {
  "title-length": ({ params }) =>
    params.length === 0 ? "Add a title." : `The title is ${params.length} characters; aim for ${params.min}-${params.max}.`,
  "meta-description-length": ({ status, params }) =>
    status === "skip"
      ? "No meta description was given, so its length was not checked."
      : `The meta description is ${params.length} characters; aim for ${params.min}-${params.max}.`,
  "image-alt": ({ params }) =>
    `${params.missing} of ${params.images} images ${params.missing === 1 ? "is" : "are"} missing alt text; describe each image in its alt text.`,
  "heading-order": ({ params }) =>
    `The heading "${params.heading}" jumps from H${params.from} to H${params.to}; do not skip heading levels.`,
  "single-h1": ({ params }) =>
    `The body has ${plural(Number(params.h1), "H1 heading")}; the title is already the page H1, so use H2 or lower.`,
  "content-length": ({ status, params }) =>
    status === "fail"
      ? `There is no body text yet; aim for at least ${params.min} words.`
      : `The body has only ${plural(Number(params.words), "word")}; aim for at least ${params.min}.`,
  subheadings: ({ params }) => `${params.words} words with no subheadings; add H2 sections to break up the text.`,
};

/**
 * Renders the model-facing summary paragraph for one report.
 *
 * @param report - A `ContentAnalysisReport` from `analyzeContent`.
 * @returns One paragraph of plain English sentences separated by single spaces.
 * @complexity O(checks + toc).
 */
export function summarizeReport(report: ContentAnalysisReport): string {
  const { readability } = report;
  const parts = [
    `Content score ${report.score}/100.`,
    `${plural(report.wordCount, "word")} (${report.readingTimeMinutes} min read).`,
    // A zero-word report's band is a placeholder (see analyze-content.ts), so say so instead.
    report.wordCount === 0
      ? "Readability: not measured (no body text)."
      : `Readability: ${readability.band.replace("-", " ")} (Flesch ${readability.fleschReadingEase}, grade ${readability.gradeLevel}).`,
  ];

  const toImprove = report.checks.filter((check) => check.status !== "pass");
  if (toImprove.length === 0) parts.push("All checks pass.");
  else parts.push("To improve:", ...toImprove.map((check) => CHECK_SENTENCES[check.id](check)));

  parts.push(report.toc.length === 0 ? "Table of contents: no headings." : `Table of contents: ${plural(report.toc.length, "heading")}.`);
  return parts.join(" ");
}
