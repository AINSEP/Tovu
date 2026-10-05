import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeContent,
  countSyllables,
  slugifyHeading,
  type CheckId,
  type ContentAnalysisReport,
  type ContentBlock,
  type ContentCheck,
} from "../../analyze-content.js";

/**
 * @file `content-analyzer` pure scorer — every check boundary from the AW-7 Tier-2 brief's
 * `ContentAnalysisReport` contract, readability on known sentences, TOC anchors, sentence splitting
 * and the zero-word document.
 */

const OK_TITLE = "A title that is comfortably long enough"; // 39 chars

function words(n: number): string {
  return Array.from({ length: n }, () => "cat").join(" ");
}

function check(report: ContentAnalysisReport, id: CheckId): ContentCheck {
  const found = report.checks.find((c) => c.id === id);
  assert.ok(found, `missing check ${id}`);
  return found;
}

function text(t: string): ContentBlock {
  return { kind: "text", text: t };
}

test("checks: always all 7 ids, in contract order", () => {
  const report = analyzeContent({ title: OK_TITLE, blocks: [] });
  assert.deepEqual(
    report.checks.map((c) => c.id),
    ["title-length", "meta-description-length", "image-alt", "heading-order", "single-h1", "content-length", "subheadings"],
  );
  assert.equal(report.v, 1);
});

test("title-length: 0 fail, 1/29 warn, 30/60 pass, 61/70 warn, 71 fail; params carry length/min/max", () => {
  const cases: Array<[number, string]> = [
    [0, "fail"],
    [1, "warn"],
    [29, "warn"],
    [30, "pass"],
    [60, "pass"],
    [61, "warn"],
    [70, "warn"],
    [71, "fail"],
  ];
  for (const [length, status] of cases) {
    const c = check(analyzeContent({ title: "x".repeat(length), blocks: [] }), "title-length");
    assert.equal(c.status, status, `length ${length}`);
    assert.deepEqual(c.params, { length, min: 30, max: 60 });
  }
});

test("title-length: surrounding whitespace is ignored and astral characters count once", () => {
  assert.deepEqual(check(analyzeContent({ title: "   ", blocks: [] }), "title-length").params.length, 0);
  assert.equal(check(analyzeContent({ title: "😀".repeat(30), blocks: [] }), "title-length").status, "pass");
});

test("meta-description-length: absent/blank skip {}, 49 warn, 50 pass, 160 pass, 161 warn", () => {
  const skip = check(analyzeContent({ title: OK_TITLE, blocks: [] }), "meta-description-length");
  assert.deepEqual(skip, { id: "meta-description-length", status: "skip", params: {} });
  const blank = check(analyzeContent({ title: OK_TITLE, blocks: [] }, { metaDescription: "  " }), "meta-description-length");
  assert.equal(blank.status, "skip");
  const cases: Array<[number, string]> = [
    [49, "warn"],
    [50, "pass"],
    [160, "pass"],
    [161, "warn"],
  ];
  for (const [length, status] of cases) {
    const c = check(analyzeContent({ title: OK_TITLE, blocks: [] }, { metaDescription: "m".repeat(length) }), "meta-description-length");
    assert.equal(c.status, status, `length ${length}`);
    assert.deepEqual(c.params, { length, min: 50, max: 160 });
  }
});

test("image-alt: no images pass {0,0}; images all with alt pass; empty/absent alt fail with counts", () => {
  assert.deepEqual(check(analyzeContent({ title: OK_TITLE, blocks: [] }), "image-alt"), {
    id: "image-alt",
    status: "pass",
    params: { images: 0, missing: 0 },
  });
  const allAlt = analyzeContent({ title: OK_TITLE, blocks: [{ kind: "image", alt: "A dog" }] });
  assert.deepEqual(check(allAlt, "image-alt"), { id: "image-alt", status: "pass", params: { images: 1, missing: 0 } });
  const missing = analyzeContent({
    title: OK_TITLE,
    blocks: [
      { kind: "image", alt: "A dog" },
      { kind: "image", alt: null },
      { kind: "image", alt: "   " },
    ],
  });
  assert.deepEqual(check(missing, "image-alt"), { id: "image-alt", status: "fail", params: { images: 3, missing: 2 } });
});

test("heading-order: H2 -> H3 passes; H2 -> H4 warns naming the first offender; first body H3 skips the title's H1", () => {
  const ok = analyzeContent({
    title: OK_TITLE,
    blocks: [
      { kind: "heading", level: 2, text: "A" },
      { kind: "heading", level: 3, text: "B" },
      { kind: "heading", level: 2, text: "C" },
    ],
  });
  assert.deepEqual(check(ok, "heading-order"), { id: "heading-order", status: "pass", params: {} });

  const skipped = analyzeContent({
    title: OK_TITLE,
    blocks: [
      { kind: "heading", level: 2, text: "Intro" },
      { kind: "heading", level: 4, text: "Too deep" },
      { kind: "heading", level: 6, text: "Even deeper" },
    ],
  });
  assert.deepEqual(check(skipped, "heading-order"), {
    id: "heading-order",
    status: "warn",
    params: { from: 2, to: 4, heading: "Too deep" },
  });

  const firstH3 = analyzeContent({ title: OK_TITLE, blocks: [{ kind: "heading", level: 3, text: "Start" }] });
  assert.deepEqual(check(firstH3, "heading-order").params, { from: 1, to: 3, heading: "Start" });
});

test("single-h1: no body H1 passes {h1:0}; any body H1 warns with the count", () => {
  assert.deepEqual(check(analyzeContent({ title: OK_TITLE, blocks: [] }), "single-h1"), {
    id: "single-h1",
    status: "pass",
    params: { h1: 0 },
  });
  const two = analyzeContent({
    title: OK_TITLE,
    blocks: [
      { kind: "heading", level: 1, text: "One" },
      { kind: "heading", level: 1, text: "Two" },
    ],
  });
  assert.deepEqual(check(two, "single-h1"), { id: "single-h1", status: "warn", params: { h1: 2 } });
});

test("content-length: 0 fail, 299 warn, 300 pass; params {words, min:300}", () => {
  const cases: Array<[number, string]> = [
    [0, "fail"],
    [1, "warn"],
    [299, "warn"],
    [300, "pass"],
  ];
  for (const [n, status] of cases) {
    const c = check(analyzeContent({ title: OK_TITLE, blocks: n === 0 ? [] : [text(words(n))] }), "content-length");
    assert.equal(c.status, status, `words ${n}`);
    assert.deepEqual(c.params, { words: n, min: 300 });
  }
});

test("subheadings: >=300 words without H2-H6 warns {words}; under 300 or with an H2 passes; a body H1 is not a subheading", () => {
  const long = [text(words(300))];
  assert.deepEqual(check(analyzeContent({ title: OK_TITLE, blocks: long }), "subheadings"), {
    id: "subheadings",
    status: "warn",
    params: { words: 300 },
  });
  assert.equal(check(analyzeContent({ title: OK_TITLE, blocks: [text(words(299))] }), "subheadings").status, "pass");
  assert.equal(
    check(analyzeContent({ title: OK_TITLE, blocks: [{ kind: "heading", level: 2, text: "S" }, ...long] }), "subheadings").status,
    "pass",
  );
  assert.equal(
    check(analyzeContent({ title: OK_TITLE, blocks: [{ kind: "heading", level: 1, text: "S" }, ...long] }), "subheadings").status,
    "warn",
  );
  assert.deepEqual(check(analyzeContent({ title: OK_TITLE, blocks: long }), "subheadings").params, { words: 300 });
});

test("score: 100 minus 20 per fail and 8 per warn, skip free; integer", () => {
  // all pass except meta skip
  const perfect = analyzeContent({ title: OK_TITLE, blocks: [{ kind: "heading", level: 2, text: "S" }, text(words(300))] });
  assert.equal(perfect.score, 100);
  // title fail (-20), content fail (-20), image fail (-20), body H1 warn (-8), H1 -> H3 order warn (-8)
  const bad = analyzeContent({
    title: "",
    blocks: [
      { kind: "heading", level: 1, text: "H" },
      { kind: "heading", level: 3, text: "Deep" },
      { kind: "image", alt: null },
    ],
  });
  assert.equal(bad.score, 100 - 60 - 16);
  // the worst reachable combination still clamps within 0..100
  const worst = analyzeContent(
    { title: "x".repeat(80), blocks: [{ kind: "heading", level: 1, text: "H" }, { kind: "heading", level: 3, text: "D" }, { kind: "image", alt: null }] },
    { metaDescription: "short" },
  );
  assert.equal(worst.score, 100 - 60 - 24);
  assert.ok(Number.isInteger(worst.score));
});

test("readability: very short monosyllabic sentence clamps ease to 100 and grade to 0 (very-easy)", () => {
  const r = analyzeContent({ title: OK_TITLE, blocks: [text("The cat sat on the mat.")] });
  assert.equal(r.wordCount, 6);
  assert.equal(r.sentenceCount, 1);
  assert.deepEqual(r.readability, { fleschReadingEase: 100, gradeLevel: 0, band: "very-easy" });
});

test("readability: a known polysyllabic sentence produces the exact Flesch / FK numbers (1 decimal) and band", () => {
  // words 9, sentences 1, heuristic syllables: the(1) university(5) administration(5)
  // carefully(4, the heuristic does not drop a mid-word silent e) considered(4) several(3)
  // alternative(4) educational(5) policies(3) = 34.
  const r = analyzeContent({
    title: OK_TITLE,
    blocks: [text("The university administration carefully considered several alternative educational policies.")],
  });
  assert.equal(r.wordCount, 9);
  const ease = 206.835 - 1.015 * 9 - 84.6 * (34 / 9);
  const grade = 0.39 * 9 + 11.8 * (34 / 9) - 15.59;
  assert.equal(r.readability.fleschReadingEase, Math.max(0, Math.round(ease * 10) / 10));
  assert.equal(r.readability.gradeLevel, Math.round(grade * 10) / 10);
  assert.equal(r.readability.fleschReadingEase, 0);
  assert.equal(r.readability.band, "very-difficult");
});

test("readability bands: every band boundary is reachable from the ease value", () => {
  // Drive ease through mid-range values with synthetic monosyllable/polysyllable mixes and assert
  // the band agrees with the contract's thresholds.
  const bandFor = (ease: number): string =>
    ease >= 90 ? "very-easy" : ease >= 80 ? "easy" : ease >= 70 ? "fairly-easy" : ease >= 60 ? "standard" : ease >= 50 ? "fairly-difficult" : ease >= 30 ? "difficult" : "very-difficult";
  const seen = new Set<string>();
  for (const length of [10, 20]) {
    for (let poly = 0; poly <= length; poly += 1) {
      const sentence = [...Array.from({ length: length - poly }, () => "cat"), ...Array.from({ length: poly }, () => "banana")].join(" ") + ".";
      const r = analyzeContent({ title: OK_TITLE, blocks: [text(`${sentence} ${sentence}`)] });
      assert.equal(r.readability.band, bandFor(r.readability.fleschReadingEase));
      seen.add(r.readability.band);
    }
  }
  assert.deepEqual(
    [...seen].sort(),
    ["difficult", "easy", "fairly-difficult", "fairly-easy", "standard", "very-difficult", "very-easy"].sort(),
  );
});

test("zero-word document: ease 0, grade 0, band 'standard' (documented), reading time 0, sentences 0", () => {
  const r = analyzeContent({ title: OK_TITLE, blocks: [text("   "), text("!!! ---"), { kind: "image", alt: "x" }] });
  assert.equal(r.wordCount, 0);
  assert.equal(r.sentenceCount, 0);
  assert.equal(r.readingTimeMinutes, 0);
  assert.deepEqual(r.readability, { fleschReadingEase: 0, gradeLevel: 0, band: "standard" });
});

test("word counting: only tokens with a letter or digit count; headings are structure, not prose", () => {
  const r = analyzeContent({
    title: OK_TITLE,
    blocks: [{ kind: "heading", level: 2, text: "Heading words here" }, text("a - b 42 — c")],
  });
  assert.equal(r.wordCount, 4);
});

test("sentence splitting: terminators followed by space/end split; no terminator counts as 1; per block", () => {
  const r = analyzeContent({
    title: OK_TITLE,
    blocks: [text("One. Two! Three? Four"), text("no terminator here"), text("Version 3.5 shipped...  Really?!")],
  });
  assert.equal(r.sentenceCount, 4 + 1 + 2);
});

test("reading time: ceil(words / 200) by default, at least 1 when there are words; wordsPerMinute overrides", () => {
  assert.equal(analyzeContent({ title: OK_TITLE, blocks: [text("hi")] }).readingTimeMinutes, 1);
  assert.equal(analyzeContent({ title: OK_TITLE, blocks: [text(words(200))] }).readingTimeMinutes, 1);
  assert.equal(analyzeContent({ title: OK_TITLE, blocks: [text(words(201))] }).readingTimeMinutes, 2);
  assert.equal(analyzeContent({ title: OK_TITLE, blocks: [text(words(201))] }, { wordsPerMinute: 100 }).readingTimeMinutes, 3);
});

test("wordsPerMinute: non-positive or non-finite is a RangeError", () => {
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => analyzeContent({ title: OK_TITLE, blocks: [] }, { wordsPerMinute: bad }), {
      name: "RangeError",
      message: `wordsPerMinute must be a positive finite number, got ${bad}`,
    });
  }
});

test("toc: every heading with text, in order, with slug anchors de-duplicated -2, -3 (never colliding with a literal)", () => {
  const r = analyzeContent({
    title: OK_TITLE,
    blocks: [
      { kind: "heading", level: 2, text: "Getting Started" },
      { kind: "heading", level: 3, text: "Getting started!" },
      { kind: "heading", level: 2, text: "Getting Started-2" },
      { kind: "heading", level: 2, text: "Getting Started" },
      { kind: "heading", level: 4, text: "   " },
      { kind: "heading", level: 2, text: "Café & Crème" },
      { kind: "heading", level: 2, text: "???" },
    ],
  });
  assert.deepEqual(r.toc, [
    { level: 2, text: "Getting Started", anchor: "getting-started" },
    { level: 3, text: "Getting started!", anchor: "getting-started-2" },
    { level: 2, text: "Getting Started-2", anchor: "getting-started-2-2" },
    { level: 2, text: "Getting Started", anchor: "getting-started-3" },
    { level: 2, text: "Café & Crème", anchor: "cafe-creme" },
    { level: 2, text: "???", anchor: "section" },
  ]);
});

test("slugifyHeading: lowercases, strips diacritics, collapses non-alphanumerics, falls back to 'section'", () => {
  assert.equal(slugifyHeading("  Hello,  World!  "), "hello-world");
  assert.equal(slugifyHeading("Ünïcödé"), "unicode");
  assert.equal(slugifyHeading("—"), "section");
});

test("countSyllables: vowel groups, silent trailing e, consonant+le keeps its syllable, min 1", () => {
  assert.equal(countSyllables("the"), 1);
  assert.equal(countSyllables("cat"), 1);
  assert.equal(countSyllables("make"), 1);
  assert.equal(countSyllables("table"), 2);
  assert.equal(countSyllables("banana"), 3);
  assert.equal(countSyllables("rhythm"), 1);
  assert.equal(countSyllables("42"), 1);
  assert.equal(countSyllables("University,"), 5);
  assert.equal(countSyllables("be"), 1);
});
