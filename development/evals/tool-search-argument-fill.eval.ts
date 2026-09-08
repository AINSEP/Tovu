/**
 * @file Scores the blind argument-fill arms produced by `tool-search-argument-fill-fixture.ts`,
 * and runs the one deterministic arm this question admits.
 *
 * ## The question
 *
 * Every prior parent-tool arm scores retrieval RANK. This one scores what happens after retrieval:
 * given a request the tool can serve, does the model pass the `resource` value that actually serves
 * it — and when the tool CANNOT serve the request, does it abstain or invent a plausible resource?
 *
 * A wrong `resource` is a different failure from a missed retrieval: a miss returns nothing, while a
 * wrong `resource` returns a confident, well-formed, WRONG collection of rows. Both are counted
 * separately below.
 *
 * ## Arms
 *
 * | arm | shape | what the model is asked for |
 * |---|---|---|
 * | A  | one fat entry, `resource` a closed enum of the 29 keys | the `resource` value |
 * | A2 | identical to A, but NOT pre-committed to calling the tool | call it (with a resource) or not |
 * | B  | one fat entry, `resource` a free string (`content_duplicate`'s shipped shape) | the exact string |
 * | C  | 29 `content_read.<resource>` cards (the SHIPPED design) | the tool id |
 *
 * A and C are information-symmetric: identical 29 resources, identical text, identical 130 queries in
 * identical shuffled order. The only difference is whether the choice is expressed as an argument
 * value or as a tool id. A2 exists because arm A's prompt pre-commits the model to calling the tool
 * ("You have decided to call content_read"), which is realistic for a model that has just retrieved
 * it but is NOT symmetric with C's "or NONE" framing — so A vs C abstention is confounded until A2
 * separates framing from design.
 *
 * Run: `npx tsx development/evals/tool-search-argument-fill.eval.ts <fixture-dir>`
 * MEASUREMENT ONLY. Registers nothing; the shipping catalog is untouched.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { buildToolCatalogQuery } from "../../apps/website/src/assistant/tool-catalog-query.js";
import { indexedDescriptionFor } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";
import { resourceKeyOf, TIER1_CLEAN } from "./tool-search-argument-fill-fixture.js";

interface KeyCase {
  caseNo: number;
  sourceIndex: number;
  query: string;
  expect: string;
  alsoAcceptable: string[];
  acceptableResources: string[];
  acceptableShippedIds: string[];
  truthKind: "read" | "mutation";
}
interface Key {
  shuffleSeed: number;
  resources: string[];
  cases: KeyCase[];
  affectedCount: number;
}

type Verdict = "CORRECT" | "WRONG_RESOURCE" | "FALSE_FILL" | "MISSED_ABSTAIN" | "CORRECT_ABSTAIN" | "INVALID";

/** Parses `<n> <value>` answer lines into a caseNo -> value map, rejecting a file that does not
 *  cover exactly the expected case numbers (a truncated or renumbered arm must fail loudly, not
 *  score as a pile of misses). */
function parseAnswers(path: string, expectedCases: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const m = /^(\d+)[.)\s]\s*(.+)$/.exec(line);
    if (!m) throw new Error(`${path}: unparseable answer line: ${JSON.stringify(raw)}`);
    const n = Number(m[1]);
    if (out.has(n)) throw new Error(`${path}: duplicate answer for case ${n}`);
    out.set(n, m[2]!.trim());
  }
  const missing = expectedCases.filter((n) => !out.has(n));
  const extra = [...out.keys()].filter((n) => !expectedCases.includes(n));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${path}: covers ${out.size} cases; missing=[${missing.join(",")}] extra=[${extra.join(",")}]`);
  }
  return out;
}

/** Normalizes an arm's answer to a bare resource key. Arm C answers with a card id; A/B answer with
 *  the key itself. A free-string arm (B) may emit an unknown string — that is a real failure mode
 *  (`content_duplicate` rejects an unrecognized resource at call time), so it is preserved, not
 *  coerced. */
function toResource(answer: string, resources: readonly string[]): { resource: string | null; unknown: boolean } {
  const raw = answer.replace(/^`|`$/g, "").trim();
  if (raw.toUpperCase() === "NONE") return { resource: null, unknown: false };
  const stripped = raw.startsWith("content_read.")
    ? raw.slice("content_read.".length)
    : raw.startsWith("read_")
      ? raw.slice("read_".length)
      : raw;
  return { resource: stripped, unknown: !resources.includes(stripped) };
}

function verdictFor(answer: string, c: KeyCase, resources: readonly string[]): Verdict {
  const { resource, unknown } = toResource(answer, resources);
  const inScope = c.acceptableResources.length > 0;
  if (resource === null) return inScope ? "MISSED_ABSTAIN" : "CORRECT_ABSTAIN";
  if (unknown) return "INVALID";
  if (!inScope) return "FALSE_FILL";
  return c.acceptableResources.includes(resource) ? "CORRECT" : "WRONG_RESOURCE";
}

/**
 * Wilson score interval, NOT the normal approximation. At the boundaries this eval actually hits
 * (34/34 and 0/34) the normal approximation reports `±0`, which reads as certainty and is simply
 * false — 34/34 is consistent with a true rate as low as ~90%. Wilson gives the honest bound.
 */
function wilson(hits: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96;
  const p = hits / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function pct(hits: number, n: number): string {
  if (n === 0) return "—".padEnd(23);
  const [lo, hi] = wilson(hits, n);
  return `${hits}/${n} ${((hits / n) * 100).toFixed(0)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}]`.padEnd(23);
}

/** McNemar exact (two-sided) on a paired binary outcome. */
function mcnemarExactP(b: number, c: number): number {
  const total = b + c;
  if (total === 0) return 1;
  const k = Math.min(b, c);
  const logFact = (x: number) => {
    let s = 0;
    for (let i = 2; i <= x; i++) s += Math.log(i);
    return s;
  };
  let cumulative = 0;
  for (let x = 0; x <= k; x++) cumulative += Math.exp(logFact(total) - logFact(x) - logFact(total - x) - total * Math.log(2));
  return Math.min(1, 2 * cumulative);
}

const ARMS = [
  { id: "A", file: "afill-answers-A.txt", label: "A  fat entry, closed enum (pre-committed)" },
  { id: "A2", file: "afill-answers-A2.txt", label: "A2 fat entry, closed enum (free to abstain)" },
  { id: "B", file: "afill-answers-B.txt", label: "B  fat entry, FREE-STRING resource" },
  { id: "C", file: "afill-answers-C.txt", label: "C  29 cards — THE SHIPPED DESIGN" },
  { id: "D", file: "afill-answers-D.txt", label: "D  29 cards, BARE-NOUN ids (verb stripped)" },
  { id: "E", file: "afill-answers-E.txt", label: "E  fat entry, VERB-CARRYING enum" },
] as const;

function main(): void {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: tsx tool-search-argument-fill.eval.ts <fixture-dir>");
  const key = JSON.parse(readFileSync(join(dir, "afill-key.json"), "utf8")) as Key;
  const caseNos = key.cases.map((c) => c.caseNo);
  const byNo = new Map(key.cases.map((c) => [c.caseNo, c]));
  const inScopeNos = key.cases.filter((c) => c.acceptableResources.length > 0).map((c) => c.caseNo);
  const outScopeNos = key.cases.filter((c) => c.acceptableResources.length === 0).map((c) => c.caseNo);

  const results = new Map<string, Map<number, Verdict>>();
  const present: string[] = [];
  for (const arm of ARMS) {
    const path = join(dir, arm.file);
    if (!existsSync(path)) continue;
    const answers = parseAnswers(path, caseNos);
    const verdicts = new Map<number, Verdict>();
    for (const n of caseNos) verdicts.set(n, verdictFor(answers.get(n)!, byNo.get(n)!, key.resources));
    results.set(arm.id, verdicts);
    present.push(arm.id);
  }
  if (present.length === 0) throw new Error(`no answer files found in ${dir}`);

  const bar = "=".repeat(112);
  console.log(`\n${bar}\nARGUMENT-FILL — does the model pass the resource that actually serves the request?\n${bar}\n`);
  console.log(`  cases                  ${key.cases.length}   (in-scope for content_read: ${inScopeNos.length}, out-of-scope: ${outScopeNos.length})`);
  console.log(`  resources              ${key.resources.length}   (verified identical to the shipped card set)`);
  console.log(`  arms scored            ${present.join(", ")}\n`);

  const count = (arm: string, nos: readonly number[], v: Verdict) => nos.filter((n) => results.get(arm)!.get(n) === v).length;

  console.log(`  ON THE ${inScopeNos.length} IN-SCOPE CASES  — the tool CAN serve these; the only question is which resource\n`);
  console.log(`  ${"arm".padEnd(44)}${"correct".padEnd(23)}${"WRONG resource".padEnd(23)}${"abstained".padEnd(23)}${"invalid".padEnd(23)}`);
  for (const arm of ARMS) {
    if (!results.has(arm.id)) continue;
    const n = inScopeNos.length;
    console.log(
      `  ${arm.label.padEnd(44)}${pct(count(arm.id, inScopeNos, "CORRECT"), n)}${pct(count(arm.id, inScopeNos, "WRONG_RESOURCE"), n)}` +
        `${pct(count(arm.id, inScopeNos, "MISSED_ABSTAIN"), n)}${pct(count(arm.id, inScopeNos, "INVALID"), n)}`,
    );
  }

  console.log(`\n  ON THE ${outScopeNos.length} OUT-OF-SCOPE CASES — the tool CANNOT serve these; the only correct answer is to abstain\n`);
  console.log(`  ${"arm".padEnd(44)}${"correctly abstained".padEnd(23)}${"FALSE FILL".padEnd(23)}${"invalid".padEnd(23)}`);
  for (const arm of ARMS) {
    if (!results.has(arm.id)) continue;
    const n = outScopeNos.length;
    console.log(
      `  ${arm.label.padEnd(44)}${pct(count(arm.id, outScopeNos, "CORRECT_ABSTAIN"), n)}${pct(count(arm.id, outScopeNos, "FALSE_FILL"), n)}${pct(count(arm.id, outScopeNos, "INVALID"), n)}`,
    );
  }

  const outRead = key.cases.filter((c) => c.acceptableResources.length === 0 && c.truthKind === "read").map((c) => c.caseNo);
  const outMutate = key.cases.filter((c) => c.acceptableResources.length === 0 && c.truthKind === "mutation").map((c) => c.caseNo);
  console.log(`\n  OUT-OF-SCOPE, SPLIT BY WHAT THE REQUEST ACTUALLY WANTED (classified from each ground-truth tool's own`);
  console.log(`  declared readOnly flag, never by judgment). A false fill on a READ request is a near-miss inside the same`);
  console.log(`  verb and is partly an artifact of these arms offering only the 29 read resources; a false fill on a`);
  console.log(`  MUTATION request is the tool being reached for when the operator wanted something changed.\n`);
  console.log(`  ${"arm".padEnd(44)}${`abstain, read n=${outRead.length}`.padEnd(23)}${`abstain, mutation n=${outMutate.length}`.padEnd(23)}`);
  for (const arm of ARMS) {
    if (!results.has(arm.id)) continue;
    console.log(
      `  ${arm.label.padEnd(44)}${pct(count(arm.id, outRead, "CORRECT_ABSTAIN"), outRead.length)}${pct(count(arm.id, outMutate, "CORRECT_ABSTAIN"), outMutate.length)}`,
    );
  }

  console.log(`\n  WHOLE SET, n=${key.cases.length} — every case scored, abstention counted as correct only where it is\n`);
  console.log(`  ${"arm".padEnd(44)}${"fully correct".padEnd(23)}${"confidently WRONG".padEnd(23)}`);
  for (const arm of ARMS) {
    if (!results.has(arm.id)) continue;
    const ok = count(arm.id, inScopeNos, "CORRECT") + count(arm.id, outScopeNos, "CORRECT_ABSTAIN");
    const wrong = count(arm.id, inScopeNos, "WRONG_RESOURCE") + count(arm.id, outScopeNos, "FALSE_FILL") + count(arm.id, caseNos, "INVALID");
    console.log(`  ${arm.label.padEnd(44)}${pct(ok, key.cases.length)}${pct(wrong, key.cases.length)}`);
  }

  // ---- Paired significance, arm vs the shipped design (C) --------------------------------------
  if (results.has("C")) {
    console.log(`\n  PAIRED McNemar exact vs. arm C (the shipped design), "fully correct" per case:\n`);
    const okVec = (arm: string, nos: readonly number[]) =>
      nos.map((n) => {
        const v = results.get(arm)!.get(n)!;
        return v === "CORRECT" || v === "CORRECT_ABSTAIN";
      });
    for (const arm of ARMS) {
      if (arm.id === "C" || !results.has(arm.id)) continue;
      for (const [scope, nos] of [["in-scope", inScopeNos], ["out-of-scope", outScopeNos], ["whole set", caseNos]] as const) {
        const a = okVec(arm.id, nos);
        const c = okVec("C", nos);
        let b = 0;
        let d = 0;
        for (let i = 0; i < nos.length; i++) {
          if (c[i] && !a[i]) b++;
          else if (!c[i] && a[i]) d++;
        }
        const p = mcnemarExactP(b, d);
        console.log(`    ${`${arm.id} vs C, ${scope}`.padEnd(28)}C-only=${String(b).padEnd(4)}${arm.id}-only=${String(d).padEnd(4)}p=${p < 0.0001 ? p.toExponential(1) : p.toFixed(4)}${p < 0.05 ? " *" : ""}`);
      }
    }
  }

  // ---- The DETERMINISTIC bound: what a purely lexical model of the fill decision predicts -------
  //
  // `2026-09-08-parent-tool-read-eval.md`'s Addendum 2 measured "the scoring asymmetry" as
  // D1-strict (85%) vs D1-LENIENT (100%) on the affected cases and called the 15-point gap the
  // disambiguation the fat design relocates to argument-fill time. That gap is a BM25 quantity: it
  // counts cases where a WRONG card outranked the right one among 141 competing tools. Reused as an
  // estimate of argument-fill error it assumes the model picks `resource` the way BM25 picks a
  // document. This arm measures that assumption directly — rank the 29 resource documents against
  // each other, with no external competition, and see how often the lexically-best resource is the
  // right one. The difference between this number and the arms above is exactly how wrong the
  // lexical proxy is.
  //
  // Note what this arm structurally CANNOT do: BM25 always returns a ranked list, so it has no way
  // to express "none of these" at all. Every out-of-scope case is a forced fill. The abstention
  // behaviour that turns out to dominate the real result is invisible to it in principle.
  const registry = buildEvalToolRegistry(fakeEvalRouteDeps(), undefined, { includeContentReadCollapse: false });
  const descById = new Map((registry.list() as readonly { id: string; description?: string }[]).map((d) => [d.id, d.description ?? ""]));
  const membersOf = new Map<string, string[]>();
  for (const id of TIER1_CLEAN) membersOf.set(resourceKeyOf(id), [...(membersOf.get(resourceKeyOf(id)) ?? []), id]);
  const resourceOnlyIndex = buildToolCatalogQuery({
    list: () =>
      [...membersOf.entries()].map(([key, ids]) => ({
        id: key,
        description: ids.map((id) => indexedDescriptionFor(id, descById.get(id) ?? "")).join(" "),
        inputSchema: { type: "object" },
      })) as never,
  });
  let lexTop1 = 0;
  let lexTop3 = 0;
  const lexMisses: KeyCase[] = [];
  for (const c of key.cases) {
    if (c.acceptableResources.length === 0) continue;
    const ranked = resourceOnlyIndex.search(c.query, 3).map((h) => h.id);
    if (ranked.length > 0 && c.acceptableResources.includes(ranked[0]!)) lexTop1++;
    else lexMisses.push(c);
    if (ranked.some((r) => c.acceptableResources.includes(r))) lexTop3++;
  }
  const nIn = key.cases.filter((c) => c.acceptableResources.length > 0).length;
  console.log(`\n  DETERMINISTIC LEXICAL BOUND — BM25 over the 29 resource documents alone, no other tools competing`);
  console.log(`  (this is the model of the fill decision that the "15-point scoring asymmetry" implicitly assumed)\n`);
  console.log(`    resource picked by BM25 top-1   ${pct(lexTop1, nIn)}`);
  console.log(`    correct resource in BM25 top-3  ${pct(lexTop3, nIn)}`);
  console.log(`    can it ever abstain?            no — BM25 always ranks something; every out-of-scope case is a forced fill`);
  console.log(`\n    In-scope cases BM25 gets wrong but every live arm gets right (${lexMisses.length}):`);
  for (const c of lexMisses) console.log(`      want=${c.acceptableResources.join("|").padEnd(26)} "${c.query.slice(0, 68)}"`);

  // ---- The failure register: every case where an arm returned confident, plausible, WRONG data ---
  for (const arm of ARMS) {
    if (!results.has(arm.id)) continue;
    const bad = caseNos.filter((n) => {
      const v = results.get(arm.id)!.get(n)!;
      return v === "WRONG_RESOURCE" || v === "FALSE_FILL" || v === "INVALID";
    });
    console.log(`\n  Arm ${arm.id} — ${bad.length} case(s) returning a confidently wrong resource:`);
    const answers = parseAnswers(join(dir, arm.file), caseNos);
    for (const n of bad.slice(0, 40)) {
      const c = byNo.get(n)!;
      const want = c.acceptableResources.length > 0 ? c.acceptableResources.join("|") : "(abstain)";
      console.log(`    ${String(n).padStart(3)} ${results.get(arm.id)!.get(n)!.padEnd(15)} got=${answers.get(n)!.padEnd(34)} want=${want.padEnd(24)} "${c.query.slice(0, 62)}"`);
    }
    if (bad.length > 40) console.log(`    … ${bad.length - 40} more`);
  }
  console.log("");
}

main();
