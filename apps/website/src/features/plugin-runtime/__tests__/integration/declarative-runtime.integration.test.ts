/**
 * @file AW-7 Tier 1 through the real composition (`composePluginRuntime`): a declarative plugin's
 * content types are applied at enable AFTER the conflict gate, its code is never imported, a second
 * plugin declaring the same key is refused by the claim system, and boot does not try to load it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import { InMemoryContentTypeRepo } from "#src/features/content-types/index";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/runtime/composition/plugin-runtime";

import { PluginInvalidError, setPluginEnabled } from "../../activation.js";
import { createDeclaredContentTypePorts } from "../../declarative-enable.js";
import type { PluginManifest } from "../../manifest.js";
import { PluginConflictError } from "../../plugin-claims.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";

const WORKSPACE = "ws-1";
const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };
const FAQ = { key: "faq", label: "FAQ", fields: [{ name: "question", kind: "text", required: true }, { name: "answer", kind: "text", required: true }] };

/** A built-in source whose import is recorded — a tier-1 plugin must never reach it. */
function source(id: string, extra: Partial<PluginManifest>, imports: string[]): PluginRuntimeSource {
  return {
    source: "built-in",
    entryPath: `built-in:${id}`,
    manifest: { id, name: `Plugin ${id}`, version: "1.0.0", sdkRange: "*", engine: 1, tier: "tier-1", capabilities: [], hooks: [], fields: [], integrity: {}, ...extra },
    importModule: async () => {
      imports.push(id);
      return { default: definePlugin({ setup(sdk) { sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, async () => ({ seen: true })); } }) };
    },
  };
}

const CODE_PLUGIN: Partial<PluginManifest> = {
  tier: "tier-3",
  capabilities: ["hooks.attach"],
  hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
  sdkRange: "^0.1.0 || ^0.2.0",
};

function harness(sources: (imports: string[]) => PluginRuntimeSource[], withPorts = true) {
  const imports: string[] = [];
  const activationRepo = new InMemoryPluginActivationRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  let next = 0;
  const declaredContentTypes = createDeclaredContentTypePorts({ repo: contentTypeRepo, clock, ids: { newId: () => `id-${++next}` }, outbox: { enqueue: async () => {} } });
  const runtime = composePluginRuntime({
    workspaceId: WORKSPACE, clock, activationRepo, sources: sources(imports),
    ...(withPorts ? { declaredContentTypes } : {}),
  });
  const enable = async (pluginId: string) => setPluginEnabled({
    deps: { clock, repo: activationRepo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
    input: { workspaceId: WORKSPACE, pluginId, enabled: true },
  });
  const faq = () => contentTypeRepo.findByKey({ workspaceId: WORKSPACE, key: "faq" });
  return { imports, activationRepo, contentTypeRepo, runtime, enable, faq };
}

test("a tier-1 plugin's content types are created at enable, recorded as the plugin, and its code is never imported", async () => {
  const h = harness((imports) => [source("testimonials-faq", { contentTypes: [FAQ] }, imports)]);
  await h.enable("testimonials-faq");
  assert.deepEqual(h.imports, []);
  assert.deepEqual((await h.faq())?.fields.map((field) => field.name), ["question", "answer"]);
  assert.equal(h.contentTypeRepo.listRevisions()[0]?.actorId, "plugin:testimonials-faq");
  assert.equal((await h.activationRepo.getActivation({ workspaceId: WORKSPACE, pluginId: "testimonials-faq" }))?.enabled, true);
});

test("a composition without content-type ports refuses a declarative plugin instead of half-enabling it", async () => {
  const h = harness((imports) => [source("testimonials-faq", { contentTypes: [FAQ] }, imports)], false);
  await assert.rejects(h.enable("testimonials-faq"), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.equal(error.message, "plugin 'testimonials-faq' declares content types, but this site cannot create them");
    return true;
  });
  assert.equal(await h.activationRepo.getActivation({ workspaceId: WORKSPACE, pluginId: "testimonials-faq" }), null);
});

test("a second plugin declaring the same content type key is refused by the claim system, before anything is written", async () => {
  const other = { ...FAQ, fields: [{ name: "body", kind: "text" }] };
  const h = harness((imports) => [source("faq-a", { contentTypes: [FAQ] }, imports), source("faq-b", { contentTypes: [other, { key: "glossary", label: "Glossary", fields: [{ name: "term", kind: "text" }] }] }, imports)]);
  await h.enable("faq-a");
  await assert.rejects(h.enable("faq-b"), (error: unknown) => {
    assert.ok(error instanceof PluginConflictError);
    assert.deepEqual(error.conflicts.map((c) => `${c.kind}:${c.key}<-${c.heldBy}`), ["content-type:faq<-faq-a"]);
    return true;
  });
  assert.equal(await h.contentTypeRepo.findByKey({ workspaceId: WORKSPACE, key: "glossary" }), null);
});

test("a code plugin with content types loads its code first, then gets its types", async () => {
  let typesWhenImported: unknown = "not imported";
  const h = harness((imports) => {
    const base = source("faq-code", { ...CODE_PLUGIN, contentTypes: [FAQ] }, imports);
    return [{ ...base, importModule: async (entryPath) => { typesWhenImported = await h.faq(); return base.importModule(entryPath); } }];
  });
  await h.enable("faq-code");
  assert.equal(typesWhenImported, null);
  assert.notEqual(await h.faq(), null);
  assert.deepEqual(h.imports, ["faq-code"]);
});

test("an existing type that disagrees refuses a code plugin before its code is imported", async () => {
  const h = harness((imports) => [source("faq-code", { ...CODE_PLUGIN, contentTypes: [FAQ] }, imports)]);
  await h.contentTypeRepo.save({ workspaceId: WORKSPACE, key: "faq", label: "Mine", fields: [{ name: "question", kind: "integer", required: false, queryable: false }], status: "active", version: 1 });
  await assert.rejects(h.enable("faq-code"), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.match(error.message, /^plugin 'faq-code' cannot be turned on: content type 'faq' already exists with field 'question' as 'integer', not 'text'; content type 'faq' already exists without field 'answer'$/);
    return true;
  });
  assert.deepEqual(h.imports, []);
});

test("boot skips a tier-1 plugin (its types are already stored) and still attaches a code plugin", async (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "warn", (message: string) => void warnings.push(message));
  const h = harness((imports) => [source("testimonials-faq", { contentTypes: [FAQ] }, imports), source("code", CODE_PLUGIN, imports)]);
  for (const pluginId of ["testimonials-faq", "code"]) {
    await h.activationRepo.save({ workspaceId: WORKSPACE, pluginId, version: "1.0.0", enabled: true, updatedAt: "2026-09-01T00:00:00.000Z" });
  }
  await h.runtime.attachEnabledPluginsAtBoot();
  assert.deepEqual(warnings, []);
  assert.deepEqual(h.imports, ["code"]);
  assert.equal(await h.faq(), null, "boot re-applies nothing: declared types were stored when the plugin was turned on");
});

test("a code plugin whose type creation fails after its code attached is detached again, and its activation is rolled back", async () => {
  const imports: string[] = [];
  const activationRepo = new InMemoryPluginActivationRepo();
  const failing = { findByKey: async () => null, register: async () => ({ ok: false as const, error: new Error("index provisioning failed") }) };
  const runtime = composePluginRuntime({
    workspaceId: WORKSPACE, clock, activationRepo, sources: [source("faq-plus", { ...CODE_PLUGIN, contentTypes: [FAQ] }, imports)], declaredContentTypes: failing,
  });
  await assert.rejects(
    setPluginEnabled({
      deps: { clock, repo: activationRepo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
      input: { workspaceId: WORKSPACE, pluginId: "faq-plus", enabled: true },
    }),
    { message: "index provisioning failed" },
  );
  assert.deepEqual(imports, ["faq-plus"], "the code did load before the type failed");
  assert.equal(await runtime.previewPluginBeforeSave("faq-plus", { id: "d", workspaceId: WORKSPACE, title: "t", slug: "t", status: "draft", bodyJson: {}, ext: {} }), null, "no hook left attached");
  assert.deepEqual(await runtime.beforeSaveHook({ id: "d", workspaceId: WORKSPACE, title: "t", slug: "t", status: "draft", bodyJson: {}, ext: {} }), {});
  assert.equal(await activationRepo.getActivation({ workspaceId: WORKSPACE, pluginId: "faq-plus" }), null);
});
