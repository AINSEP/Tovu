import assert from "node:assert/strict";
import test from "node:test";

import { menusAgentToolCatalog } from "@jini-ai/cms/navigation";
import type { ToolDescriptor } from "@jini-ai/core";

import { getRedirectsAgentToolCatalog } from "../../redirects/agent-tools.js";
import { postAgentToolCatalog } from "../../features/post/agent-tools.js";
import { startStubProviderServer } from "../../server/__tests__/helpers/stub-provider-server.js";
import {
  coerceNumericEnumStringsToNumbers,
  findNumericEnumPaths,
  runByokProviderTurn,
  sanitizeGoogleSchema,
  type ByokProviderTurnInput,
} from "../byok-provider-turn.js";

/**
 * @file Regression coverage for the Gemini BYOK failure reported 2026-08-04 from the admin dock's
 * API · BYOK / Google Gemini path — in three waves, each one the owner's own retry surfacing the
 * NEXT thing the previous fix hadn't covered yet:
 *
 * 1. Every one of the ~128-tool catalog's hand-authored `inputSchema`s carries
 *    `additionalProperties: false` (confirmed live: `packages/cms/src/entries/agent-tools.ts` and
 *    others), which Google's Generative Language API's restricted OpenAPI-subset `Schema` has no
 *    field for — a protobuf "Cannot find field" error, once per declaration.
 * 2. Stripping only that one key was incomplete: the same catalog also uses `const`/`oneOf`
 *    (`@jini-ai/cms/navigation`'s `NAV_TARGET_SCHEMA`, this repo's own
 *    `features/post/agent-tools.ts`'s `TIPTAP_DOC_SCHEMA`) and, in those same two schemas, a
 *    genuinely recursive `$ref`/`$defs` tree.
 * 3. Even the allowlist-based fix from wave 2 missed two more shapes the owner's actual live 400
 *    response named: a JSON-Schema nullable `type` ARRAY (`type: ["string","null"]` — Gemini's
 *    `type` is one enum value, not a repeating list) across 5 domains' schemas, and a numeric
 *    `enum` (`redirects`'s `statusCode: [301,302,307,308]` — Gemini's `enum` is `repeated string`
 *    only). The second of these has a real runtime hazard beyond the wire format: converting it
 *    naively changes what the model sends back to the tool (a string where the handler expects a
 *    number), so the fix has two coordinated halves — see `runByokProviderTurn(google): a
 *    numeric-enum tool` below.
 *
 * `sanitizeGoogleSchema` (in `byok-provider-turn.ts`, applied only inside `runGoogleTurn`) is the
 * fix for all three waves; `findNumericEnumPaths`/`coerceNumericEnumStringsToNumbers` are the
 * second half of wave 3's numeric-`enum` fix, applied at the tool-call boundary rather than inside
 * the schema conversion itself. This file pins:
 * 1. The sanitizer's key-level behavior in isolation: drop (`additionalProperties`/`$schema`),
 *    convert (`const` → `enum`, `oneOf` → `anyOf`, numeric `enum` → string `enum`, `type` array →
 *    single `type` + `nullable`), and depth-bounded `$ref`/`$defs` inlining — at every schema depth
 *    (top level, `properties.*`, `items`, `anyOf` members, and specifically the 2-level-deep nesting
 *    the owner's real `const` error showed), and that ordinary keys (`type`, `description`, `enum`,
 *    `required`, `format`, `default`) and, distinctly, arbitrary PROPERTY NAMES (as opposed to
 *    schema keywords) pass through untouched.
 * 2. Against the REAL, live catalog schemas (`menusAgentToolCatalog`, `postAgentToolCatalog`,
 *    `getRedirectsAgentToolCatalog()`), not reconstructions — the schemas that actually broke BYOK
 *    on the second and third attempts — asserting the sanitized output contains none of Gemini's
 *    confirmed-unsupported keys/shapes anywhere, and that every schema node has an explicit `type`
 *    unless it uses `anyOf` (Gemini's own confirmed requirement, from the same "Available Fields"
 *    evidence).
 * 3. End to end, through `runByokProviderTurn`: a tool schema carrying `additionalProperties` at
 *    top level AND nested reaches Gemini's outbound request body fully stripped, while the exact
 *    same schema reaches Anthropic's outbound request body byte-identical — proving the fix is
 *    scoped to the Google protocol adapter only, not a global schema rewrite that would also
 *    silently change what Anthropic/OpenAI/Azure receive.
 */

test("sanitizeGoogleSchema strips additionalProperties/$schema/$ref/$defs at the top level", () => {
  const input = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    properties: { name: { type: "string" } },
    required: ["name"],
  };
  assert.deepEqual(sanitizeGoogleSchema(input), {
    type: "object",
    properties: { name: { type: "string" } },
    required: ["name"],
  });
});

test("sanitizeGoogleSchema strips the same keys when nested in properties/items/anyOf, and preserves everything else", () => {
  const input = {
    type: "object",
    additionalProperties: false,
    properties: {
      tags: {
        type: "array",
        items: { type: "object", additionalProperties: false, properties: { id: { type: "string" } } },
      },
      target: {
        anyOf: [
          { type: "object", $ref: "#/$defs/widget", additionalProperties: false },
          { type: "null" },
        ],
      },
      note: { type: "string", description: "kept", enum: ["a", "b"], format: "date-time", default: "a" },
    },
    $defs: { widget: { type: "object" } },
    required: ["tags"],
  };

  assert.deepEqual(sanitizeGoogleSchema(input), {
    type: "object",
    properties: {
      tags: {
        type: "array",
        items: { type: "object", properties: { id: { type: "string" } } },
      },
      target: {
        anyOf: [{ type: "object" }, { type: "null" }],
      },
      note: { type: "string", description: "kept", enum: ["a", "b"], format: "date-time", default: "a" },
    },
    required: ["tags"],
  });
});

test("sanitizeGoogleSchema leaves non-schema values (primitives, empty object) untouched", () => {
  assert.equal(sanitizeGoogleSchema("x"), "x");
  assert.equal(sanitizeGoogleSchema(5), 5);
  assert.equal(sanitizeGoogleSchema(null), null);
  assert.deepEqual(sanitizeGoogleSchema({}), {});
});

test("sanitizeGoogleSchema converts const to enum, top-level and nested", () => {
  const input = {
    type: "object",
    properties: {
      kind: { const: "entryRef" },
      target: { type: "object", properties: { discriminator: { const: "x" } } },
    },
  };
  assert.deepEqual(sanitizeGoogleSchema(input), {
    type: "object",
    properties: {
      // `type: "string"` is synthesized, not present on the input — a bare `const` has no sibling
      // `type` in real JSON Schema (the literal already implies one), but `enum` alone is not valid
      // standalone on Gemini's `Schema` (see `inferGoogleTypeFromLiteral`'s doc).
      kind: { type: "string", enum: ["entryRef"] },
      target: { type: "object", properties: { discriminator: { type: "string", enum: ["x"] } } },
    },
  });
});

test("sanitizeGoogleSchema converts a const nested exactly 2 properties-levels deep, matching the owner's real error path (declaration[102].parameters.properties[4].value.properties[0].value)", () => {
  // Google's own error paths index the `properties` map by entry position: `properties[4].value`
  // means "the 5th declared property's value schema", `.properties[0].value` means "THAT schema's
  // own 1st property's value schema". Reproduced here with 5 top-level properties (so the affected
  // one really is entry index 4) whose 5th one nests one more `properties` level before the `const`.
  const input = {
    type: "object",
    properties: {
      a: { type: "string" },
      b: { type: "string" },
      c: { type: "string" },
      d: { type: "string" },
      target: { type: "object", properties: { kind: { const: "entryRef" }, entryId: { type: "string" } } },
    },
  };
  const sanitized = sanitizeGoogleSchema(input) as { properties: { target: { properties: { kind: unknown } } } };
  assert.deepEqual(sanitized.properties.target.properties.kind, { type: "string", enum: ["entryRef"] });
});

test("sanitizeGoogleSchema collapses a type array (JSON-Schema nullable idiom) to a single type plus nullable, top-level and nested", () => {
  assert.deepEqual(sanitizeGoogleSchema({ type: ["string", "null"] }), { type: "string", nullable: true });
  // Order-independent: "null" can appear first.
  assert.deepEqual(sanitizeGoogleSchema({ type: ["null", "integer"] }), { type: "integer", nullable: true });
  // A bare single-element array with no "null" member — still needs collapsing to a plain string,
  // just without `nullable`.
  assert.deepEqual(sanitizeGoogleSchema({ type: ["string"] }), { type: "string" });

  const nested = {
    type: "object",
    properties: {
      ledgerEventId: { type: ["string", "null"], description: "nullable id" },
    },
  };
  assert.deepEqual(sanitizeGoogleSchema(nested), {
    type: "object",
    properties: { ledgerEventId: { type: "string", nullable: true, description: "nullable id" } },
  });
});

test("sanitizeGoogleSchema stringifies a numeric enum and forces type to string, top-level and nested", () => {
  const input = { type: "integer", enum: [301, 302, 307, 308], description: "status" };
  assert.deepEqual(sanitizeGoogleSchema(input), { type: "string", enum: ["301", "302", "307", "308"], description: "status" });

  const nested = { type: "object", properties: { statusCode: { type: "integer", enum: [301, 302] } } };
  assert.deepEqual(sanitizeGoogleSchema(nested), { type: "object", properties: { statusCode: { type: "string", enum: ["301", "302"] } } });

  // A string enum is NOT touched by this conversion — only a genuinely numeric one.
  const stringEnum = { type: "string", enum: ["active", "disabled"] };
  assert.deepEqual(sanitizeGoogleSchema(stringEnum), stringEnum);
});

test("sanitizeGoogleSchema converts oneOf to anyOf, merging with a sibling anyOf if present, and preserving arbitrary property names inside each branch", () => {
  const oneOfOnly = { oneOf: [{ type: "string" }, { type: "number" }] };
  assert.deepEqual(sanitizeGoogleSchema(oneOfOnly), { anyOf: [{ type: "string" }, { type: "number" }] });

  const oneOfWithSiblingAnyOf = { anyOf: [{ type: "boolean" }], oneOf: [{ type: "string" }] };
  assert.deepEqual(sanitizeGoogleSchema(oneOfWithSiblingAnyOf), { anyOf: [{ type: "boolean" }, { type: "string" }] });

  // A tagged-union oneOf, matching the shape both real catalog sites (NAV_TARGET_SCHEMA, blockNode)
  // actually use: each branch a `properties` map with arbitrary property names, one of them `const`.
  const taggedUnion = {
    oneOf: [
      { type: "object", additionalProperties: false, required: ["kind", "entryId"], properties: { kind: { const: "entryRef" }, entryId: { type: "string" } } },
      { type: "object", additionalProperties: false, required: ["kind", "href"], properties: { kind: { const: "url" }, href: { type: "string" } } },
    ],
  };
  assert.deepEqual(sanitizeGoogleSchema(taggedUnion), {
    anyOf: [
      { type: "object", required: ["kind", "entryId"], properties: { kind: { type: "string", enum: ["entryRef"] }, entryId: { type: "string" } } },
      { type: "object", required: ["kind", "href"], properties: { kind: { type: "string", enum: ["url"] }, href: { type: "string" } } },
    ],
  });
});

test("sanitizeGoogleSchema inlines a non-recursive $ref/$defs pointer by value", () => {
  const input = {
    type: "object",
    properties: { name: { $ref: "#/$defs/nonEmptyString" } },
    $defs: { nonEmptyString: { type: "string", minLength: 1 } },
  };
  assert.deepEqual(sanitizeGoogleSchema(input), {
    type: "object",
    properties: { name: { type: "string", minLength: 1 } },
  });
});

test("sanitizeGoogleSchema inlines a genuinely recursive $ref/$defs schema up to MAX_GOOGLE_REF_DEPTH, then substitutes a valid non-recursive stub instead of looping forever", () => {
  // A minimal self-referential tree schema, same shape as the real navItem/blockNode schemas:
  // `node` contains `children: array of node`, referenced via `$ref`.
  const input = {
    type: "object",
    $defs: {
      node: {
        type: "object",
        properties: { id: { type: "string" }, children: { type: "array", items: { $ref: "#/$defs/node" } } },
      },
    },
    properties: { root: { $ref: "#/$defs/node" } },
  };

  const output = sanitizeGoogleSchema(input) as Record<string, unknown>;
  const serialized = JSON.stringify(output);

  // Terminates (this assertion running at all proves it didn't infinite-loop) and stays a bounded
  // size rather than growing without limit.
  assert.ok(serialized.length < 20_000, `expected a bounded output size, got ${serialized.length} chars`);
  // No unresolved reference indirection reaches the wire.
  assert.ok(!serialized.includes("$ref"));
  assert.ok(!serialized.includes("$defs"));
  // The root and at least one nested level are still fully described (not immediately flattened).
  const root = (output.properties as Record<string, unknown>).root as Record<string, unknown>;
  assert.equal(root.type, "object");
  assert.ok(isPlainObject((root.properties as Record<string, unknown>).children));
});

test("sanitizeGoogleSchema, applied to the REAL menusAgentToolCatalog (@jini-ai/cms/navigation), postAgentToolCatalog, and getRedirectsAgentToolCatalog() (this repo), never emits a Gemini-unsupported key or shape anywhere", () => {
  const forbiddenKeys = ["additionalProperties", "$schema", "$ref", "$defs", "const", "oneOf", "allOf"];
  const catalogs: ReadonlyArray<{ readonly domain: string; readonly tools: ReadonlyArray<{ readonly name: string; readonly inputSchema?: unknown }> }> = [
    { domain: "menus", tools: menusAgentToolCatalog },
    { domain: "post", tools: postAgentToolCatalog },
    { domain: "redirects", tools: getRedirectsAgentToolCatalog() },
  ];

  for (const { domain, tools } of catalogs) {
    assert.ok(tools.length > 0, `expected ${domain}'s catalog to be non-empty`);
    for (const tool of tools) {
      const sanitized = sanitizeGoogleSchema(tool.inputSchema ?? { type: "object", properties: {} });
      const serialized = JSON.stringify(sanitized);
      for (const key of forbiddenKeys) {
        assert.ok(!serialized.includes(`"${key}"`), `${domain}.${tool.name}: sanitized schema still contains "${key}": ${serialized}`);
      }
      assertEveryNodeHasATypeUnlessItIsAnyOf(sanitized, `${domain}.${tool.name}`);
      assertNoTypeArraysOrNumericEnums(sanitized, `${domain}.${tool.name}`);
    }
  }
});

test("on the REAL redirects catalog: sanitizeGoogleSchema converts statusCode's numeric enum to strings, and findNumericEnumPaths finds exactly that field on both affected tools", () => {
  const tools = getRedirectsAgentToolCatalog();
  const create = tools.find((t) => t.name === "redirects_create");
  const update = tools.find((t) => t.name === "redirects_update");
  assert.ok(create?.inputSchema && update?.inputSchema, "expected redirects_create and redirects_update, each with an inputSchema, in the catalog");

  const sanitizedCreate = sanitizeGoogleSchema(create.inputSchema) as { properties: { statusCode: { type: string; enum: string[] } } };
  assert.equal(sanitizedCreate.properties.statusCode.type, "string");
  assert.deepEqual(sanitizedCreate.properties.statusCode.enum, ["301", "302", "307", "308"]);

  assert.deepEqual(findNumericEnumPaths(create.inputSchema), ["statusCode"]);
  assert.deepEqual(findNumericEnumPaths(update.inputSchema), ["statusCode"]);
});

test("coerceNumericEnumStringsToNumbers converts a numeric-looking string at a found path back to a number, and leaves everything else alone", () => {
  const paths = ["statusCode"];
  assert.deepEqual(coerceNumericEnumStringsToNumbers({ statusCode: "301", fromPattern: "/old" }, paths), { statusCode: 301, fromPattern: "/old" });
  // Already a number (a well-behaved caller, or a protocol that never stringified it) — left as-is.
  assert.deepEqual(coerceNumericEnumStringsToNumbers({ statusCode: 301 }, paths), { statusCode: 301 });
  // Not a numeric-looking string — left as-is; the tool handler's own validation reports this, not
  // this coercion step.
  assert.deepEqual(coerceNumericEnumStringsToNumbers({ statusCode: "not-a-number" }, paths), { statusCode: "not-a-number" });
  // No paths for this tool — input passed through unchanged, no cloning even attempted.
  const input = { anything: "x" };
  assert.equal(coerceNumericEnumStringsToNumbers(input, []), input);
  // Nested path.
  assert.deepEqual(coerceNumericEnumStringsToNumbers({ target: { statusCode: "302" } }, ["target.statusCode"]), { target: { statusCode: 302 } });
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Mirrors Gemini's own confirmed requirement (the same "Available Fields" 400 response this
 *  module's other tests cite also showed the API rejecting a nested schema with no `type` and no
 *  `oneOf`/`anyOf`) — walks every schema node reachable from `properties`/`items`/`anyOf` and fails
 *  loudly if one has neither `type` nor `anyOf`. */
function assertEveryNodeHasATypeUnlessItIsAnyOf(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      assertEveryNodeHasATypeUnlessItIsAnyOf(entry, `${path}[${index}]`);
    });
    return;
  }
  if (!isPlainObject(node)) return;
  const hasType = typeof node.type === "string";
  const hasAnyOf = Array.isArray(node.anyOf);
  assert.ok(hasType || hasAnyOf, `${path}: schema node has neither "type" nor "anyOf" — Gemini requires one: ${JSON.stringify(node)}`);
  if (isPlainObject(node.properties)) {
    for (const [name, propSchema] of Object.entries(node.properties)) assertEveryNodeHasATypeUnlessItIsAnyOf(propSchema, `${path}.properties.${name}`);
  }
  if (node.items !== undefined) assertEveryNodeHasATypeUnlessItIsAnyOf(node.items, `${path}.items`);
  if (Array.isArray(node.anyOf)) assertEveryNodeHasATypeUnlessItIsAnyOf(node.anyOf, `${path}.anyOf`);
}

/** The two shapes from the owner's real third-wave 400 response: a `type` that is itself an array
 *  (Gemini's `type` must be a single value), and an `enum` carrying a non-string member (Gemini's
 *  `enum` is `repeated string` only). Walks the same reachable positions as
 *  {@link assertEveryNodeHasATypeUnlessItIsAnyOf}. */
function assertNoTypeArraysOrNumericEnums(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => {
      assertNoTypeArraysOrNumericEnums(entry, `${path}[${index}]`);
    });
    return;
  }
  if (!isPlainObject(node)) return;
  assert.ok(!Array.isArray(node.type), `${path}: "type" is still an array after sanitizing: ${JSON.stringify(node.type)}`);
  if (Array.isArray(node.enum)) {
    for (const member of node.enum) {
      assert.equal(typeof member, "string", `${path}: enum member ${JSON.stringify(member)} is not a string`);
    }
  }
  if (isPlainObject(node.properties)) {
    for (const [name, propSchema] of Object.entries(node.properties)) assertNoTypeArraysOrNumericEnums(propSchema, `${path}.properties.${name}`);
  }
  if (node.items !== undefined) assertNoTypeArraysOrNumericEnums(node.items, `${path}.items`);
  if (Array.isArray(node.anyOf)) assertNoTypeArraysOrNumericEnums(node.anyOf, `${path}.anyOf`);
}

/** A tool schema deliberately shaped like the real CMS catalog's entries: `additionalProperties`
 *  both at the top level and nested inside an object-typed property, plus a `$schema` marker — the
 *  exact combination the live failure needed before it would reproduce nested, not just top-level. */
const TOOL_WITH_NESTED_ADDITIONAL_PROPERTIES: ToolDescriptor = {
  id: "demo_tool",
  description: "a demo tool",
  inputSchema: {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    properties: {
      filter: { type: "object", additionalProperties: false, properties: { slug: { type: "string" } } },
    },
    required: [],
  },
};

/**
 * Boots a real loopback stub in place of the outbound provider call (see `stub-provider-server.ts`'s
 * doc: `@jini-ai/agent-runtime`'s adapters now dial `pinnedFetch` — `node:https`/`node:http` directly
 * — not `globalThis.fetch`, so stubbing the global no longer intercepts anything), captures the
 * FIRST request's JSON body, and replies `400 {}` — enough to end the turn in an `'error'` event
 * without needing real SSE framing, since this test only cares about what was SENT, not the
 * (never-reached) response handling.
 */
async function captureOutboundRequest(t: import("node:test").TestContext): Promise<{ baseUrl: string; body(): Record<string, unknown> }> {
  let captured: Record<string, unknown> | undefined;
  const baseUrl = await startStubProviderServer(t, (_callCount, requestBody) => {
    captured = requestBody;
    return { status: 400, body: "{}" };
  });
  return {
    baseUrl,
    body() {
      assert.ok(captured, "expected the stub provider server to have received a request");
      return captured as Record<string, unknown>;
    },
  };
}

function baseInput(protocol: ByokProviderTurnInput["protocol"], baseUrl: string): ByokProviderTurnInput {
  return {
    protocol,
    baseUrl,
    apiKey: "test-key-not-real",
    model: protocol === "google" ? "gemini-3.6-flash" : "claude-opus-4-8",
    system: "be terse",
    messages: [{ role: "user", content: "hi" }],
    tools: [TOOL_WITH_NESTED_ADDITIONAL_PROPERTIES],
    executeTool: async () => {
      throw new Error("must not be called — the stub server never returns a tool call");
    },
    onEvent: () => {},
    signal: undefined,
  } satisfies ByokProviderTurnInput;
}

test("runByokProviderTurn(google): the outbound Gemini request has additionalProperties/$schema stripped, top-level and nested", async (t) => {
  const capture = await captureOutboundRequest(t);
  await runByokProviderTurn(baseInput("google", capture.baseUrl));

  const body = capture.body();
  const tools = body.tools as Array<{ functionDeclarations: Array<{ parameters: Record<string, unknown> }> }>;
  const parameters = tools[0].functionDeclarations[0].parameters;

  assert.deepEqual(parameters, {
    type: "object",
    properties: {
      filter: { type: "object", properties: { slug: { type: "string" } } },
    },
    required: [],
  });
  // Defense against a future edit accidentally reintroducing the stripped keys anywhere in the
  // outbound payload, not just at the two positions asserted above by shape.
  assert.ok(!JSON.stringify(parameters).includes("additionalProperties"));
  assert.ok(!JSON.stringify(parameters).includes("$schema"));
});

test("runByokProviderTurn(anthropic): the SAME tool schema reaches the outbound request untouched — additionalProperties/$schema preserved", async (t) => {
  const capture = await captureOutboundRequest(t);
  await runByokProviderTurn(baseInput("anthropic", capture.baseUrl));

  const body = capture.body();
  const tools = body.tools as Array<{ input_schema: Record<string, unknown> }>;

  assert.deepEqual(tools[0].input_schema, TOOL_WITH_NESTED_ADDITIONAL_PROPERTIES.inputSchema);
  assert.ok(JSON.stringify(tools[0].input_schema).includes("additionalProperties"));
});

/** Real Gemini `streamGenerateContent` SSE framing (data-only, no `event:` line — matches
 *  `google-messages.ts`'s `decodeSseStream` parser, same shape `assistant-byok-routes.test.ts`'s
 *  own Google helpers use). */
function googleChunk(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
function googleFunctionCallFrame(name: string, args: unknown, id: string): string {
  return googleChunk({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args, id } }] }, index: 0 }] });
}
function googleTextFrame(text: string, finishReason: string): string {
  return googleChunk({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason, index: 0 }] });
}

test("runByokProviderTurn(google): a numeric-enum tool (redirects_create) round-trips end to end — Gemini sends back statusCode as a STRING, and the tool executor still receives a NUMBER", async (t) => {
  // Real loopback stub, not `globalThis.fetch` — see `stub-provider-server.ts`'s doc: the Google
  // adapter now dials `pinnedFetch` (`node:https`/`node:http` directly), which never reads the
  // global. Scripted the same two calls as before: the tool-call turn, then the finishing reply.
  const baseUrl = await startStubProviderServer(t, (callCount) => {
    if (callCount === 1) {
      // Simulates exactly the failure mode this test guards against: Gemini, having been told
      // `statusCode` is a string enum (this tool's sanitized schema), sends the tool call back with
      // `statusCode: "301"` — a string, not the `301` number the tool descriptor's real schema
      // declares and the tool handler expects.
      return { status: 200, body: googleFunctionCallFrame("redirects_create", { statusCode: "301", fromPattern: "/old", toTarget: "/new", matchType: "exact" }, "call_1") };
    }
    return { status: 200, body: googleTextFrame("Created.", "STOP") };
  });

  const statusCodeSchema = getRedirectsAgentToolCatalog().find((t2) => t2.name === "redirects_create")?.inputSchema;
  assert.ok(statusCodeSchema, "expected redirects_create to carry an inputSchema");

  let receivedInput: unknown;
  await runByokProviderTurn({
    protocol: "google",
    baseUrl,
    apiKey: "test-key-not-real",
    model: "gemini-3.6-flash",
    system: "be terse",
    messages: [{ role: "user", content: "create a redirect" }],
    tools: [{ id: "redirects_create", description: "create a redirect", inputSchema: statusCodeSchema }],
    executeTool: async (call) => {
      receivedInput = call.input;
      return { content: "ok" };
    },
    onEvent: () => {},
  });

  assert.ok(isRecordForTest(receivedInput), "expected the tool executor to have been called with an input object");
  assert.equal(receivedInput.statusCode, 301, "expected statusCode to be coerced back to a number before the tool executor saw it");
  assert.equal(typeof receivedInput.statusCode, "number");
});

function isRecordForTest(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * OpenAI/Azure Chat Completions streaming-delta SSE framing (`data: {...}\n\n`, terminated by a
 * literal `data: [DONE]\n\n` — matches `openai-chat.ts`'s `processOpenAiStreamFrame`/
 * `DONE_SENTINEL`, which `azure-chat.ts` reuses byte-identically per that module's own header:
 * "Azure OpenAI's chat-completions JSON request/response body is byte-identical to plain
 * OpenAI's"). `runOpenAiTurn`/`runAzureTurn` (`byok-provider-turn.ts`) are each their OWN function
 * body with their own copy of the `[tool error] ` fold/derive logic — hitting it through one
 * protocol does not cover the other's copy, so both get exercised below.
 */
function openAiChunk(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}
const OPENAI_DONE = "data: [DONE]\n\n";

/** One combined streaming turn: a chunk announcing every parallel tool call (id/name/full
 *  arguments together — a caller may dribble `function.arguments` across several chunks in a real
 *  stream, but a single chunk per call is an equally valid accumulation per
 *  `accumulateOpenAiToolCallDelta`), then a `finish_reason: "tool_calls"` trailer chunk. */
function openAiToolCallChunks(calls: ReadonlyArray<{ index: number; id: string; name: string; argsJson: string }>): string {
  const deltaChunk = openAiChunk({
    choices: [{ index: 0, delta: { tool_calls: calls.map((c) => ({ index: c.index, id: c.id, function: { name: c.name, arguments: c.argsJson } })) }, finish_reason: null }],
  });
  const trailerChunk = openAiChunk({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  return deltaChunk + trailerChunk;
}

function openAiTextChunks(text: string): string {
  const textChunk = openAiChunk({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
  const trailerChunk = openAiChunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  return textChunk + trailerChunk;
}

function byokTools(...ids: string[]): ToolDescriptor[] {
  return ids.map((id) => ({ id, description: id, inputSchema: { type: "object", properties: {}, required: [] } }));
}

test("runByokProviderTurn(azure): refuses with stopReason 'error' when no baseUrl is supplied, rather than attempting a request (every Azure OpenAI resource has its own endpoint — there is no sane global default)", async () => {
  const events: unknown[] = [];
  const result = await runByokProviderTurn({
    protocol: "azure",
    // No baseUrl and no stub server started for this test — if this ever DID attempt a real
    // request, it would try to reach a real (non-loopback) host and this test would hang or fail
    // with a connection error instead of resolving immediately with the expected refusal.
    apiKey: "test-key-not-real",
    model: "gpt-5-deployment",
    system: "be terse",
    messages: [{ role: "user", content: "hi" }],
    tools: [],
    executeTool: async () => {
      throw new Error("must not be called — refused before any request is attempted");
    },
    onEvent: (event) => events.push(event),
  });

  assert.deepEqual(result, { stopReason: "error", toolTurns: 0 });
  assert.deepEqual(events, [
    { type: "error", message: "the azure protocol requires a base URL (each Azure OpenAI resource has its own endpoint)" },
    { type: "end", reason: "error" },
  ]);
});

test("runByokProviderTurn(openai): the outbound request carries the tool schema untouched, same as anthropic — the Google-only sanitizer must not leak into this protocol", async (t) => {
  const capture = await captureOutboundRequest(t);
  await runByokProviderTurn(baseInput("openai", capture.baseUrl));

  const body = capture.body();
  const tools = body.tools as Array<{ function: { parameters: Record<string, unknown> } }>;
  assert.deepEqual(tools[0].function.parameters, TOOL_WITH_NESTED_ADDITIONAL_PROPERTIES.inputSchema);
  assert.ok(JSON.stringify(tools[0].function.parameters).includes("additionalProperties"));
});

test("runByokProviderTurn(openai): a failed tool result is folded into the outbound message with the [tool error] prefix, a successful one passes through unprefixed, and isError on the reported tool_result event is derived from that fold marker — not the adapter's own (nonexistent) isError field", async (t) => {
  let secondRequestBody: Record<string, unknown> | undefined;
  const baseUrl = await startStubProviderServer(t, (callCount, requestBody) => {
    if (callCount === 1) {
      return { status: 200, body: openAiToolCallChunks([
        { index: 0, id: "call_ok", name: "tool_ok", argsJson: "{}" },
        { index: 1, id: "call_bad", name: "tool_bad", argsJson: "{}" },
      ]) + OPENAI_DONE };
    }
    secondRequestBody = requestBody;
    return { status: 200, body: openAiTextChunks("Done.") + OPENAI_DONE };
  });

  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const result = await runByokProviderTurn({
    protocol: "openai",
    baseUrl,
    apiKey: "test-key-not-real",
    model: "gpt-5",
    system: "be terse",
    messages: [{ role: "user", content: "run two tools" }],
    tools: byokTools("tool_ok", "tool_bad"),
    executeTool: async (call) => (call.name === "tool_bad" ? { content: "boom", isError: true } : { content: "fine" }),
    onEvent: (event) => events.push(event as { type: string; [key: string]: unknown }),
  });

  assert.equal(result.stopReason, "stop");

  const toolResults = events.filter((e) => e.type === "tool_result");
  assert.deepEqual(
    toolResults.map((e) => ({ toolUseId: e.toolUseId, content: e.content, isError: e.isError })),
    [
      { toolUseId: "call_ok", content: "fine", isError: false },
      { toolUseId: "call_bad", content: "[tool error] boom", isError: true },
    ],
  );

  assert.ok(secondRequestBody, "expected a second request carrying the tool results");
  const toolMessages = (secondRequestBody?.messages as Array<{ role: string; tool_call_id?: string; content: unknown }>).filter((m) => m.role === "tool");
  assert.deepEqual(
    toolMessages.map((m) => ({ tool_call_id: m.tool_call_id, content: m.content })),
    [
      { tool_call_id: "call_ok", content: "fine" },
      { tool_call_id: "call_bad", content: "[tool error] boom" },
    ],
  );
});

/** Every protocol's own tool-def mapping spreads `description` conditionally
 *  (`...(d.description !== undefined ? { description: d.description } : {})`) — every fixture
 *  above always supplies one, so the omitted-`description` branch was untested for all four
 *  protocols at once. Returns where that protocol's outbound request puts a function/tool
 *  declaration's `description` key, so the assertion below can check it is absent (not `undefined`
 *  — actually absent from the JSON, matching what a real provider's wire parser would see). */
function outboundToolDeclaration(protocol: ByokProviderTurnInput["protocol"], body: Record<string, unknown>): Record<string, unknown> {
  const tools = body.tools as unknown[];
  const first = tools[0] as Record<string, unknown>;
  if (protocol === "anthropic") return first;
  if (protocol === "google") {
    const decl = (first as { functionDeclarations: unknown[] }).functionDeclarations[0];
    return decl as Record<string, unknown>;
  }
  return (first as { function: Record<string, unknown> }).function;
}

for (const protocol of ["anthropic", "openai", "azure", "google"] as const) {
  test(`runByokProviderTurn(${protocol}): a tool descriptor with no description omits the description key entirely from the outbound request, rather than sending description: undefined`, async (t) => {
    const capture = await captureOutboundRequest(t);
    await runByokProviderTurn({
      ...baseInput(protocol, capture.baseUrl),
      tools: [{ id: "no_description_tool", inputSchema: { type: "object", properties: {}, required: [] } }],
    });

    const declaration = outboundToolDeclaration(protocol, capture.body());
    assert.equal("description" in declaration, false, `expected no "description" key at all, got: ${JSON.stringify(declaration)}`);
  });
}

test("runByokProviderTurn(azure): the same [tool error]-prefix fold/derive as openai, in azure's own copy of that logic", async (t) => {
  let secondRequestBody: Record<string, unknown> | undefined;
  const baseUrl = await startStubProviderServer(t, (callCount, requestBody) => {
    if (callCount === 1) {
      return { status: 200, body: openAiToolCallChunks([
        { index: 0, id: "call_ok", name: "tool_ok", argsJson: "{}" },
        { index: 1, id: "call_bad", name: "tool_bad", argsJson: "{}" },
      ]) + OPENAI_DONE };
    }
    secondRequestBody = requestBody;
    return { status: 200, body: openAiTextChunks("Done.") + OPENAI_DONE };
  });

  const events: Array<{ type: string; [key: string]: unknown }> = [];
  const result = await runByokProviderTurn({
    protocol: "azure",
    baseUrl,
    apiKey: "test-key-not-real",
    model: "gpt-5-deployment",
    system: "be terse",
    messages: [{ role: "user", content: "run two tools" }],
    tools: byokTools("tool_ok", "tool_bad"),
    executeTool: async (call) => (call.name === "tool_bad" ? { content: "boom", isError: true } : { content: "fine" }),
    onEvent: (event) => events.push(event as { type: string; [key: string]: unknown }),
  });

  assert.equal(result.stopReason, "stop");

  const toolResults = events.filter((e) => e.type === "tool_result");
  assert.deepEqual(
    toolResults.map((e) => ({ toolUseId: e.toolUseId, content: e.content, isError: e.isError })),
    [
      { toolUseId: "call_ok", content: "fine", isError: false },
      { toolUseId: "call_bad", content: "[tool error] boom", isError: true },
    ],
  );

  assert.ok(secondRequestBody, "expected a second request carrying the tool results");
  const toolMessages = (secondRequestBody?.messages as Array<{ role: string; tool_call_id?: string; content: unknown }>).filter((m) => m.role === "tool");
  assert.deepEqual(
    toolMessages.map((m) => ({ tool_call_id: m.tool_call_id, content: m.content })),
    [
      { tool_call_id: "call_ok", content: "fine" },
      { tool_call_id: "call_bad", content: "[tool error] boom" },
    ],
  );
});
