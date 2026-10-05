/** AW-7 Tier 1 (2026-10-04): enabling a declarative plugin applies its manifest instead of importing code. */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryContentTypeRepo } from "#src/features/content-types/index";

import { PluginInvalidError } from "../../activation.js";
import { createDeclarativeAwareEnable, createDeclaredContentTypePorts } from "../../declarative-enable.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import type { PluginManifest } from "../../manifest.js";

const WS = "ws-1";
const FAQ = { key: "faq", label: "FAQ", fields: [{ name: "answer", kind: "text", required: true }] };

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

function record(m: PluginManifest | undefined): PluginDiscoveryRecord {
  return { id: "testimonials-faq", name: "T", version: "1.0.0", source: "site", status: m ? "valid" : "invalid", errors: [], ...(m ? { manifest: m } : {}) };
}

function harness(records: PluginDiscoveryRecord[]) {
  const repo = new InMemoryContentTypeRepo();
  const outbox = { enqueue: async () => {} };
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `id-${++next}` };
  const ports = createDeclaredContentTypePorts({ repo, clock, ids, outbox });
  const codeEnables: string[] = [];
  const enable = createDeclarativeAwareEnable({
    workspaceId: WS,
    discoverPlugins: async () => records,
    enableCode: async (pluginId) => void codeEnables.push(pluginId),
    contentTypes: ports,
  });
  return { repo, enable, codeEnables };
}

test("a tier-1 plugin registers its content types and never reaches the code loader", async () => {
  const h = harness([record(manifest())]);
  await h.enable("testimonials-faq");
  assert.deepEqual(h.codeEnables, []);
  const faq = await h.repo.findByKey({ workspaceId: WS, key: "faq" });
  assert.deepEqual(faq?.fields, [{ name: "answer", kind: "text", required: true, queryable: false }]);
  assert.equal(faq?.owner, undefined, "registered under the default ext.site envelope");
  const [revision] = h.repo.listRevisions();
  assert.equal(revision?.actorId, "plugin:testimonials-faq");
  assert.equal(revision?.principalKind, "system");
});

test("re-enabling is idempotent: the existing type is kept, nothing re-registered", async () => {
  const h = harness([record(manifest())]);
  await h.enable("testimonials-faq");
  await h.enable("testimonials-faq");
  assert.equal(h.repo.listRevisions().length, 1);
});

test("a tier-3 plugin with no content types goes straight to the code loader", async () => {
  const h = harness([record(manifest({ tier: "tier-3", contentTypes: undefined }))]);
  await h.enable("testimonials-faq");
  assert.deepEqual(h.codeEnables, ["testimonials-faq"]);
  assert.deepEqual(h.repo.listRevisions(), []);
});

test("a tier-3 plugin with content types loads its code first, then registers its types", async () => {
  const order: string[] = [];
  const repo = new InMemoryContentTypeRepo();
  const ports = createDeclaredContentTypePorts({ repo, clock: { nowMs: () => 0 }, ids: { newId: () => "x" }, outbox: { enqueue: async () => {} } });
  const enable = createDeclarativeAwareEnable({
    workspaceId: WS,
    discoverPlugins: async () => [record(manifest({ tier: "tier-3" }))],
    enableCode: async () => {
      order.push(`code:${(await repo.findByKey({ workspaceId: WS, key: "faq" })) === null ? "before-types" : "after-types"}`);
    },
    contentTypes: ports,
  });
  await enable("testimonials-faq");
  assert.deepEqual(order, ["code:before-types"]);
  assert.notEqual(await repo.findByKey({ workspaceId: WS, key: "faq" }), null);
});

test("an unknown or invalid record is handed to the code loader, whose own fail-closed path reports it", async () => {
  const h = harness([record(undefined)]);
  await h.enable("testimonials-faq");
  await h.enable("someone-else");
  assert.deepEqual(h.codeEnables, ["testimonials-faq", "someone-else"]);
});

test("an invalid declaration refuses the enable with PluginInvalidError and writes nothing", async () => {
  const h = harness([record(manifest({ hooks: ["content.entry.beforeSave"], contentTypes: [{ key: "post" }] }))]);
  await assert.rejects(h.enable("testimonials-faq"), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.match(error.message, /^plugin 'testimonials-faq' declares something it cannot: /);
    assert.match(error.message, /cannot declare 'hooks'/);
    assert.match(error.message, /'post' is reserved by core/);
    return true;
  });
  assert.deepEqual(h.repo.listRevisions(), []);
  assert.deepEqual(h.codeEnables, []);
});

test("a conflicting existing type refuses the enable before any code loads or type is written", async () => {
  const h = harness([record(manifest({ tier: "tier-3", contentTypes: [FAQ, { key: "fresh", label: "Fresh", fields: [{ name: "a", kind: "text" }] }] }))]);
  await h.repo.save({ workspaceId: WS, key: "faq", label: "Mine", fields: [{ name: "answer", kind: "integer", required: false, queryable: false }], status: "active", version: 1 });
  await assert.rejects(h.enable("testimonials-faq"), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.equal(error.message, "plugin 'testimonials-faq' cannot be turned on: content type 'faq' already exists with field 'answer' as 'integer', not 'text'");
    return true;
  });
  assert.equal(await h.repo.findByKey({ workspaceId: WS, key: "fresh" }), null);
  assert.deepEqual(h.codeEnables, []);
});

test("the ports' register surfaces core's own rejections as a failed result", async () => {
  const repo = new InMemoryContentTypeRepo();
  const ports = createDeclaredContentTypePorts({ repo, clock: { nowMs: () => 0 }, ids: { newId: () => "x" }, outbox: { enqueue: async () => {} } });
  const result = await ports.register({ workspaceId: WS, key: "post", label: "P", fields: [{ name: "a", kind: "text", required: false, queryable: false }], actorId: "plugin:p" });
  assert.equal(result.ok, false);
});
