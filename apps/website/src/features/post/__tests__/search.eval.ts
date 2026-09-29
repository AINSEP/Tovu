/**
 * @file The post-search eval set (storage-adapter plan F1; audit §3.4 "gate the swap on the eval
 * set"): 15 fixture posts, 22 queries, and the SQLite FTS5 results recorded as the baseline.
 *
 * Classes covered: exact word, case, multiple words (all present / one missing), prefix and
 * partial words, accents, stop-words, stemming, hyphens and punctuation, numbers, no match.
 *
 * `SQLITE_BASELINE` is what FTS5 + BM25 returned for each query (ids, best first, limit 10) when
 * this set was recorded, 2026-09-28. `search.dialects.test.ts` holds SQLite to it exactly and holds
 * Postgres/PGlite to the gate: its top 3 contains SQLite's top 1 wherever SQLite finds anything, and
 * it finds nothing wherever SQLite finds nothing.
 */

export interface EvalPost {
  id: string;
  title: string;
  text: string;
}

export interface EvalQuery {
  id: string;
  class: string;
  query: string;
}

export const EVAL_POSTS: readonly EvalPost[] = [
  { id: "p01", title: "Pricing plans", text: "Our pricing starts at ten dollars a month. Enterprise plans are custom." },
  { id: "p02", title: "Kubernetes deployment guide", text: "Deploy containers with Kubernetes and Helm charts." },
  { id: "p03", title: "Garden planning", text: "Plant tomatoes in spring. The garden needs sun." },
  { id: "p04", title: "Spring recipes", text: "A tomato salad recipe and a pea soup recipe." },
  { id: "p05", title: "Café culture in Paris", text: "The café is where writers met. Crème brûlée for dessert." },
  { id: "p06", title: "Marathon training", text: "She runs every morning; the runner's diet matters." },
  { id: "p07", title: "Open-source licensing", text: "The MIT license versus GPL for open source projects." },
  { id: "p08", title: "Release notes 2026", text: "Version 3.14 ships email digests and v2 webhooks." },
  { id: "p09", title: "Naïve Bayes explained", text: "A naive classifier for spam filtering." },
  { id: "p10", title: "About us", text: "We are a small team building tools for writers." },
  { id: "p11", title: "Contact", text: "Email us at hello at example dot com. Don't hesitate." },
  { id: "p12", title: "Tomato soup", text: "Roasted tomato soup with basil. Tomatoes from the garden." },
  { id: "p13", title: "Helm charts tips", text: "Kubernetes operators rely on Helm." },
  { id: "p14", title: "Writing a novel", text: "Writers need a routine; writing daily helps." },
  { id: "p15", title: "Privacy policy", text: "We never sell your data. Cookies are used for analytics." },
];

export const EVAL_QUERIES: readonly EvalQuery[] = [
  { id: "q01", class: "exact", query: "pricing" },
  { id: "q02", class: "exact", query: "kubernetes" },
  { id: "q03", class: "case", query: "PRICING" },
  { id: "q04", class: "multi-word", query: "Kubernetes Helm" },
  { id: "q05", class: "multi-word", query: "garden tomatoes" },
  { id: "q06", class: "multi-word, one missing", query: "tomatoes zeppelin" },
  { id: "q07", class: "prefix", query: "kube" },
  { id: "q08", class: "partial", query: "pric" },
  { id: "q09", class: "accents", query: "cafe" },
  { id: "q10", class: "accents", query: "creme brulee" },
  { id: "q11", class: "accents", query: "naive" },
  { id: "q12", class: "stop-word", query: "the" },
  { id: "q13", class: "stop-word + term", query: "the garden" },
  { id: "q14", class: "no match", query: "zeppelin" },
  { id: "q15", class: "stemming", query: "running" },
  { id: "q16", class: "stemming", query: "recipes" },
  { id: "q17", class: "hyphen", query: "open source" },
  { id: "q18", class: "number", query: "2026" },
  { id: "q19", class: "punctuation", query: "3.14" },
  { id: "q20", class: "punctuation", query: "don't" },
  { id: "q21", class: "exact, body only", query: "writers" },
  { id: "q22", class: "exact, body only", query: "email" },
];

/** SQLite FTS5 results, ids best first (limit 10), recorded 2026-09-28. */
export const SQLITE_BASELINE: Readonly<Record<string, readonly string[]>> = {
  q01: ["p01"],
  q02: ["p02", "p13"],
  q03: ["p01"],
  q04: ["p13", "p02"],
  q05: ["p03", "p12", "p04"],
  q06: ["p12", "p03", "p04"],
  q07: [],
  q08: [],
  q09: ["p05"],
  q10: ["p05"],
  q11: ["p09"],
  q12: ["p03", "p06", "p12", "p07", "p05"],
  q13: ["p03", "p12", "p06", "p07", "p05"],
  q14: [],
  q15: ["p06"],
  q16: ["p04"],
  q17: ["p07"],
  q18: ["p08"],
  q19: ["p08"],
  q20: ["p11"],
  q21: ["p10", "p14", "p05"],
  q22: ["p11", "p08"],
};

/**
 * The Postgres/PGlite gate: top 3 contains SQLite's top 1 wherever SQLite finds anything, nothing
 * wherever SQLite finds nothing. `report` gets one line per query whose results differ from SQLite's.
 *
 * @returns the ids of the queries that fail the gate.
 */
export function evalGateFailures(results: ReadonlyMap<string, readonly string[]>, report: (line: string) => void): string[] {
  const failures: string[] = [];
  for (const q of EVAL_QUERIES) {
    const expected = SQLITE_BASELINE[q.id] ?? [];
    const got = results.get(q.id) ?? [];
    const pass = expected.length === 0 ? got.length === 0 : got.slice(0, 3).includes(expected[0]);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      report(`${pass ? "differs" : "FAILS"} ${q.id} ${q.class} "${q.query}": sqlite=${expected.join(",")} pg=${got.join(",")}`);
    }
    if (!pass) failures.push(q.id);
  }
  return failures;
}
