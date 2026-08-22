import assert from "node:assert/strict";
import test from "node:test";

import {
  listCapabilitySources,
  registerCapabilitySource,
  resetCapabilitySourcesForTests,
  type CapabilityCard,
  type CapabilitySource,
} from "../capability-source-registry.js";

/**
 * @file Contract tests for `capability-source-registry.ts` — the register/list/reset seam a
 * capability source (an installed Agent Plugin's Skills today) registers itself into. Mirrors
 * `tool-contribution-registry.test.ts`'s own coverage of the identical shape one seam over: register
 * appends in call order, re-registering the same id replaces in place rather than appending, and a
 * freshly reset registry starts empty.
 */

function fakeCard(id: string): CapabilityCard {
  return {
    id,
    kind: "test-kind",
    pluginId: "test-plugin",
    skillName: "test-skill",
    revision: "test-revision",
    name: "Test Card",
    description: "A fake card for exercising the registry mechanism.",
    keywords: ["test"],
    source: "test-source",
    handle: { note: "opaque" },
  };
}

function fakeSource(id: string, cards: readonly CapabilityCard[]): CapabilitySource {
  return { id, list: async () => cards };
}

test.beforeEach(() => {
  resetCapabilitySourcesForTests();
});

test("a freshly reset registry has no sources", () => {
  assert.deepEqual(listCapabilitySources(), []);
});

test("registerCapabilitySource appends in call order", () => {
  registerCapabilitySource(fakeSource("alpha", [fakeCard("alpha:one")]));
  registerCapabilitySource(fakeSource("beta", [fakeCard("beta:one")]));
  assert.deepEqual(listCapabilitySources().map((s) => s.id), ["alpha", "beta"]);
});

test("re-registering the same id REPLACES the earlier entry in place, not appends", async () => {
  registerCapabilitySource(fakeSource("alpha", [fakeCard("alpha:one")]));
  registerCapabilitySource(fakeSource("beta", [fakeCard("beta:one")]));
  registerCapabilitySource(fakeSource("alpha", [fakeCard("alpha:two")])); // replaces "alpha", position preserved

  const sources = listCapabilitySources();
  assert.deepEqual(sources.map((s) => s.id), ["alpha", "beta"], "source count/order must not change on replacement");
  const alpha = sources[0] as CapabilitySource;
  const cards = await alpha.list({ workspaceId: "workspace-local" });
  assert.deepEqual(cards.map((c) => c.id), ["alpha:two"]);
});

test("resetCapabilitySourcesForTests clears everything registered so far", () => {
  registerCapabilitySource(fakeSource("alpha", [fakeCard("alpha:one")]));
  resetCapabilitySourcesForTests();
  assert.deepEqual(listCapabilitySources(), []);
});

test("a source's own read() is reachable off the registered object, when it declares one", async () => {
  const source: CapabilitySource = {
    id: "readable",
    list: async () => [fakeCard("readable:one")],
    read: async (handle) => `content for ${JSON.stringify(handle)}`,
  };
  registerCapabilitySource(source);

  const found = listCapabilitySources().find((s) => s.id === "readable");
  assert.ok(found?.read);
  const content = await found.read({ packageRoot: "/abs/path" }, { workspaceId: "workspace-local" });
  assert.equal(content, 'content for {"packageRoot":"/abs/path"}');
});

test("a source may omit read() entirely rather than throwing for one with nothing to give back", () => {
  registerCapabilitySource({ id: "list-only", list: async () => [] });
  const found = listCapabilitySources().find((s) => s.id === "list-only");
  assert.equal(found?.read, undefined);
});
