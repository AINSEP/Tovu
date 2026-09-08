/**
 * @file The adversarial delete-family fill set — the one measurement that prices "wrong resource,
 * DESTRUCTIVE" rather than "wrong resource, harmless".
 *
 * ## Why this set is hand-authored, and why that is safe here
 *
 * Every other arm in this eval is mechanically derived, because the blindness rule exists to stop an
 * author inflating a score (`tool-search-parent-tool-read.eval.ts`'s arm C wrote a description with
 * the eval queries in context and produced a 26-point artifact). **These queries are written by me,
 * with the 8 delete resources in front of me, deliberately chosen to be confusable.** That breaks
 * blindness in the only direction that cannot flatter anything: an adversarial set can lower a
 * measured accuracy, never raise it. The result is therefore a **lower bound on accuracy**, not an
 * unbiased estimate — and a lower bound is exactly what a destructive operation needs.
 *
 * ## Why it is needed at all
 *
 * `afill-delete-key.json`'s in-scope set is n=8 — the held-out set contains only 8 delete-family
 * cases, and all three shapes scored 8/8. **0/8 wrong has a Wilson upper bound of 32%**: on that data
 * alone a 32% wrong-resource rate on a tool that destroys things cannot be ruled out. The 8 held-out
 * queries are also well-separated ("delete that old logo image"), so they test the easy half of the
 * decision. These 20 test the hard half.
 *
 * ## Construction
 *
 * 16 BAIT cases: the query's most lexically salient noun is a DIFFERENT family resource from the one
 * the request actually targets, so a model matching on salience picks the wrong one and destroys the
 * wrong thing. 4 CONTROL cases: salient noun and target agree, to confirm the set is hard rather than
 * merely noisy. Every case has one defensible answer; the `bait` field records which sibling it is
 * built to attract, so a wrong answer can be checked against the trap it was designed to spring.
 *
 * Run: `npx tsx development/evals/tool-search-argument-fill-adversarial.ts <out-dir>`
 * MEASUREMENT ONLY.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stripSearchKeywords } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";

/** Family and card keys taken verbatim from `2026-09-08-content-delete-eval.md` §1.2/§4.1. */
const DELETE_FAMILY: readonly (readonly [string, string])[] = [
  ["content_post", "content_post_delete"],
  ["media_asset", "media_trash_asset"],
  ["comment", "comments_trash_comment"],
  ["widget_instance", "widgets_trash_instance"],
  ["theme_file", "theme_trash_file"],
  ["redirect", "redirects_tombstone"],
  ["collection_content_type", "collections_content_type_tombstone"],
  ["webhook_subscription", "webhooks_delete_subscription"],
];

interface AdversarialCase {
  readonly query: string;
  readonly expect: string;
  /** The sibling resource this query's salient vocabulary is built to attract. `null` = control. */
  readonly bait: string | null;
}

const CASES: readonly AdversarialCase[] = [
  { query: "that blog post about the summer sale has a photo in it we no longer have the rights to, take the photo down", expect: "media_asset", bait: "content_post" },
  { query: "the header image sitting in our theme folder is stale, drop it", expect: "theme_file", bait: "media_asset" },
  { query: "someone left a nasty note under the pricing article, get rid of it", expect: "comment", bait: "content_post" },
  { query: "we killed the old /pricing-2023 url forwarding rule, remove it", expect: "redirect", bait: "content_post" },
  { query: "the newsletter signup block sitting in the sidebar is obsolete, remove the block itself", expect: "widget_instance", bait: "content_post" },
  { query: "we stopped using the Event record type entirely, tear the whole type down", expect: "collection_content_type", bait: "content_post" },
  { query: "the slack notifier we set up for form submissions keeps firing, unhook it", expect: "webhook_subscription", bait: "comment" },
  { query: "delete the picture file the theme ships for its default avatar", expect: "theme_file", bait: "media_asset" },
  { query: "that photo is in our library twice, remove the duplicate library entry", expect: "media_asset", bait: "theme_file" },
  { query: "the spam remark on the about page needs removing, the page itself is fine", expect: "comment", bait: "content_post" },
  { query: "our zapier connection is dead, delete the subscription for it", expect: "webhook_subscription", bait: "redirect" },
  { query: "the old announcement page should go, but leave the forwarding rule we set up for it", expect: "content_post", bait: "redirect" },
  { query: "remove the forwarding for /old-blog but keep the article it points at", expect: "redirect", bait: "content_post" },
  { query: "get rid of the recipe record type, we already moved the recipes somewhere else", expect: "collection_content_type", bait: "content_post" },
  { query: "the sidebar block showing recent remarks should be removed, the remarks themselves stay", expect: "widget_instance", bait: "comment" },
  { query: "take out that one remark, not the block that displays remarks", expect: "comment", bait: "widget_instance" },
  { query: "delete that old logo image we don't use anymore", expect: "media_asset", bait: null },
  { query: "remove that spam remark from the site", expect: "comment", bait: null },
  { query: "take down the spring sale article, we're done with it", expect: "content_post", bait: null },
  { query: "we don't use that slack hookup anymore, remove it", expect: "webhook_subscription", bait: null },
];

function main(): void {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: tsx tool-search-argument-fill-adversarial.ts <out-dir>");
  mkdirSync(outDir, { recursive: true });

  const uncollapsed = buildEvalToolRegistry(fakeEvalRouteDeps(), undefined, { includeContentReadCollapse: false });
  const byId = new Map((uncollapsed.list() as readonly { id: string; description?: string }[]).map((d) => [d.id, d.description ?? ""]));
  const missing = DELETE_FAMILY.filter(([, id]) => !byId.has(id)).map(([, id]) => id);
  if (missing.length > 0) throw new Error(`delete-family ids absent from the catalog: ${missing.join(", ")}`);

  const keys = new Set(DELETE_FAMILY.map(([k]) => k));
  const badExpect = CASES.filter((c) => !keys.has(c.expect)).map((c) => c.expect);
  const badBait = CASES.filter((c) => c.bait !== null && !keys.has(c.bait)).map((c) => c.bait);
  if (badExpect.length > 0 || badBait.length > 0) {
    throw new Error(`case fields name resources outside the family: expect=[${badExpect.join(",")}] bait=[${badBait.join(",")}]`);
  }

  const plainOf = (id: string) => stripSearchKeywords(byId.get(id) ?? "");
  const queryBlock = CASES.map((c, i) => `${i + 1}. ${c.query}`).join("\n");

  writeFileSync(
    join(outDir, "afill-adversarial-key.json"),
    JSON.stringify(
      {
        resources: [...keys].sort(),
        hand_authored: true,
        cases: CASES.map((c, i) => ({
          caseNo: i + 1,
          sourceIndex: i,
          query: c.query,
          expect: c.expect,
          alsoAcceptable: [],
          acceptableResources: [c.expect],
          acceptableShippedIds: [],
          truthKind: "mutation",
          bait: c.bait,
        })),
        affectedCount: CASES.length,
      },
      null,
      2,
    ),
  );

  const body = (label: (k: string) => string) => DELETE_FAMILY.map(([k, id]) => `- ${label(k)}: ${plainOf(id)}`).join("\n");
  const fatPayload = (arm: string, label: (k: string) => string) => `# Task — ${arm}

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call, and with what arguments.

## Available tools

You have exactly one tool, \`content_delete\`.

Description:

Deletes, trashes, or tombstones one record this site holds. resource names WHICH kind of thing to delete. What each resource covers, in that resource's own words:
${body(label)}

inputSchema:

\`\`\`json
${JSON.stringify(
  {
    type: "object",
    additionalProperties: false,
    required: ["resource", "id"],
    properties: {
      resource: { type: "string", enum: DELETE_FAMILY.map(([k]) => label(k)), description: "Which kind of thing to delete." },
      id: { type: "string", minLength: 1, description: "The record's own id." },
    },
  },
  null,
  2,
)}
\`\`\`

## Instructions

- For EACH of the ${CASES.length} numbered requests below, output the single \`resource\` value you would pass
  to \`content_delete\`.
- The value MUST be one of the enum values in the schema, exactly as written.
- If \`content_delete\` does not serve the request, output \`NONE\`.
- Answer every request independently.
- Output NOTHING but the answer lines, one per request, in this exact format:

\`\`\`
1 <resource-or-NONE>
2 <resource-or-NONE>
...
${CASES.length} <resource-or-NONE>
\`\`\`

## Requests

${queryBlock}
`;

  writeFileSync(join(outDir, "afill-adv-arm-J-fat-noun.md"), fatPayload("arm J (content_delete, bare-noun enum, adversarial set)", (k) => k));
  writeFileSync(join(outDir, "afill-adv-arm-K-fat-verb.md"), fatPayload("arm K (content_delete, verb-carrying enum, adversarial set)", (k) => `delete_${k}`));

  writeFileSync(
    join(outDir, "afill-adv-arm-L-cards.md"),
    `# Task — arm L (content_delete as 8 cards, adversarial set)

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call.

## Available tools

${DELETE_FAMILY.map(([k, id]) => `- content_delete.${k}: ${plainOf(id)}`).join("\n")}

## Instructions

- For EACH of the ${CASES.length} numbered requests below, output the single tool id you would call.
- The id MUST be one of the ids listed above, exactly as written.
- If none of the tools above serves the request, output \`NONE\`.
- Answer every request independently.
- Output NOTHING but the answer lines, one per request, in this exact format:

\`\`\`
1 <tool-id-or-NONE>
2 <tool-id-or-NONE>
...
${CASES.length} <tool-id-or-NONE>
\`\`\`

## Requests

${queryBlock}
`,
  );

  console.log(`adversarial delete set: ${CASES.length} cases (${CASES.filter((c) => c.bait !== null).length} bait, ${CASES.filter((c) => c.bait === null).length} control)`);
  console.log(`wrote payloads + key to ${outDir}`);
}

main();
