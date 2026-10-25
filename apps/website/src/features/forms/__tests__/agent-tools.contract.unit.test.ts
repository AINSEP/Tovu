import assert from "node:assert/strict";
import test from "node:test";

import Ajv from "ajv";
import { FIELD_TYPES } from "@jini-ai/cms/forms";

import { DELIVERY_STATUS_MAX_LIMIT, formsAgentToolCatalog } from "../agent-tools.js";

/**
 * @file Contract pins for the forms agent-tool catalog (Stryker lane L14: 13.5 %, 45 survivors, all
 * declarative — AP5). Every tool's name, side effect, permission and input schema is compared to an
 * INLINE expected value (descriptions stripped: they are prose, not contract), then a good input and
 * an input with an extra key are validated against each schema.
 */

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "description").map(([k, v]) => [k, stripDescriptions(v)]));
  }
  return value;
}

const FIELD = {
  type: "object",
  additionalProperties: false,
  required: ["id", "label", "type", "required"],
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    label: { type: "string", minLength: 1, maxLength: 200 },
    type: { type: "string", enum: [...FIELD_TYPES] },
    required: { type: "boolean" },
    name: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
    placeholder: { type: "string", maxLength: 500 },
    helpText: { type: "string", maxLength: 500 },
    default: { oneOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", maxItems: 100, items: { type: "string" } }] },
    options: {
      type: "array", minItems: 1, maxItems: 100,
      items: { type: "object", additionalProperties: false, required: ["value", "label"], properties: { value: { type: "string", minLength: 1, maxLength: 200 }, label: { type: "string", minLength: 1, maxLength: 200 } } },
    },
    minLength: { type: "integer", minimum: 0, maximum: 5000 },
    pattern: { type: "string", maxLength: 300 },
    min: { type: ["number", "string"] },
    max: { type: ["number", "string"] },
    step: { type: "number", exclusiveMinimum: 0 },
    accept: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
    maxFileSize: { type: "integer", minimum: 1, maximum: 10485760 },
    checkboxValue: { type: "string" },
    maxLength: { type: ["integer", "null"], minimum: 1, maximum: 5000 },
    className: { type: "string", maxLength: 300 },
    attributes: {
      type: "object", maxProperties: 12,
      propertyNames: { pattern: "^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$" },
      additionalProperties: { type: "string", maxLength: 300 },
    },
  },
};
const FIELDS = { type: "array", minItems: 1, maxItems: 20, items: FIELD };
const NOTIFY = {
  type: "object", additionalProperties: false, required: ["enabled", "recipients"],
  properties: { enabled: { type: "boolean" }, recipients: { type: "array", maxItems: 10, items: { type: "string" } } },
};
const FORM_ID = { type: "string" };
const MANAGE = { permission: "admin.forms.manage" };
const READ = { permission: "admin.forms.submissions.read" };

const EXPECTED = [
  { name: "forms_list_definitions", sideEffects: "none", authorization: MANAGE, inputSchema: { type: "object", additionalProperties: false, required: [], properties: {} } },
  {
    name: "forms_create_definition", sideEffects: "mutates-durable-state", authorization: MANAGE,
    inputSchema: {
      type: "object", additionalProperties: false, required: ["name", "slug", "fields"],
      properties: { name: { type: "string", minLength: 1, maxLength: 200 }, slug: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" }, fields: FIELDS, notify: NOTIFY },
    },
  },
  {
    name: "forms_update_definition", sideEffects: "mutates-durable-state", authorization: MANAGE,
    inputSchema: { type: "object", additionalProperties: false, required: ["formId"], properties: { formId: FORM_ID, name: { type: "string", minLength: 1, maxLength: 200 }, fields: FIELDS, notify: NOTIFY } },
  },
  {
    name: "forms_set_definition_status", sideEffects: "mutates-durable-state", authorization: MANAGE,
    inputSchema: { type: "object", additionalProperties: false, required: ["formId", "status"], properties: { formId: FORM_ID, status: { type: "string", enum: ["active", "disabled"] } } },
  },
  {
    name: "forms_list_submissions", sideEffects: "none", authorization: READ,
    inputSchema: { type: "object", additionalProperties: false, required: ["formId"], properties: { formId: FORM_ID, limit: { type: "integer", minimum: 1, maximum: 100 }, cursor: { type: "string" } } },
  },
  {
    name: "forms_get_submission", sideEffects: "none", authorization: READ,
    inputSchema: { type: "object", additionalProperties: false, required: ["formId", "submissionId"], properties: { formId: FORM_ID, submissionId: { type: "string" } } },
  },
  {
    name: "forms_pull_submissions", sideEffects: "mutates-durable-state", authorization: MANAGE,
    inputSchema: { type: "object", additionalProperties: false, properties: { targetId: { type: "string", minLength: 1, maxLength: 64 } } },
  },
  {
    name: "forms_delivery_status", sideEffects: "none", authorization: READ,
    inputSchema: { type: "object", additionalProperties: false, properties: { submissionId: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } } },
  },
];

test("forms catalog: every tool's name, side effect, permission and input schema match the inline contract, in order", () => {
  assert.equal(DELIVERY_STATUS_MAX_LIMIT, 50);
  assert.ok([...FIELD_TYPES].length >= 3 && [...FIELD_TYPES].includes("email"), "the native field-type enum is non-empty");
  assert.deepEqual(stripDescriptions(formsAgentToolCatalog), EXPECTED);
});

test("forms catalog: every tool has a non-empty description and no tool can delete a form definition", () => {
  for (const tool of formsAgentToolCatalog) assert.ok(tool.description.trim().length > 20, tool.name);
  assert.equal(formsAgentToolCatalog.some((t) => /delete|purge/.test(t.name)), false);
});

const GOOD_FIELD = { id: "email", label: "Email", type: "email", required: true };
const GOOD: Record<string, unknown> = {
  forms_list_definitions: {},
  forms_create_definition: { name: "Contact", slug: "contact", fields: [GOOD_FIELD], notify: { enabled: true, recipients: ["a@example.com"] } },
  forms_update_definition: { formId: "f1", fields: [GOOD_FIELD] },
  forms_set_definition_status: { formId: "f1", status: "disabled" },
  forms_list_submissions: { formId: "f1", limit: 100 },
  forms_get_submission: { formId: "f1", submissionId: "s1" },
  forms_pull_submissions: {},
  forms_delivery_status: { limit: 50 },
};

test("forms catalog: each schema accepts its good input and rejects the same input with an extra key", () => {
  const ajv = new Ajv();
  assert.deepEqual(Object.keys(GOOD).sort(), formsAgentToolCatalog.map((t) => t.name).sort());
  for (const tool of formsAgentToolCatalog) {
    const validate = ajv.compile(tool.inputSchema!);
    const good = GOOD[tool.name] as Record<string, unknown>;
    assert.equal(validate(good), true, `${tool.name}: ${JSON.stringify(validate.errors)}`);
    assert.equal(validate({ ...good, extra: 1 }), false, `${tool.name} must refuse an extra key`);
    assert.equal(validate.errors?.[0]?.keyword, "additionalProperties");
  }
});

test("forms schemas: limit/slug/field boundaries (max, max+1, empty, leading/trailing junk, uppercase)", () => {
  const ajv = new Ajv();
  const byName = (name: string) => ajv.compile(formsAgentToolCatalog.find((t) => t.name === name)!.inputSchema!);
  const list = byName("forms_list_submissions");
  assert.deepEqual([0, 1, 100, 101].map((limit) => list({ formId: "f", limit })), [false, true, true, false]);
  const delivery = byName("forms_delivery_status");
  assert.deepEqual([0, 1, 50, 51].map((limit) => delivery({ limit })), [false, true, true, false]);
  const create = byName("forms_create_definition");
  const slug = (s: string) => create({ name: "n", slug: s, fields: [GOOD_FIELD] });
  assert.deepEqual(
    ["a", "0-a", "a".repeat(64), "a".repeat(65), "", "-a", "A", "a_b", "ok\n", " ok", "ok!"].map(slug),
    [true, true, true, false, false, false, false, false, false, false, false],
  );
  const fields = (n: number) => create({ name: "n", slug: "s", fields: Array.from({ length: n }, (_, i) => ({ ...GOOD_FIELD, id: `f${i}` })) });
  assert.deepEqual([0, 1, 20, 21].map(fields), [false, true, true, false]);
  const fieldId = (id: string) => create({ name: "n", slug: "s", fields: [{ ...GOOD_FIELD, id }] });
  assert.deepEqual(["a", "a_1", "1a", "_a", "A", "a-b", "a\n", ""].map(fieldId), [true, true, false, false, false, false, false, false]);
  const attr = (name: string) => create({ name: "n", slug: "s", fields: [{ ...GOOD_FIELD, attributes: { [name]: "v" } }] });
  assert.deepEqual(
    ["aria-label", "data-x", "readonly", "onclick", "style", "xaria-label", "aria-label-", "data-X", "titles"].map(attr),
    [true, true, true, false, false, false, true, false, false],
  );
  const recipients = (n: number) => create({ name: "n", slug: "s", fields: [GOOD_FIELD], notify: { enabled: true, recipients: Array(n).fill("a@example.com") } });
  assert.deepEqual([0, 10, 11].map(recipients), [true, true, false]);
  const status = byName("forms_set_definition_status");
  assert.deepEqual(["active", "disabled", "deleted", "ACTIVE"].map((s) => status({ formId: "f", status: s })), [true, true, false, false]);
});
