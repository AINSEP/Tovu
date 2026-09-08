/**
 * @file Prices the one SHIPPED tool that carries the shape arm A2 measured failing:
 * `content_duplicate`, whose `resource` is a free string whose legal values are bare nouns
 * (`post` / `page` / `form` / `media`), named only in prose.
 *
 * ## The prediction being tested, and my own prior against it
 *
 * `2026-09-08-argument-fill-eval.md` §3 found a fat `content_read` with bare-noun option labels was
 * filled on 72 of 75 out-of-scope MUTATION requests, and that verb-carrying labels recovered all of
 * it. §6 flagged `content_duplicate` as the live instance of that shape. But §4 of the same report
 * found the DELETE family showed no over-trigger in any shape, and reasoned that a marked verb is
 * protective while the generic `read` is not. **`duplicate` is a marked verb, so my own prior is that
 * this tool does NOT over-trigger.** This file is built to be able to say so rather than to confirm
 * an alarm.
 *
 * ## Case sources — the negatives are NOT hand-authored
 *
 * The dominant risk in a "does it over-trigger" measurement is that the author writes negatives that
 * happen to look non-duplicate to them. That is avoided here: **the 130 held-out queries are used
 * verbatim as the ordinary negative set.** They were authored blind by another agent, before
 * `content_duplicate` existed, and name it zero times (`grep -c content_duplicate` on
 * `tool-search-heldout-v2.ts` returns 0). Nobody chose them with this tool in mind.
 *
 * Two smaller sets are unavoidably hand-authored, and disclosed as such:
 * - **POSITIVES (n=10)** — genuine copy requests. No blind source for these exists, and without them
 *   an arm that abstains on everything would score perfectly.
 * - **NEAR-MISS NEGATIVES (n=12)** — copy-adjacent phrasings with a defensible non-duplicate reading,
 *   which is where a bare-noun enum should be weakest. Each is listed with its real target verb.
 * - **AMBIGUOUS (n=4)** — genuinely readable either way. **Reported, never scored.** Putting them in
 *   the scored set would let me manufacture whichever result I wanted.
 *
 * ## Arms
 *
 * Both arms carry the shipped `content_duplicate` description **byte-identical** (stripped, as
 * `search_tools` returns it). The ONLY difference is the `resource` property in the schema:
 * - **M** — the real shipped schema verbatim: free string, no enum.
 * - **N** — a closed enum of `duplicate_<resource>` values, the §3 fix, changing nothing else.
 *
 * N is deliberately NOT given rewritten prose. The shipped description names 'post'/'page'/'form'/
 * 'media' in a dozen places that are not enum values ("For post/page: title defaults..."), and a
 * blanket substitution would mangle it. Leaving the prose alone makes arm N *harder* than a real
 * implementation would be, not easier — the conservative direction.
 *
 * Run: `npx tsx development/evals/tool-search-argument-fill-duplicate.ts <out-dir>`
 * MEASUREMENT ONLY. `content_duplicate` is shipped code in another agent's domain and is not touched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stripSearchKeywords } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";

const RESOURCES = ["post", "page", "form", "media"] as const;

interface Case {
  readonly query: string;
  /** The resource a correct call passes, or null when the tool must abstain. */
  readonly expect: string | null;
  readonly bucket: "blind-negative" | "positive" | "near-miss" | "ambiguous";
  /** For near-misses: what the request actually wants, so a wrong answer is checkable. */
  readonly reallyWants?: string;
}

/** Genuine copy requests. Hand-authored — no blind source exists. */
const POSITIVES: readonly Case[] = [
  { query: "copy that pricing page and call it pricing 2025", expect: "page", bucket: "positive" },
  { query: "make a duplicate of the spring sale post so i can rework it for summer", expect: "post", bucket: "positive" },
  { query: "i want a second copy of the contact form for the events team", expect: "form", bucket: "positive" },
  { query: "clone the landing page, i'll edit the wording after", expect: "page", bucket: "positive" },
  { query: "duplicate that hero image entry so i can give it different alt text", expect: "media", bucket: "positive" },
  { query: "take the quote request form and make another one just like it", expect: "form", bucket: "positive" },
  { query: "use last year's holiday post as the starting point for a new one", expect: "post", bucket: "positive" },
  { query: "make another library entry for that same photo with a different caption", expect: "media", bucket: "positive" },
  { query: "copy the about page", expect: "page", bucket: "positive" },
  { query: "make a copy of that blog post", expect: "post", bucket: "positive" },
];

/** Copy-adjacent, but a copy is NOT what is being asked for. Hand-authored and disclosed. */
const NEAR_MISSES: readonly Case[] = [
  { query: "make this post look like that other one, same layout and headings", expect: null, bucket: "near-miss", reallyWants: "update the existing post" },
  { query: "the contact form's field list is what i want on the quote form too, add them there", expect: null, bucket: "near-miss", reallyWants: "update the quote form's fields" },
  { query: "this image is used in three places, show me where", expect: null, bucket: "near-miss", reallyWants: "read where-used" },
  { query: "can we point the old page at the new one instead of keeping two around", expect: null, bucket: "near-miss", reallyWants: "create a redirect" },
  { query: "i want that same photo but cropped differently", expect: null, bucket: "near-miss", reallyWants: "a new file — the tool's own description says a copy shares the bytes and cannot be altered independently" },
  { query: "take the wording from that post and put it in an email to our subscribers", expect: null, bucket: "near-miss", reallyWants: "create a newsletter campaign" },
  { query: "the header layout should be the same across all our pages", expect: null, bucket: "near-miss", reallyWants: "theme/template work" },
  { query: "back this page up before i start editing it", expect: null, bucket: "near-miss", reallyWants: "a restore point" },
  { query: "save a version of this form before i change anything", expect: null, bucket: "near-miss", reallyWants: "a restore point / revision" },
  { query: "we've got two identical posts up, get rid of one of them", expect: null, bucket: "near-miss", reallyWants: "delete a post" },
  { query: "push our blog posts over to the staging site", expect: null, bucket: "near-miss", reallyWants: "deployment" },
  { query: "that photo appears twice in the library, merge them", expect: null, bucket: "near-miss", reallyWants: "delete the duplicate entry" },
];

/** Readable either way. Reported, never scored — scoring these would let me pick the result. */
const AMBIGUOUS: readonly Case[] = [
  { query: "the about page and the team page have the same text, fix that", expect: null, bucket: "ambiguous" },
  { query: "i want another page like my landing page", expect: null, bucket: "ambiguous" },
  { query: "reuse the contact form", expect: null, bucket: "ambiguous" },
  { query: "we need a second version of this page for the french site", expect: null, bucket: "ambiguous" },
];

function shuffledIndices(n: number, seed: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return idx;
}

const SHUFFLE_SEED = 20260908;

function main(): void {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: tsx tool-search-argument-fill-duplicate.ts <out-dir>");
  mkdirSync(outDir, { recursive: true });

  const shipped = buildEvalToolRegistry(fakeEvalRouteDeps()).list() as readonly {
    id: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }[];
  const dup = shipped.find((d) => d.id === "content_duplicate");
  if (!dup) throw new Error("content_duplicate is not in the shipped catalog — refusing to measure a reconstruction");

  // The model-facing text: exactly what search_tools/describe_tool return.
  const description = stripSearchKeywords(dup.description ?? "");
  const schema = dup.inputSchema ?? {};
  const props = (schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {};
  const resourceProp = props.resource;
  if (!resourceProp) throw new Error("shipped content_duplicate has no `resource` property — the premise of this eval is gone");
  if (resourceProp.enum !== undefined) {
    throw new Error("shipped content_duplicate's `resource` now carries an enum — this eval measures the bare free-string shape and is stale");
  }

  // Integrity: the held-out set must contain no duplicate request, or it is not a clean negative set.
  const heldOutNamesDup = HELD_OUT_V2.some((c) => [c.expect, ...(c.alsoAcceptable ?? [])].includes("content_duplicate"));
  if (heldOutNamesDup) throw new Error("a held-out case names content_duplicate — it is no longer a clean blind negative set");

  const blind: Case[] = HELD_OUT_V2.map((c) => ({ query: c.query, expect: null, bucket: "blind-negative" as const }));
  const all = [...blind, ...POSITIVES, ...NEAR_MISSES, ...AMBIGUOUS];
  const order = shuffledIndices(all.length, SHUFFLE_SEED);
  const cases = order.map((i, position) => ({ caseNo: position + 1, ...all[i]! }));

  writeFileSync(
    join(outDir, "afill-duplicate-key.json"),
    JSON.stringify(
      {
        shuffleSeed: SHUFFLE_SEED,
        resources: [...RESOURCES],
        shippedResourceIsFreeString: true,
        counts: {
          blindNegative: blind.length,
          positive: POSITIVES.length,
          nearMiss: NEAR_MISSES.length,
          ambiguous: AMBIGUOUS.length,
          scored: all.length - AMBIGUOUS.length,
        },
        cases: cases.map((c) => ({
          caseNo: c.caseNo,
          sourceIndex: 0,
          query: c.query,
          expect: c.expect ?? "",
          alsoAcceptable: [],
          acceptableResources: c.expect === null ? [] : [c.expect],
          acceptableShippedIds: [],
          truthKind: "mutation",
          bucket: c.bucket,
          reallyWants: c.reallyWants ?? null,
        })),
        affectedCount: POSITIVES.length,
      },
      null,
      2,
    ),
  );

  const queryBlock = cases.map((c) => `${c.caseNo}. ${c.query}`).join("\n");

  const payload = (arm: string, resourceSchema: Record<string, unknown>) => `# Task — ${arm}

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call, and with what arguments.

## Available tools

You have exactly one tool, \`content_duplicate\`.

Description:

${description}

inputSchema:

\`\`\`json
${JSON.stringify({ ...schema, properties: { ...props, resource: resourceSchema } }, null, 2)}
\`\`\`

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single \`resource\` value you would pass
  to \`content_duplicate\`.
- If \`content_duplicate\` does not serve the request — what is being asked for is not a copy of one of
  the resources it duplicates — output \`NONE\`. Do not force a value that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed, and do not
  assume any particular number of them are \`NONE\`.
- Output NOTHING but the answer lines, one per request, in this exact format:

\`\`\`
1 <resource-or-NONE>
2 <resource-or-NONE>
...
${cases.length} <resource-or-NONE>
\`\`\`

## Requests

${queryBlock}
`;

  writeFileSync(join(outDir, "afill-dup-arm-M-shipped.md"), payload("arm M (content_duplicate, THE SHIPPED SCHEMA)", resourceProp));
  writeFileSync(
    join(outDir, "afill-dup-arm-N-verb-enum.md"),
    payload("arm N (content_duplicate, verb-carrying enum)", {
      type: "string",
      enum: RESOURCES.map((r) => `duplicate_${r}`),
      description: resourceProp.description,
    }),
  );

  console.log(`shipped description: ${description.split(/\s+/).filter(Boolean).length} words, resource is a free string (no enum) — confirmed against the live catalog`);
  console.log(`cases: ${cases.length}  (blind negatives ${blind.length}, positives ${POSITIVES.length}, near-misses ${NEAR_MISSES.length}, ambiguous ${AMBIGUOUS.length} reported-not-scored)`);
  console.log(`wrote payloads + key to ${outDir}`);
}

main();
