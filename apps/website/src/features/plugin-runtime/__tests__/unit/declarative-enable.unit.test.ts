/** AW-7 Tier 1 (2026-10-04): enabling a declarative plugin applies its manifest instead of importing code. */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryContentTypeRepo } from "#src/features/content-types/index";

import { PluginInvalidError } from "../../activation.js";
import { createDeclaredContentTypePorts, deferDeclaredContentTypePorts, enableDeclaredPlugin } from "../../declarative-enable.js";
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

function harness(withPorts = true) {
  const repo = new InMemoryContentTypeRepo();
  const outbox = { enqueue: async () => {} };
  const clock = { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") };
  let next = 0;
  const ids = { newId: () => `id-${++next}` };
  const ports = createDeclaredContentTypePorts({ repo, clock, ids, outbox });
  const order: string[] = [];
  const enable = (m: PluginManifest) =>
    enableDeclaredPlugin(
      {
        pluginId: "testimonials-faq",
        workspaceId: WS,
        manifest: m,
        loadCode: async () => {
          order.push(`code:${(await repo.findByKey({ workspaceId: WS, key: "faq" })) === null ? "before-types" : "after-types"}`);
        },
        unloadCode: () => { order.push("unload"); },
      },
      withPorts ? { contentTypes: ports } : {},
    );
  return { repo, ports, enable, order };
}

test("a tier-1 plugin registers its content types and never reaches the code loader", async () => {
  const h = harness();
  await h.enable(manifest());
  assert.deepEqual(h.order, []);
  const faq = await h.repo.findByKey({ workspaceId: WS, key: "faq" });
  assert.deepEqual(faq?.fields, [{ name: "answer", kind: "text", required: true, queryable: false }]);
  assert.equal(faq?.owner, undefined, "registered under the default ext.site envelope");
  const [revision] = h.repo.listRevisions();
  assert.equal(revision?.actorId, "plugin:testimonials-faq");
  assert.equal(revision?.principalKind, "system");
});

test("re-enabling is idempotent: the existing type is kept, nothing re-registered", async () => {
  const h = harness();
  await h.enable(manifest());
  await h.enable(manifest());
  assert.equal(h.repo.listRevisions().length, 1);
});

test("a code plugin with no content types is just its code load, ports or not", async () => {
  const h = harness(false);
  await h.enable(manifest({ tier: "tier-3", contentTypes: undefined }));
  await h.enable(manifest({ tier: "tier-3", contentTypes: [] }));
  assert.deepEqual(h.order, ["code:before-types", "code:before-types"]);
  assert.deepEqual(h.repo.listRevisions(), []);
});

test("a tier-1 plugin with no content types does nothing at all", async () => {
  const h = harness(false);
  await h.enable(manifest({ contentTypes: null }));
  assert.deepEqual(h.order, []);
});

test("a tier-3 plugin with content types loads its code first, then registers its types", async () => {
  const h = harness();
  await h.enable(manifest({ tier: "tier-3" }));
  assert.deepEqual(h.order, ["code:before-types"]);
  assert.notEqual(await h.repo.findByKey({ workspaceId: WS, key: "faq" }), null);
});

test("declared content types with no ports refuse the enable with PluginInvalidError before any code loads", async () => {
  const h = harness(false);
  await assert.rejects(h.enable(manifest({ tier: "tier-3" })), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.equal(error.message, "plugin 'testimonials-faq' declares content types, but this site cannot create them");
    return true;
  });
  assert.deepEqual(h.order, []);
});

test("a conflicting existing type refuses the enable before any code loads or type is written", async () => {
  const h = harness();
  await h.repo.save({ workspaceId: WS, key: "faq", label: "Mine", fields: [{ name: "answer", kind: "integer", required: false, queryable: false }], status: "active", version: 1 });
  const fresh = { key: "fresh", label: "Fresh", fields: [{ name: "a", kind: "text" }] };
  await assert.rejects(h.enable(manifest({ tier: "tier-3", contentTypes: [FAQ, fresh] })), (error: unknown) => {
    assert.ok(error instanceof PluginInvalidError);
    assert.equal(error.message, "plugin 'testimonials-faq' cannot be turned on: content type 'faq' already exists with field 'answer' as 'integer', not 'text'");
    return true;
  });
  assert.equal(await h.repo.findByKey({ workspaceId: WS, key: "fresh" }), null);
  assert.deepEqual(h.order, []);
});

test("the ports' register surfaces core's own rejections as a failed result", async () => {
  const repo = new InMemoryContentTypeRepo();
  const ports = createDeclaredContentTypePorts({ repo, clock: { nowMs: () => 0 }, ids: { newId: () => "x" }, outbox: { enqueue: async () => {} } });
  const result = await ports.register({ workspaceId: WS, key: "post", label: "P", fields: [{ name: "a", kind: "text", required: false, queryable: false }], actorId: "plugin:p" });
  assert.equal(result.ok, false);
});

test("deferred ports are built once, on first use, and forward both operations", async () => {
  let builds = 0;
  const calls: string[] = [];
  const ports = deferDeclaredContentTypePorts({
    build: () => {
      builds += 1;
      return {
        findByKey: async ({ key }) => { calls.push(`find:${key}`); return null; },
        register: async ({ key }) => { calls.push(`register:${key}`); return { ok: true }; },
      };
    },
  });
  assert.equal(builds, 0, "nothing is built at composition time");
  assert.equal(await ports.findByKey({ workspaceId: WS, key: "faq" }), null);
  assert.deepEqual(await ports.register({ workspaceId: WS, key: "faq", label: "FAQ", fields: [], actorId: "plugin:p" }), { ok: true });
  assert.equal(builds, 1);
  assert.deepEqual(calls, ["find:faq", "register:faq"]);
});

test("a type registration that fails after the code loaded detaches the code and rethrows; nothing stays attached", async () => {
  const h = harness();
  const boom = new Error("index provisioning failed");
  const fresh = { key: "fresh", label: "Fresh", fields: [{ name: "a", kind: "text" }] };
  const failing = { ...h.ports, register: async (input: Parameters<typeof h.ports.register>[0]) => (input.key === "fresh" ? { ok: false as const, error: boom } : h.ports.register(input)) };
  await assert.rejects(
    enableDeclaredPlugin(
      { pluginId: "testimonials-faq", workspaceId: WS, manifest: manifest({ tier: "tier-3", contentTypes: [FAQ, fresh] }), loadCode: async () => { h.order.push("code"); }, unloadCode: () => { h.order.push("unload"); } },
      { contentTypes: failing },
    ),
    (error: unknown) => error === boom,
  );
  assert.deepEqual(h.order, ["code", "unload"]);
});
