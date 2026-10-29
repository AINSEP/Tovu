import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createContributionRegistry, type ToolRegistration } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { createRouteDeps } from "../../server/runtime/composition/app.js";
import { isSiteSwitcherEnabled } from "../../platform/site-dir/index.js";
import { devRestartPortFromEnv, type DevRestartPort } from "../../platform/dev-supervisor/index.js";
import { toAssistantRegistryDeps } from "./fixtures/registry-deps.js";
import { buildAssistantToolRegistrations, type AssistantToolRegistryDeps } from "../tool-registrations.js";
import type { AssistantToolContributions, ToolContributor, DerivedToolContributor } from "../tool-registrations.js";
import type { AssistantPermanentDeletesPolicy } from "../../contracts/headless/assistant-permanent-deletes-policy.js";

function contributions(_required: object, _optional = {}): AssistantToolContributions {
  return {
    contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: ToolContributor }) => contribution.domain }),
    derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: DerivedToolContributor }) => contribution.domain }),
  };
}

function registration({ id }: { id: string }, _optional = {}): ToolRegistration {
  return {
    descriptor: { id, description: id, inputSchema: { type: "object", properties: {} },
      metadata: { approval: { class: "read", confirmation: "direct" } } },
    handler: async () => ({ ok: true }), policy: { authorize: () => "allow" },
  };
}

function deps(_required: object, _optional = {}): AssistantToolRegistryDeps {
  return toAssistantRegistryDeps({ routeDeps: createRouteDeps() });
}

// These cases describe the original assembler, including filtering before duplicate detection.
for (const phase of ["domain", "derived"] as const) {
  for (const policy of [undefined, { enabled: false, allowedToolIds: ["trash_purge_item"] },
    { enabled: true, allowedToolIds: [] }, { enabled: true, allowedToolIds: ["trash_purge_item"] }] satisfies (AssistantPermanentDeletesPolicy | undefined)[]) {
    test(`${phase} assembly filters forbidden and ungranted tools before collision checks: ${JSON.stringify(policy)}`, () => {
      const catalog = contributions({});
      const tools = [registration({ id: "pin_allowed" }), registration({ id: "workspace_delete" }),
        registration({ id: "workspace_delete" }), registration({ id: "collections_execute_cleanup" }),
        registration({ id: "trash_purge_item" })];
      if (phase === "domain") catalog.contributors.register({ contribution: { domain: "pins", risk: new Map(), build: () => tools } });
      else catalog.derivedContributors.register({ contribution: { domain: "pins", risk: new Map(), derive: () => tools } });
      const result = buildAssistantToolRegistrations(deps({}), undefined, {
        contributions: catalog, permanentDeletePolicy: policy, includeContentReadCollapse: false,
      }).filter(tool => tools.some(original => original.descriptor.id === tool.descriptor.id));
      assert.deepEqual(result.map(tool => tool.descriptor.id), policy?.enabled && policy.allowedToolIds.includes("trash_purge_item")
        ? ["pin_allowed", "trash_purge_item"] : ["pin_allowed"]);
    });
  }
}

for (const phase of ["domain", "derived"] as const) {
  test(`${phase} collision preserves the exact owner diagnostic`, () => {
    const catalog = contributions({});
    const tool = registration({ id: "pin_shared" });
    catalog.contributors.register({ contribution: { domain: "first", risk: new Map(), build: () => [tool] } });
    if (phase === "domain") catalog.contributors.register({ contribution: { domain: "second", risk: new Map(), build: () => [tool] } });
    else catalog.derivedContributors.register({ contribution: { domain: "second", risk: new Map(), derive: () => [tool] } });
    assert.throws(() => buildAssistantToolRegistrations(deps({}), undefined, { contributions: catalog }), {
      message: `tool-registrations.ts: 'pin_shared' is registered by both the first ${phase === "domain" ? "and second domains" : "domain and second's post-processing pass"} — one tool id must resolve to exactly one handler`,
    });
  });
}

test("derived passes see the same domain-only snapshot and preserve registration order", () => {
  const catalog = contributions({});
  const first = registration({ id: "pin_first" });
  const second = registration({ id: "pin_second" });
  const snapshots: (readonly ToolRegistration[])[] = [];
  catalog.contributors.register({ contribution: { domain: "first", risk: new Map(), build: () => [first, second] } });
  for (const id of ["pin_derived_one", "pin_derived_two"]) {
    catalog.derivedContributors.register({ contribution: { domain: id, risk: new Map(), derive: ({ registrations }) => {
      snapshots.push(registrations);
      return [registration({ id })];
    } } });
  }
  const result = buildAssistantToolRegistrations(deps({}), undefined, { contributions: catalog, includeContentReadCollapse: false });
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[0]!.slice(-2), [first, second]);
  assert.ok(!snapshots[0]!.some(tool => tool.descriptor.id.startsWith("pin_derived")));
  assert.deepEqual(result.slice(-4).map(tool => tool.descriptor.id), ["pin_first", "pin_second", "pin_derived_one", "pin_derived_two"]);
});

const fakeRestart: DevRestartPort = { requestRestart: () => undefined };
const fakeSwitcher = () => false;
for (const scenario of [
  { label: "default", switcher: undefined, restart: undefined, expectedSwitcher: isSiteSwitcherEnabled, expectedRestart: devRestartPortFromEnv() },
  { label: "null", switcher: fakeSwitcher, restart: null, expectedSwitcher: fakeSwitcher, expectedRestart: null },
  { label: "fake", switcher: fakeSwitcher, restart: fakeRestart, expectedSwitcher: fakeSwitcher, expectedRestart: fakeRestart },
]) {
  test(`dependency enrichment preserves caller overrides and fail-closed reads: ${scenario.label}`, () => {
    const catalog = contributions({});
    const original = deps({});
    original.isSiteSwitcherEnabled = scenario.switcher;
    original.devRestart = scenario.restart;
    let currentWorkspace = "first";
    const source = new Proxy(original, { get: (target, key, receiver) => {
      if (key === "workspaceId") return currentWorkspace;
      if (key === "missingPinField") throw new Error("missing peer dependency");
      return Reflect.get(target, key, receiver);
    } });
    let built: AssistantToolRegistryDeps | undefined;
    let builtSurfaces: AssistantSurfaceDeps | undefined;
    catalog.contributors.register({ contribution: { domain: "capture", risk: new Map(), build: (enriched, surfaces) => {
      built = enriched; builtSurfaces = surfaces; return [];
    } } });
    buildAssistantToolRegistrations(source, undefined, { contributions: catalog });
    assert.ok(built);
    assert.notEqual(built, source);
    assert.equal(built.isSiteSwitcherEnabled, scenario.expectedSwitcher);
    assert.equal(built.devRestart === null, scenario.expectedRestart === null);
    assert.equal(typeof built.devRestart?.requestRestart, typeof scenario.expectedRestart?.requestRestart);
    assert.equal(built.devRestart?.canSwitchSite, scenario.expectedRestart?.canSwitchSite);
    if (scenario.label !== "default") assert.equal(built.devRestart, scenario.expectedRestart);
    assert.equal(original.isSiteSwitcherEnabled, scenario.switcher);
    assert.equal(original.devRestart, scenario.restart);
    currentWorkspace = "second";
    assert.equal(built.workspaceId, "second");
    assert.throws(() => Reflect.get(built!, "missingPinField"), /missing peer dependency/);
    assert.ok(builtSurfaces?.surfaceExchanges);
  });
}

test("assembly without contributed registries retains the static assistant tools", () => {
  const result = buildAssistantToolRegistrations(deps({}), undefined, { includeContentReadCollapse: false });
  assert.ok(result.some(tool => tool.descriptor.id === "assistant_demo_choices"));
  assert.ok(result.some(tool => tool.descriptor.id === "tool_gaps_list"));
});
