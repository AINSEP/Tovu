import assert from "node:assert/strict";
import test from "node:test";

import { contentTypesAgentToolCatalog } from "../../agent-tools";
import { parseContentTypeFieldDefs } from "../../field-defs";
import { CONTENT_TYPE_FIELD_KINDS } from "../../types";
import { IDENTIFIER_GRAMMAR_PATTERN } from "../../index-provisioning";

/**
 * @file The drift pin for the deliberate two-artifact design in `agent-tools.ts`: the `inputSchema`
 * published to the model is hand-authored, and enforcement lives in `field-defs.ts`. Two artifacts
 * describing one contract can disagree, and a disagreement is invisible in production — the model
 * would be told one shape while a different one is enforced.
 *
 * Rather than derive one from the other (which was considered and rejected: it would mean either a
 * schema-library dependency this project does not have, or a code generator for five schemas), the
 * pair is checked against a fixture corpus. Every fixture is run through BOTH the published schema
 * and the real parser, and the two verdicts must match. A schema edit that widens or narrows the
 * contract without a matching parser change fails here.
 *
 * The validator below is intentionally minimal — it supports exactly the JSON Schema keywords the
 * published schemas actually use. If a schema starts using a keyword it does not know, the
 * `unsupported keyword` guard fails loudly rather than silently passing everything.
 */

const SUPPORTED_KEYWORDS = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "pattern", "maxItems", "description"]);

type Schema = Record<string, unknown>;

/** Minimal JSON Schema check covering only the keywords the published schemas use. Returns null when valid, else the failing path. */
function validate(schema: Schema, value: unknown, path = "fields"): string | null {
  for (const keyword of Object.keys(schema)) {
    assert.ok(SUPPORTED_KEYWORDS.has(keyword), `unsupported keyword '${keyword}' at ${path} — extend this validator rather than leaving the pair unchecked`);
  }

  const type = schema.type as string | undefined;
  if (type === "array") {
    if (!Array.isArray(value)) return path;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return path;
    for (const [index, element] of value.entries()) {
      const failure = validate(schema.items as Schema, element, `${path}[${index}]`);
      if (failure) return failure;
    }
    return null;
  }
  if (type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return path;
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties)) return `${path}.${key}`;
      }
    }
    for (const key of (schema.required as string[] | undefined) ?? []) {
      if (!(key in record)) return `${path}.${key}`;
    }
    for (const [key, subSchema] of Object.entries(properties)) {
      if (!(key in record)) continue;
      const failure = validate(subSchema, record[key], `${path}.${key}`);
      if (failure) return failure;
    }
    return null;
  }
  if (type === "boolean") return typeof value === "boolean" ? null : path;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value) ? null : path;
  if (type === "string") {
    if (typeof value !== "string") return path;
    if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value)) return path;
    // `pattern` is asserted separately below — the parser deliberately does not judge grammar, so
    // applying it here would manufacture a disagreement the design intends.
    return null;
  }
  assert.fail(`unsupported type '${String(type)}' at ${path}`);
}

function fieldsSchemaOf(toolId: string): Schema {
  const entry = contentTypesAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry?.inputSchema, `${toolId} must publish an inputSchema`);
  const properties = (entry.inputSchema as Schema).properties as Record<string, Schema>;
  assert.ok(properties.fields, `${toolId}'s schema must describe 'fields'`);
  return properties.fields;
}

const VALID = { name: "servings", kind: "integer", required: false, queryable: true };

/**
 * The corpus. Each entry is a `fields` payload; `accepted` is the verdict BOTH artifacts must
 * reach. Grammar-invalid-but-well-typed names are deliberately `accepted: true` — the boundary
 * passes them and CIC U-002-B1 guard 3 rejects them, which is the documented division of labour.
 */
const CORPUS: ReadonlyArray<{ label: string; payload: unknown; accepted: boolean }> = [
  { label: "empty array", payload: [], accepted: true },
  { label: "one valid field", payload: [VALID], accepted: true },
  { label: "every field kind", payload: CONTENT_TYPE_FIELD_KINDS.map((kind, i) => ({ ...VALID, name: `f_${i}`, kind })), accepted: true },
  { label: "required true / queryable false", payload: [{ ...VALID, required: true, queryable: false }], accepted: true },
  { label: "duplicate names (no rule rejects them today)", payload: [VALID, VALID], accepted: true },
  { label: "grammar-invalid name — boundary passes, guard 3 rejects", payload: [{ ...VALID, name: "NotValid!" }], accepted: true },
  { label: "25 queryable fields — boundary passes, guard 5 rejects", payload: Array.from({ length: 25 }, (_, i) => ({ ...VALID, name: `f_${i}` })), accepted: true },
  { label: "exactly at the 500 cap", payload: Array.from({ length: 500 }, (_, i) => ({ ...VALID, name: `f_${i}` })), accepted: true },

  { label: "not an array", payload: { ...VALID }, accepted: false },
  { label: "a string", payload: "servings", accepted: false },
  { label: "null", payload: null, accepted: false },
  { label: "null element", payload: [null], accepted: false },
  { label: "undefined element", payload: [undefined], accepted: false },
  { label: "nested array element", payload: [[VALID]], accepted: false },
  { label: "number element", payload: [42], accepted: false },
  { label: "string required", payload: [{ ...VALID, required: "maybe" }], accepted: false },
  { label: "string queryable", payload: [{ ...VALID, queryable: "yes" }], accepted: false },
  { label: "numeric queryable", payload: [{ ...VALID, queryable: 1 }], accepted: false },
  { label: "numeric name", payload: [{ ...VALID, name: 7 }], accepted: false },
  { label: "numeric kind", payload: [{ ...VALID, kind: 7 }], accepted: false },
  { label: "kind outside the enum", payload: [{ ...VALID, kind: "bogus" }], accepted: false },
  { label: "missing name", payload: [{ kind: "integer", required: false, queryable: true }], accepted: false },
  { label: "missing kind", payload: [{ name: "servings", required: false, queryable: true }], accepted: false },
  { label: "missing required", payload: [{ name: "servings", kind: "integer", queryable: true }], accepted: false },
  { label: "missing queryable", payload: [{ name: "servings", kind: "integer", required: false }], accepted: false },
  { label: "unrecognized key", payload: [{ ...VALID, queryible: true }], accepted: false },
  { label: "one field over the 500 cap", payload: Array.from({ length: 501 }, (_, i) => ({ ...VALID, name: `f_${i}` })), accepted: false },
  { label: "second element invalid", payload: [VALID, { ...VALID, required: 1 }], accepted: false },
];

for (const toolId of ["collections_content_type_define", "collections_content_type_update_fields"]) {
  test(`${toolId}: the published 'fields' schema and the enforcing parser agree on every corpus fixture`, () => {
    const schema = fieldsSchemaOf(toolId);

    for (const { label, payload, accepted } of CORPUS) {
      const schemaSaysValid = validate(schema, payload) === null;
      const parserSaysValid = parseContentTypeFieldDefs(payload).ok;

      assert.equal(schemaSaysValid, accepted, `published schema disagrees with the corpus for "${label}"`);
      assert.equal(parserSaysValid, accepted, `parser disagrees with the corpus for "${label}"`);
      assert.equal(schemaSaysValid, parserSaysValid, `DRIFT: schema and parser disagree for "${label}" — the model would be told one contract and a different one enforced`);
    }
  });
}

test("the corpus covers both verdicts, so an all-accepting or all-rejecting bug cannot pass this file", () => {
  assert.ok(
    CORPUS.some((c) => c.accepted) && CORPUS.some((c) => !c.accepted),
    "a single-verdict corpus would make the agreement assertion vacuous",
  );
});

test("the published schemas reuse the single sources for the field-kind enum and the identifier grammar, rather than restating either", () => {
  const fieldSchema = (fieldsSchemaOf("collections_content_type_define").items as Schema).properties as Record<string, Schema>;

  assert.deepEqual(fieldSchema.kind.enum, [...CONTENT_TYPE_FIELD_KINDS], "a hand-copied enum would drift the moment CONTENT_TYPE_FIELD_KINDS changes");
  assert.equal(fieldSchema.name.pattern, IDENTIFIER_GRAMMAR_PATTERN, "GOV-ADR-003 makes this grammar load-bearing — it must have exactly one definition");
});

test("every wired tool publishes an inputSchema; the two deliberately-unwired cleanup tools need not", () => {
  const wired = [
    "collections_content_type_define",
    "collections_content_type_update_fields",
    "collections_content_type_deprecate",
    "collections_content_type_reactivate",
    "collections_content_type_tombstone",
  ];

  for (const toolId of wired) {
    const entry = contentTypesAgentToolCatalog.find((tool) => tool.name === toolId);
    assert.ok(entry?.inputSchema, `${toolId} is wired in tool-registrations.ts, so it must publish a contract`);
    assert.equal((entry.inputSchema as Schema).additionalProperties, false, `${toolId}'s schema must be closed, so a misspelled key is reported rather than ignored`);
  }
});

test("the three lifecycle tools publish the same {key, expectedVersion} contract — they take identical input", () => {
  const schemas = ["collections_content_type_deprecate", "collections_content_type_reactivate", "collections_content_type_tombstone"].map(
    (id) => contentTypesAgentToolCatalog.find((tool) => tool.name === id)?.inputSchema,
  );

  assert.deepEqual(schemas[1], schemas[0]);
  assert.deepEqual(schemas[2], schemas[0]);
  assert.deepEqual((schemas[0] as Schema).required, ["key", "expectedVersion"]);
});
