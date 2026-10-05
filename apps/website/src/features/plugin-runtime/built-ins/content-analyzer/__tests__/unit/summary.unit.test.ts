import assert from "node:assert/strict";
import test from "node:test";

import { analyzeContent, type ContentBlock } from "../../analyze-content.js";
import { summarizeReport } from "../../summary.js";

/**
 * @file Model-facing English summary of a `ContentAnalysisReport` (`content-analyzer` built-in).
 * Exact strings are pinned: this text is what the agent reads back to the owner.
 */

const OK_TITLE = "A title that is comfortably long enough";

function prose(n: number): ContentBlock {
  return { kind: "text", text: `${Array.from({ length: n }, () => "cat").join(" ")}.` };
}

test("a clean report: score, words, reading time, readability band + grade, TOC count, all checks pass", () => {
  const report = analyzeContent(
    { title: OK_TITLE, blocks: [{ kind: "heading", level: 2, text: "Part" }, prose(300)] },
    { metaDescription: "m".repeat(80) },
  );
  assert.equal(
    summarizeReport(report),
    `Content score 100/100. 300 words (2 min read). Readability: ${report.readability.band.replace("-", " ")} (Flesch ${report.readability.fleschReadingEase}, grade ${report.readability.gradeLevel}). All checks pass. Table of contents: 1 heading.`,
  );
});

test("every non-pass check becomes one short actionable sentence, in check order", () => {
  const report = analyzeContent(
    {
      title: "x".repeat(75),
      blocks: [
        { kind: "heading", level: 1, text: "Top" },
        { kind: "heading", level: 3, text: "Jump" },
        { kind: "image", alt: null },
        { kind: "image", alt: "ok" },
        prose(12),
      ],
    },
    { metaDescription: "too short" },
  );
  assert.equal(
    summarizeReport(report),
    [
      `Content score ${report.score}/100.`,
      "12 words (1 min read).",
      "Readability: very easy (Flesch 100, grade 0.9).", // 0.39*12 + 11.8*1 - 15.59 = 0.89
      "To improve:",
      "The title is 75 characters; aim for 30-60.",
      "The meta description is 9 characters; aim for 50-160.",
      "1 of 2 images is missing alt text; describe each image in its alt text.",
      'The heading "Jump" jumps from H1 to H3; do not skip heading levels.',
      "The body has 1 H1 heading; the title is already the page H1, so use H2 or lower.",
      "The body has only 12 words; aim for at least 300.",
      "Table of contents: 2 headings.",
    ].join(" "),
  );
});

test("zero-word, untitled, unmeta'd report: readability is 'not measured', no-title and no-text sentences, meta skip noted, no headings", () => {
  const report = analyzeContent({ title: "", blocks: [] });
  assert.equal(
    summarizeReport(report),
    [
      `Content score ${report.score}/100.`,
      "0 words (0 min read).",
      "Readability: not measured (no body text).",
      "To improve:",
      "Add a title.",
      "No meta description was given, so its length was not checked.",
      "There is no body text yet; aim for at least 300 words.",
      "Table of contents: no headings.",
    ].join(" "),
  );
});

test("plurals and the remaining check sentences: several body H1s, several missing alts, long text without subheadings", () => {
  const report = analyzeContent(
    {
      title: OK_TITLE,
      blocks: [
        { kind: "heading", level: 1, text: "A" },
        { kind: "heading", level: 1, text: "B" },
        { kind: "image", alt: "" },
        { kind: "image", alt: null },
        prose(1),
      ],
    },
    { metaDescription: "m".repeat(80) },
  );
  const summary = summarizeReport(report);
  assert.ok(summary.includes("1 word (1 min read)."), summary);
  assert.ok(summary.includes("2 of 2 images are missing alt text; describe each image in its alt text."), summary);
  assert.ok(summary.includes("The body has 2 H1 headings; the title is already the page H1, so use H2 or lower."), summary);
  assert.ok(summary.includes("The body has only 1 word; aim for at least 300."), summary);

  const long = summarizeReport(analyzeContent({ title: OK_TITLE, blocks: [prose(450)] }, { metaDescription: "m".repeat(80) }));
  assert.ok(long.includes("450 words (3 min read)."), long);
  assert.ok(long.includes("450 words with no subheadings; add H2 sections to break up the text."), long);
});

test("multi-word bands render every hyphen as a space", () => {
  const report = analyzeContent({ title: OK_TITLE, blocks: [prose(3)] });
  const summary = summarizeReport({ ...report, readability: { fleschReadingEase: 55, gradeLevel: 9.2, band: "fairly-difficult" } });
  assert.ok(summary.includes("Readability: fairly difficult (Flesch 55, grade 9.2)."), summary);
  const veryHard = summarizeReport({ ...report, readability: { fleschReadingEase: 5, gradeLevel: 20, band: "very-difficult" } });
  assert.ok(veryHard.includes("Readability: very difficult"), veryHard);
});
