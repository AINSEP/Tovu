/** AW-7 Tier 1 (2026-10-04): a plugin's manifest-declared content types — parse, plan, apply. */
import assert from "node:assert/strict";
import test from "node:test";

import { ContentTypeAlreadyExistsError, type ContentTypeRecord } from "#src/features/content-types/index";

import {
  applyDeclaredContentTypes,
  MAX_DECLARED_CONTENT_TYPES,
  MAX_DECLARED_FIELDS,
  MAX_DECLARED_QUERYABLE_FIELDS,
  parseDeclaredContentTypes,
  planDeclaredContentTypes,
  validateDeclarativeManifest,
  type DeclaredContentTypePorts,
} from "../../declarative-content-types.js";
import { PluginInvalidError } from "@jini-ai/plugins/host";
import type { PluginManifest } from "@jini-ai/plugins/host";

const FAQ = { key: "faq", label: "FAQ", fields: [{ name: "answer", kind: "text", required: true }, { name: "order", kind: "integer" }] };

function messages(value: unknown): string[] {
  return parseDeclaredContentTypes({ value }).errors.map((error) => error.message);
}

test("absent or null contentTypes declare nothing", () => {
  assert.deepEqual(parseDeclaredContentTypes({ value: undefined }), { decls: [], errors: [] });
  assert.deepEqual(parseDeclaredContentTypes({ value: null }), { decls: [], errors: [] });
});

test("a valid declaration fills required/queryable defaults", () => {
  const result = parseDeclaredContentTypes({ value: [FAQ] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.decls, [
    {
      key: "faq",
      label: "FAQ",
      fields: [
        { name: "answer", kind: "text", required: true, queryable: false },
        { name: "order", kind: "integer", required: false, queryable: false },
      ],
    },
  ]);
});

test("every error carries the CONTENT_TYPE_DECL_INVALID code and no file", () => {
  const [error] = parseDeclaredContentTypes({ value: "nope" }).errors;
  assert.deepEqual(error, { code: "CONTENT_TYPE_DECL_INVALID", file: null, message: "'contentTypes' must be an array" });
});

test("the list is bounded", () => {
  const many = Array.from({ length: MAX_DECLARED_CONTENT_TYPES + 1 }, (_, i) => ({ ...FAQ, key: `t${i}` }));
  assert.deepEqual(messages(many), [`'contentTypes' declares more than ${MAX_DECLARED_CONTENT_TYPES} content types`]);
});

test("entry shape errors are collected, not first-failure", () => {
  assert.deepEqual(messages([null, { key: "a", label: "A", fields: [], extra: 1 }]), [
    "contentTypes[0] must be an object",
    "contentTypes[1] has an unknown key 'extra'",
    "content type 'a' must declare 1-50 fields",
  ]);
});

test("key: must be a string, pass the identifier grammar and not be reserved", () => {
  assert.deepEqual(messages([{ ...FAQ, key: 7 }]), ["contentTypes[0].key must be a string"]);
  assert.deepEqual(messages([{ ...FAQ, key: "Bad-Key" }]), ["content type key 'Bad-Key' must match ^[a-z][a-z0-9_]{0,63}$"]);
  for (const reserved of ["post", "page", "widget", "widget_area", "menu"]) {
    assert.deepEqual(messages([{ ...FAQ, key: reserved }]), [`content type key '${reserved}' is reserved by core`]);
  }
});

test("label: a non-empty string of at most 100 characters", () => {
  assert.deepEqual(messages([{ ...FAQ, label: "" }]), ["content type 'faq' needs a label of 1-100 characters"]);
  assert.deepEqual(messages([{ ...FAQ, label: "x".repeat(101) }]), ["content type 'faq' needs a label of 1-100 characters"]);
  assert.deepEqual(messages([{ ...FAQ, label: 3 }]), ["content type 'faq' needs a label of 1-100 characters"]);
});

test("fields: an array of 1..MAX entries", () => {
  assert.deepEqual(messages([{ ...FAQ, fields: "x" }]), [`content type 'faq' must declare 1-${MAX_DECLARED_FIELDS} fields`]);
  const tooMany = Array.from({ length: MAX_DECLARED_FIELDS + 1 }, (_, i) => ({ name: `f${i}`, kind: "text" }));
  assert.deepEqual(messages([{ ...FAQ, fields: tooMany }]), [`content type 'faq' must declare 1-${MAX_DECLARED_FIELDS} fields`]);
});

test("queryable fields: at most core's per-type cap, so registration cannot refuse it after the code loaded", () => {
  const queryable = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `q${i}`, kind: "integer", queryable: true }));
  assert.equal(MAX_DECLARED_QUERYABLE_FIELDS, 20);
  assert.deepEqual(messages([{ ...FAQ, fields: queryable(20) }]), []);
  assert.deepEqual(messages([{ ...FAQ, fields: queryable(21) }]), ["content type 'faq' declares 21 queryable fields; at most 20 are allowed"]);
});

test("field errors: shape, unknown key, name, kind, flags, storage-only queryable", () => {
  const fields = [
    "x",
    { name: "a", kind: "text", label: "A" },
    { name: 5, kind: "text" },
    { name: "Bad", kind: "text" },
    { name: "b", kind: "media" },
    { name: "c", kind: "text", required: "yes" },
    { name: "d", kind: "text", queryable: 1 },
    { name: "e", kind: "json", queryable: true },
  ];
  assert.deepEqual(messages([{ ...FAQ, fields }]), [
    "content type 'faq' field 0 must be an object",
    "content type 'faq' field 'a' has an unknown key 'label'",
    "content type 'faq' field name '5' must match ^[a-z][a-z0-9_]{0,63}$",
    "content type 'faq' field name 'Bad' must match ^[a-z][a-z0-9_]{0,63}$",
    "content type 'faq' field 'b' has kind 'media'; allowed: text|integer|real|boolean|datetime|relation|json",
    "content type 'faq' field 'c' 'required' must be a boolean",
    "content type 'faq' field 'd' 'queryable' must be a boolean",
    "content type 'faq' field 'e' has storage-only kind 'json' and cannot be queryable",
  ]);
});

test("duplicate keys and duplicate field names are refused", () => {
  assert.deepEqual(messages([FAQ, FAQ]), ["content type key 'faq' is declared more than once"]);
  assert.deepEqual(messages([{ ...FAQ, fields: [{ name: "a", kind: "text" }, { name: "a", kind: "integer" }] }]), [
    "content type 'faq' declares field 'a' more than once",
  ]);
});

test("an indexable queryable field is accepted", () => {
  const result = parseDeclaredContentTypes({ value: [{ ...FAQ, fields: [{ name: "order", kind: "integer", queryable: true }] }] });
  assert.deepEqual(result.errors, []);
  assert.equal(result.decls[0]?.fields[0]?.queryable, true);
});

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: "testimonials-faq",
    name: "Testimonials and FAQ",
    version: "1.0.0",
    sdkRange: "*",
    engine: 1,
    tier: "tier-1",
    capabilities: [],
    hooks: [],
    fields: [],
    integrity: {},
    contentTypes: [FAQ],
    ...overrides,
  };
}

test("validateDeclarativeManifest: a tier-1 manifest with content types only is valid", () => {
  const result = validateDeclarativeManifest({ manifest: manifest() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.decls.length, 1);
});

test("validateDeclarativeManifest: tier-1 cannot declare code surfaces (capabilities, hooks, fields)", () => {
  const result = validateDeclarativeManifest({
    manifest: manifest({
      capabilities: ["content.read"],
      hooks: ["content.entry.beforeSave"],
      fields: [{ path: "ext.testimonials-faq.x", type: "string", queryable: false }],
    }),
  });
  assert.deepEqual(
    result.errors.map((error) => [error.code, error.message]),
    [
      ["TIER1_DECLARES_CODE_SURFACE", "a declarative (tier-1) plugin cannot declare 'capabilities' — only code can use them"],
      ["TIER1_DECLARES_CODE_SURFACE", "a declarative (tier-1) plugin cannot declare 'hooks' — only code can use them"],
      ["TIER1_DECLARES_CODE_SURFACE", "a declarative (tier-1) plugin cannot declare 'fields' — only code can use them"],
    ]
  );
});

test("validateDeclarativeManifest: a tier-3 manifest may combine code surfaces and content types", () => {
  const result = validateDeclarativeManifest({ manifest: manifest({ tier: "tier-3", hooks: ["content.entry.beforeSave"], contentTypes: null }) });
  assert.deepEqual(result, { decls: [], errors: [] });
});

/** A small in-memory fake for the two ports, recording every register call. */
function fakePorts(existing: ContentTypeRecord[] = [], registerResult?: (key: string) => { ok: true } | { ok: false; error: Error }) {
  const registered: Array<{ key: string; actorId: string; fields: unknown }> = [];
  const ports: DeclaredContentTypePorts = {
    async findByKey({ key }) {
      return existing.find((record) => record.key === key) ?? null;
    },
    async register(input) {
      registered.push({ key: input.key, actorId: input.actorId, fields: input.fields });
      return registerResult ? registerResult(input.key) : { ok: true };
    },
  };
  return { ports, registered };
}

function record(key: string, fields: ContentTypeRecord["fields"], status: ContentTypeRecord["status"] = "active"): ContentTypeRecord {
  return { workspaceId: "ws", key, label: key, fields, status, version: 1 };
}

const FAQ_DECL = parseDeclaredContentTypes({ value: [FAQ] }).decls;

test("plan: a missing type is created", async () => {
  const { ports } = fakePorts();
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.items.map((item) => [item.decl.key, item.outcome]), [["faq", "create"]]);
});

test("plan: an existing type holding every declared field with the same kind is kept (extra owner fields allowed)", async () => {
  const { ports } = fakePorts([
    record("faq", [
      { name: "answer", kind: "text", required: false, queryable: false },
      { name: "order", kind: "integer", required: false, queryable: true },
      { name: "owner_added", kind: "text", required: false, queryable: false },
    ]),
  ]);
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  assert.deepEqual(plan.items.map((item) => item.outcome), ["keep"]);
  assert.deepEqual(plan.conflicts, []);
});

test("plan: a tombstoned type is skipped — the owner deleted it and its key cannot be reused", async () => {
  const { ports } = fakePorts([record("faq", [], "tombstone")]);
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  assert.deepEqual(plan.items.map((item) => item.outcome), ["skip-tombstoned"]);
});

test("plan: an existing type that lacks a field or types it differently is a conflict", async () => {
  const { ports } = fakePorts([record("faq", [{ name: "answer", kind: "integer", required: false, queryable: false }])]);
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  assert.deepEqual(plan.items, []);
  assert.deepEqual(plan.conflicts, [
    "content type 'faq' already exists with field 'answer' as 'integer', not 'text'",
    "content type 'faq' already exists without field 'order'",
  ]);
});

test("apply: creates planned types as the plugin's system actor and reports each outcome", async () => {
  const { ports, registered } = fakePorts([record("kept", [{ name: "a", kind: "text", required: false, queryable: false }]), record("gone", [], "tombstone")]);
  const decls = parseDeclaredContentTypes({
    value: [FAQ, { key: "kept", label: "Kept", fields: [{ name: "a", kind: "text" }] }, { key: "gone", label: "Gone", fields: [{ name: "a", kind: "text" }] }],
  }).decls;
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls });
  const result = await applyDeclaredContentTypes({ ports, workspaceId: "ws", pluginId: "testimonials-faq", plan });
  assert.deepEqual(result, { created: ["faq"], kept: ["kept"], skipped: ["gone"] });
  assert.deepEqual(registered.map((call) => [call.key, call.actorId]), [["faq", "plugin:testimonials-faq"]]);
});

/** Planning sees no `faq`; a concurrent request then creates `winner` before this plugin's register. */
async function raceAgainst(winner: ContentTypeRecord) {
  const existing: ContentTypeRecord[] = [];
  const { ports } = fakePorts(existing, (key) => ({ ok: false, error: new ContentTypeAlreadyExistsError({ key, tombstoned: winner.status === "tombstone" }) }));
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  existing.push(winner);
  return applyDeclaredContentTypes({ ports, workspaceId: "ws", pluginId: "p", plan });
}

test("apply: losing a concurrent create race to a compatible type counts as kept", async () => {
  const winner = record("faq", [{ name: "answer", kind: "text", required: true, queryable: false }, { name: "order", kind: "integer", required: false, queryable: false }]);
  assert.deepEqual(await raceAgainst(winner), { created: [], kept: ["faq"], skipped: [] });
});

test("apply: losing the race to an incompatible type refuses the enable, as planning would have", async () => {
  const winner = record("faq", [{ name: "answer", kind: "integer", required: false, queryable: false }, { name: "order", kind: "integer", required: false, queryable: false }]);
  await assert.rejects(raceAgainst(winner), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.equal(error.message, "plugin 'p' cannot be turned on: content type 'faq' already exists with field 'answer' as 'integer', not 'text'");
    return true;
  });
});

test("apply: losing the race to a type that was then tombstoned counts as skipped", async () => {
  assert.deepEqual(await raceAgainst(record("faq", [], "tombstone")), { created: [], kept: [], skipped: ["faq"] });
});

test("apply: any other register failure is thrown unchanged", async () => {
  const boom = new Error("disk full");
  const { ports } = fakePorts([], () => ({ ok: false, error: boom }));
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  await assert.rejects(applyDeclaredContentTypes({ ports, workspaceId: "ws", pluginId: "p", plan }), (error) => error === boom);
});

test("apply: a race whose winner cannot be read back rethrows the original duplicate error", async () => {
  const lost = new ContentTypeAlreadyExistsError({ key: "faq", tombstoned: false });
  const { ports } = fakePorts([], () => ({ ok: false, error: lost }));
  const plan = await planDeclaredContentTypes({ ports, workspaceId: "ws", decls: FAQ_DECL });
  await assert.rejects(applyDeclaredContentTypes({ ports, workspaceId: "ws", pluginId: "p", plan }), (error) => error === lost);
});
