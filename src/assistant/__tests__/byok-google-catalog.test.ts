/**
 * @file The full-catalog Gemini schema validator, made permanent.
 *
 * Why this file exists, stated plainly because the cost was real: the admin BYOK chat on Google
 * Gemini was broken by SEVEN distinct tool-schema failure classes, found one at a time, over seven
 * fix-and-ship rounds (2026-08-04). Six of those were fixed by patching whatever the live 400
 * response happened to name. The unit suite went green three separate times while the product
 * stayed broken, because every existing test validated a schema the author had chosen to look at.
 * The last class — an array emitted with no `items`, from a truncated recursive `$defs` stub —
 * shipped straight through a "real catalog" test that covered 3 of 21 domains.
 *
 * So the rule this file enforces is: EVERY wired tool, EVERY node, against Gemini's own structural
 * rules, on the exact bytes `runGoogleTurn` puts on the wire (`googleParametersOf`, not
 * `sanitizeGoogleSchema` — they differ by the `enforceGoogleSchemaShape` pass, which is precisely
 * where class 7 lived). A new tool, a new domain, or a new schema idiom cannot reach a live API
 * call without passing through here first.
 *
 * The rules below are not derived from Google's published docs, which proved incomplete and
 * inconsistent when checked directly. They are the constraints a live Gemini 400 actually
 * enforced — see `GOOGLE_SUPPORTED_SCHEMA_KEYS`' own doc in `byok-provider-turn.ts` for the
 * provenance of the supported-field list.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolDescriptor } from "@jini-ai/core";

import { META_TOOL_DESCRIPTORS } from "../byok-tool-surface.js";
import { googleParametersOf } from "../byok-provider-turn.js";
import { buildAssistantToolRegistrations } from "../tool-registrations/index.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { installFirstPartyToolContributors } from "../../server/tool-catalog-manifest.js";
import type { RouteDeps } from "../../server/routes/types.js";

// `comments`/`newsletter` are contributed through the tool-contribution registry now, not
// `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array (2026-08-17) — installed here so
// "EVERY wired tool" above is not silently short 21 tools across 2 domains, the exact class of gap
// this file exists to prevent.
resetToolContributorsForTests();
installFirstPartyToolContributors();

/** Keys Gemini's `functionDeclarations[].parameters` validator rejects outright. */
const FORBIDDEN_KEYS = ["additionalProperties", "$schema", "$ref", "$defs", "const", "oneOf", "allOf", "not", "if", "then", "else"];

/**
 * A `RouteDeps` stand-in wide enough to BUILD every domain's registrations. Nothing here is called:
 * this file only reads each registration's published `descriptor.inputSchema`, so the handlers'
 * dependencies never run. Mirrors `tool-registrations.contracts.test.ts`'s own `fakeRouteDeps`.
 */
function fakeRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-google-catalog",
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as RouteDeps;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every schema node reachable from `root`, paired with a human-readable path for failure messages.
 *  Walks only the positions that hold a SCHEMA (`properties.*`, `items`, `anyOf[]`) — deliberately
 *  NOT `default`/`example`, whose values are arbitrary user data and are not schemas. Enforcing
 *  schema rules on those is a real bug this project already shipped once and caught. */
function schemaNodes(root: unknown, path: string): ReadonlyArray<{ node: Record<string, unknown>; path: string }> {
  if (!isRecord(root)) return [];
  const found = [{ node: root, path }];
  if (isRecord(root.properties)) {
    for (const [name, child] of Object.entries(root.properties)) found.push(...schemaNodes(child, `${path}.properties.${name}`));
  }
  if (root.items !== undefined) found.push(...schemaNodes(root.items, `${path}.items`));
  if (Array.isArray(root.anyOf)) {
    root.anyOf.forEach((member, index) => found.push(...schemaNodes(member, `${path}.anyOf[${index}]`)));
  }
  return found;
}

/** The four structural invariants a live Gemini 400 actually enforced, applied to one tool. */
function assertGeminiValid(descriptor: ToolDescriptor): number {
  const parameters = googleParametersOf(descriptor);
  const serialized = JSON.stringify(parameters);

  for (const key of FORBIDDEN_KEYS) {
    assert.ok(!serialized.includes(`"${key}":`), `${descriptor.id}: sanitized schema still carries "${key}"`);
  }

  const nodes = schemaNodes(parameters, descriptor.id);
  for (const { node, path } of nodes) {
    const usesAnyOf = Array.isArray(node.anyOf) && node.anyOf.length > 0;

    // Class 2 of the live failures: "must be specified when not using one_of".
    if (!usesAnyOf) {
      assert.equal(typeof node.type, "string", `${path}: every node needs a string 'type' unless it uses anyOf`);
    }

    // Class 7 — the one that shipped through a partial test. An array must say what it contains.
    if (node.type === "array") {
      assert.ok(isRecord(node.items), `${path}: type:"array" must declare 'items'`);
    }

    // Gemini's `type` is a single enum value, never the JSON-Schema `["string","null"]` idiom.
    assert.ok(!Array.isArray(node.type), `${path}: 'type' must be a single string, not an array`);

    // Gemini's `enum` is `repeated string` only — a numeric member fails with TYPE_STRING.
    if (node.enum !== undefined) {
      assert.ok(Array.isArray(node.enum), `${path}: 'enum' must be an array`);
      for (const member of node.enum as readonly unknown[]) {
        assert.equal(typeof member, "string", `${path}: every 'enum' member must be a string, got ${typeof member}`);
      }
      assert.equal(node.type, "string", `${path}: a node with 'enum' must declare type:"string"`);
    }
  }

  return nodes.length;
}

test("EVERY wired tool's outbound Gemini schema is structurally valid — the whole catalog, not a sample", () => {
  const descriptors = buildAssistantToolRegistrations(fakeRouteDeps()).map((registration) => registration.descriptor);

  // A guard on the guard: if the registry ever comes back empty (a deps-shape change silently
  // breaking the build above, say), every assertion below would vacuously pass and this file would
  // report green while validating nothing at all — the exact failure mode it exists to prevent.
  assert.ok(descriptors.length > 100, `expected the full wired catalog, got ${descriptors.length} descriptors`);

  let nodeCount = 0;
  for (const descriptor of descriptors) nodeCount += assertGeminiValid(descriptor);

  // Not an assertion, a receipt: the numbers this run actually covered, so a future reader can tell
  // whether coverage grew or quietly collapsed.
  assert.ok(nodeCount > descriptors.length, `expected multi-node schemas; got ${nodeCount} nodes across ${descriptors.length} tools`);
});

test("the 3 meta-tool descriptors are structurally valid for Gemini too — they are what a BYOK turn actually sends", () => {
  assert.equal(META_TOOL_DESCRIPTORS.length, 3);
  for (const descriptor of META_TOOL_DESCRIPTORS) assertGeminiValid(descriptor);
});

test("the meta-tool set is the payload reduction it claims to be, measured against the real catalog", () => {
  const wire = (tools: readonly ToolDescriptor[]) =>
    Buffer.byteLength(
      JSON.stringify(tools.map((t) => ({ name: t.id, description: t.description, parameters: googleParametersOf(t) }))),
      "utf8",
    );

  const full = wire(buildAssistantToolRegistrations(fakeRouteDeps()).map((r) => r.descriptor));
  const meta = wire(META_TOOL_DESCRIPTORS);

  // The claim this change was approved on was a ~134x reduction. Asserted as a floor with real
  // headroom rather than a fixed number, so ordinary catalog growth does not fail the build — but a
  // regression that quietly reintroduces the full catalog (or bloats the meta-set into something
  // that is no longer cheap) does.
  assert.ok(meta < 4_000, `meta-tool payload should stay tiny, got ${meta} bytes`);
  assert.ok(full / meta > 50, `expected the meta-set to be >50x smaller than the full catalog; got ${(full / meta).toFixed(1)}x (${full} vs ${meta} bytes)`);
});
