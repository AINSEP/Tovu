/**
 * @file Builds the BLIND fixtures for the argument-fill eval
 * (`ADS-memory/reports/2026-09-08-argument-fill-eval.md`).
 *
 * ## What this measures and why a fixture builder exists at all
 *
 * Every parent-tool arm measured so far (`tool-search-parent-tool-read.eval.ts`,
 * `tool-search-fat-concat-arm.eval.ts`) scores RETRIEVAL RANK — can BM25 surface the tool. None
 * scores what happens AFTER the tool is surfaced: whether the model passes the `resource` value
 * that actually serves the request. That step is a model generation, not an index lookup, so it
 * **cannot be measured by a deterministic eval** — it needs live model calls. This file therefore
 * emits self-contained prompt payloads that a blind agent answers, plus a ground-truth key the
 * answering agents never receive; `tool-search-argument-fill.eval.ts` scores the answers.
 *
 * ## Blindness protocol (the prior investigation's most damaging error was a broken one)
 *
 * `tool-search-parent-tool-read.eval.ts`'s arm C used a description hand-written with the 130 eval
 * queries in context and produced a 26-point artifact that drove a wrong conclusion for hours.
 * Nothing here is hand-authored:
 *
 * - The fat tool's description is the mechanical concatenation of its member tools' OWN authored
 *   `description` text, keyed by {@link resourceKeyOf}'s blind id-morphology rule. Zero words are
 *   written by the eval author.
 * - The model-facing text is the STRIPPED description (`stripSearchKeywords`), because that is
 *   literally what `search_tools`/`describe_tool` return — the folded keyword/doc2query tail is
 *   indexed but never shown (`tool-catalog-query.ts`'s own comment). Feeding the folded text would
 *   hand the answering agent operator vocabulary the real model never sees.
 * - Query order is deterministically SHUFFLED. `tool-search-heldout-v2.ts`'s own header records that
 *   its 130 cases were authored "one query per tool, in the tool-dump's own domain order" — left in
 *   that order, an answering agent could infer the answer sequence from position alone.
 * - The 34 in-scope cases are not separated from the 96 out-of-scope ones. An agent that knew which
 *   queries `content_read` is supposed to serve would never have to decide whether to abstain, and
 *   the false-fill rate (the failure mode that returns confident, plausible, WRONG rows) would be
 *   unmeasurable.
 * - Ground truth is written to a separate file, never into a payload.
 *
 * Run: `npx tsx development/evals/tool-search-argument-fill-fixture.ts <out-dir>`
 * MEASUREMENT ONLY. Registers nothing; the shipping catalog is untouched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { stripSearchKeywords } from "../../apps/website/src/assistant/tool-search-keywords.js";
import { HELD_OUT_V2 } from "./tool-search-heldout-v2.js";
import { buildEvalToolRegistry, fakeEvalRouteDeps } from "./tool-search-eval-registry.js";

type Descriptor = { id: string; description?: string; inputSchema?: unknown };

/** Byte-identical to `tool-search-fat-concat-arm.eval.ts`'s Tier 1. Duplicated rather than imported
 *  for that file's own stated reason: these numbers must not move because a shared constant changed
 *  under them mid-run. */
export const TIER1_CLEAN: readonly string[] = [
  "backup_list_restore_points",
  "collections_content_type_list",
  "collections_entry_list",
  "comments_list_moderation_queue",
  "content_post_get",
  "content_post_list",
  "custom_credential_list",
  "database_list_pending_migrations",
  "database_list_restore_points",
  "deployment_list",
  "external_mcp_list",
  "forms_list_definitions",
  "identity_policy_list",
  "identity_role_list",
  "identity_user_list",
  "media_list_assets",
  "members_get_by_id",
  "members_list",
  "menus_get_menu",
  "menus_list_menus",
  "newsletter_get_campaign",
  "newsletter_list_campaigns",
  "newsletter_list_lists",
  "plugins_list",
  "redirects_get",
  "redirects_list",
  "seo_get_entry_meta",
  "settings_list_definitions",
  "taxonomy_list",
  "theme_list",
  "webhooks_list_subscriptions",
  "widgets_get_instance",
  "widgets_get_region",
  "widgets_list_instances",
  "widgets_list_regions",
  "workspace_get",
];

const VERB_TOKENS = new Set(["list", "get", "by", "id"]);

function singularize(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

/** The blind id-morphology rule the shipped cards were derived by. */
export function resourceKeyOf(toolId: string): string {
  const seen: string[] = [];
  for (const raw of toolId.split("_")) {
    if (VERB_TOKENS.has(raw)) continue;
    const t = singularize(raw);
    if (!seen.includes(t)) seen.push(t);
  }
  return seen.join("_");
}

/** Deterministic 32-bit LCG — a fixed permutation so every arm sees the identical order and the
 *  answers stay pairable case-for-case, while no arm sees the authored domain order. */
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
  if (!outDir) throw new Error("usage: tsx tool-search-argument-fill-fixture.ts <out-dir>");
  mkdirSync(outDir, { recursive: true });

  // Pre-collapse catalog: the 36 originals still exist here, which is what the fat arm collapses.
  const uncollapsed = buildEvalToolRegistry(fakeEvalRouteDeps(), undefined, { includeContentReadCollapse: false });
  const preIds = new Map((uncollapsed.list() as readonly Descriptor[]).map((d) => [d.id, d]));
  // The REAL shipped catalog, with the 29 cards, for the card-selection arm.
  const shipped = buildEvalToolRegistry(fakeEvalRouteDeps());
  const shippedIds = new Set(shipped.list().map((d) => d.id));

  // ---- Integrity gates -----------------------------------------------------------------------
  const missingTier = TIER1_CLEAN.filter((id) => !preIds.has(id));
  if (missingTier.length > 0) throw new Error(`Tier-1 ids absent from the pre-collapse catalog: ${missingTier.join(", ")}`);
  const badGround = [...new Set(HELD_OUT_V2.flatMap((c) => [c.expect, ...(c.alsoAcceptable ?? [])]))].filter((id) => !preIds.has(id));
  if (badGround.length > 0) throw new Error(`Ground-truth ids do not resolve pre-collapse: ${badGround.join(", ")}`);

  // ---- Resource keys, derived, then verified against what actually ships ----------------------
  const membersByResource = new Map<string, string[]>();
  for (const id of TIER1_CLEAN) {
    const key = resourceKeyOf(id);
    membersByResource.set(key, [...(membersByResource.get(key) ?? []), id]);
  }
  const resources = [...membersByResource.keys()].sort();
  const derivedCardIds = new Set(resources.map((r) => `content_read.${r}`));
  const shippedCardIds = new Set([...shippedIds].filter((id) => id.startsWith("content_read.")));
  const keyDrift = [...derivedCardIds].filter((id) => !shippedCardIds.has(id)).concat([...shippedCardIds].filter((id) => !derivedCardIds.has(id)));
  if (keyDrift.length > 0) throw new Error(`Derived resource keys have drifted from the shipped cards: ${keyDrift.join(", ")}`);

  /** Model-facing text: exactly what `search_tools` returns, keyword tail stripped. */
  const plainOf = (id: string) => stripSearchKeywords(preIds.get(id)?.description ?? "");

  // ---- Ground truth --------------------------------------------------------------------------
  /** Each tool's own declared `readOnly`, read straight off the built registration — used only to
   *  split the out-of-scope cases into "wanted a DIFFERENT read" and "wanted a MUTATION". Those are
   *  materially different failures: reaching for a read resource on a request that wanted another
   *  read is a near-miss inside the same verb, while doing it on a request that wanted a write is an
   *  over-trigger of the whole tool. Classified mechanically, never by judgment. */
  const readOnlyOf = new Map(
    (uncollapsed.list() as readonly { id: string; readOnly?: boolean }[]).map((d) => [d.id, d.readOnly === true]),
  );

  const order = shuffledIndices(HELD_OUT_V2.length, SHUFFLE_SEED);
  const cases = order.map((i, position) => {
    const c = HELD_OUT_V2[i]!;
    const truthIds = [c.expect, ...(c.alsoAcceptable ?? [])];
    const inScope = truthIds.filter((id) => TIER1_CLEAN.includes(id));
    return {
      caseNo: position + 1,
      sourceIndex: i,
      query: c.query,
      expect: c.expect,
      alsoAcceptable: c.alsoAcceptable ?? [],
      /** Every resource key that legitimately serves this query; empty means content_read must abstain. */
      acceptableResources: [...new Set(inScope.map(resourceKeyOf))].sort(),
      /** Every tool id that is a correct call against the SHIPPED catalog. */
      acceptableShippedIds: [
        ...new Set(truthIds.map((id) => (TIER1_CLEAN.includes(id) ? `content_read.${resourceKeyOf(id)}` : id))),
      ].sort(),
      /** "read" iff EVERY acceptable ground-truth tool declares itself read-only. */
      truthKind: truthIds.every((id) => readOnlyOf.get(id) === true) ? "read" : "mutation",
    };
  });
  const affected = cases.filter((c) => c.acceptableResources.length > 0);

  writeFileSync(
    join(outDir, "afill-key.json"),
    JSON.stringify({ shuffleSeed: SHUFFLE_SEED, resources, cases, affectedCount: affected.length }, null, 2),
  );

  // ---- Shared query block --------------------------------------------------------------------
  const queryBlock = cases.map((c) => `${c.caseNo}. ${c.query}`).join("\n");

  // ---- The fat tool's description: mechanical, labelled by resource key -----------------------
  const fatBody = resources
    .map((r) => `- ${r}: ${membersByResource.get(r)!.map(plainOf).join(" ")}`)
    .join("\n");
  const fatDescription =
    `Reads a named collection of records this site holds, or one record from it by id. ` +
    `resource names WHICH kind of thing to read. What each resource covers, in that resource's own words:\n${fatBody}`;

  const schemaFor = (enumerated: boolean) =>
    JSON.stringify(
      {
        type: "object",
        additionalProperties: false,
        required: ["resource"],
        properties: {
          resource: enumerated
            ? { type: "string", enum: resources, description: "Which kind of thing to read." }
            : {
                type: "string",
                minLength: 1,
                description:
                  "Which kind of thing to read. An unrecognized value is rejected, naming every resource this workspace currently supports.",
              },
          id: { type: "string", description: "Optional. The single record's own id. Omit to list the whole collection." },
        },
      },
      null,
      2,
    );

  const fatPayload = (arm: string, enumerated: boolean) => `# Task — arm ${arm}

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. You have decided to call the tool \`content_read\`, defined below. Your ONLY job is
to decide what \`resource\` value to pass.

## Tool: content_read

Description:

${fatDescription}

inputSchema:

\`\`\`json
${schemaFor(enumerated)}
\`\`\`

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single \`resource\` value you would pass.
${enumerated ? "- The value MUST be one of the enum values in the schema." : "- There is no enum. Output the exact string you would actually pass."}
- If \`content_read\` cannot serve the request at all — the thing being asked for is not one of the
  resources this tool reads — output \`NONE\` instead. Do not force a value that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed across
  resources, and do not assume any particular number of them are \`NONE\`.
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

  writeFileSync(join(outDir, "afill-arm-A-fat-enum.md"), fatPayload("A (fat entry, closed enum)", true));

  // ---- Arm A2: arm A's decision with arm C's FRAMING ------------------------------------------
  // Arm A's prompt pre-commits the model ("You have decided to call the tool content_read"), which
  // is a fair model of an agent that has just retrieved the fat entry — but it is NOT symmetric with
  // arm C, which offers the tools and lets the model decline. Left unseparated, every abstention
  // difference between A and C is attributable to my own prompt rather than to either design. A2
  // holds the design fixed and adopts C's framing verbatim, so A-vs-A2 isolates the framing and
  // A2-vs-C isolates the design.
  const a2Payload = `# Task — arm A2 (fat entry, closed enum, free to decline)

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call, and with what arguments.

## Available tools

You have exactly one tool, \`content_read\`.

Description:

${fatDescription}

inputSchema:

\`\`\`json
${schemaFor(true)}
\`\`\`

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single \`resource\` value you would pass
  to \`content_read\`.
- The value MUST be one of the enum values in the schema, exactly as written.
- If \`content_read\` does not serve the request — the thing being asked for is not one of the
  resources it reads — output \`NONE\`. Do not force a value that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed across the
  enum values, and do not assume any particular number of them are \`NONE\`.
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
  writeFileSync(join(outDir, "afill-arm-A2-fat-enum-neutral.md"), a2Payload);

  writeFileSync(join(outDir, "afill-arm-B-fat-free.md"), fatPayload("B (fat entry, free-string resource)", false));

  // ---- Arm C: the card design's counterpart decision, held INFORMATION-SYMMETRIC to arm A ------
  // Arm A shows the model 29 resources with their own text and asks for a `resource` ARGUMENT.
  // Arm C shows the model the identical 29 resources with the identical text and asks for a TOOL ID.
  // The retrieval step is deliberately NOT re-measured here — it is already measured
  // deterministically for both designs (`tool-search-fat-concat-arm.eval.ts`: D1-strict 85% top-10
  // on the affected cases, C2 97%). Holding it out is what makes A-vs-C attributable to the shape
  // of the choice rather than to how the candidates were reached.
  //
  // Each card's text is exactly what `describe_tool` returns for the SHIPPED card — the same
  // stripped member-description concatenation arm A folds into its labelled fat description.
  const cardBlock = resources
    .map((r) => `- content_read.${r}: ${membersByResource.get(r)!.map(plainOf).join(" ")}`)
    .join("\n");

  const cardPayload = `# Task — arm C (card design: the same choice, expressed as a tool id)

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call.

## Available tools

${cardBlock}

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single tool id you would call.
- The id MUST be one of the ids listed above, exactly as written.
- If none of the tools above serves the request — the thing being asked for is not one of them —
  output \`NONE\`. Do not force a tool that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed across tools,
  and do not assume any particular number of them are \`NONE\`.
- Output NOTHING but the answer lines, one per request, in this exact format:

\`\`\`
1 <tool-id-or-NONE>
2 <tool-id-or-NONE>
...
${cases.length} <tool-id-or-NONE>
\`\`\`

## Requests

${queryBlock}
`;
  writeFileSync(join(outDir, "afill-arm-C-card-pick.md"), cardPayload);

  // ---- Arms D and E: the 2x2 that separates GRANULARITY from VERB-LABELLING -------------------
  // A2 (one fat entry) false-fills on out-of-scope requests where C (29 cards) abstains. Two
  // mechanisms could produce that and the A2-vs-C contrast cannot tell them apart:
  //   (i)  GRANULARITY — one option that covers everything invites being applied to everything;
  //   (ii) VERB-LABELLING — every card id the model must type contains the word `content_read`,
  //        whereas the fat entry's enum values are bare resource NOUNS with no verb attached, so
  //        choosing among them answers "what is this request ABOUT", not "what should I DO".
  // D holds granularity at 29 and STRIPS the verb (bare-noun tool ids). E holds granularity at 1
  // and ADDS the verb (enum values prefixed `read_`). Whichever variable moves the abstention rate
  // is the mechanism.
  const bareCardBlock = resources
    .map((r) => `- ${r}: ${membersByResource.get(r)!.map(plainOf).join(" ")}`)
    .join("\n");

  const barePayload = `# Task — arm D (29 tools, bare-noun ids)

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call.

## Available tools

${bareCardBlock}

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single tool id you would call.
- The id MUST be one of the ids listed above, exactly as written.
- If none of the tools above serves the request — the thing being asked for is not one of them —
  output \`NONE\`. Do not force a tool that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed across tools,
  and do not assume any particular number of them are \`NONE\`.
- Output NOTHING but the answer lines, one per request, in this exact format:

\`\`\`
1 <tool-id-or-NONE>
2 <tool-id-or-NONE>
...
${cases.length} <tool-id-or-NONE>
\`\`\`

## Requests

${queryBlock}
`;
  writeFileSync(join(outDir, "afill-arm-D-bare-noun-cards.md"), barePayload);

  const verbResources = resources.map((r) => `read_${r}`);
  const verbFatBody = resources
    .map((r) => `- read_${r}: ${membersByResource.get(r)!.map(plainOf).join(" ")}`)
    .join("\n");
  const verbFatDescription =
    `Reads a named collection of records this site holds, or one record from it by id. ` +
    `resource names WHICH kind of thing to read. What each resource covers, in that resource's own words:\n${verbFatBody}`;
  const verbSchema = JSON.stringify(
    {
      type: "object",
      additionalProperties: false,
      required: ["resource"],
      properties: {
        resource: { type: "string", enum: verbResources, description: "Which kind of thing to read." },
        id: { type: "string", description: "Optional. The single record's own id. Omit to list the whole collection." },
      },
    },
    null,
    2,
  );

  const verbPayload = `# Task — arm E (fat entry, verb-carrying enum, free to decline)

You are the tool-calling model behind a website admin assistant. A site administrator types a request
in their own words. Your ONLY job is to decide which tool you would call, and with what arguments.

## Available tools

You have exactly one tool, \`content_read\`.

Description:

${verbFatDescription}

inputSchema:

\`\`\`json
${verbSchema}
\`\`\`

## Instructions

- For EACH of the ${cases.length} numbered requests below, output the single \`resource\` value you would pass
  to \`content_read\`.
- The value MUST be one of the enum values in the schema, exactly as written.
- If \`content_read\` does not serve the request — the thing being asked for is not one of the
  resources it reads — output \`NONE\`. Do not force a value that does not fit.
- Answer every request independently. Do not assume the answers are evenly distributed across the
  enum values, and do not assume any particular number of them are \`NONE\`.
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
  writeFileSync(join(outDir, "afill-arm-E-fat-verb-enum.md"), verbPayload);


  console.log(`resources derived: ${resources.length} (verified identical to the shipped card set)`);
  console.log(`cases: ${cases.length}   in-scope for content_read: ${affected.length}   out-of-scope: ${cases.length - affected.length}`);
  console.log(`fat description words: ${fatDescription.split(/\s+/).filter(Boolean).length}`);
  console.log(`wrote payloads + key to ${outDir}`);
}

// Only build fixtures when invoked directly; `tool-search-argument-fill.eval.ts` imports
// `TIER1_CLEAN`/`resourceKeyOf` from here so the two files cannot disagree about the collapse set.
if (process.argv[1]?.endsWith("tool-search-argument-fill-fixture.ts")) main();
