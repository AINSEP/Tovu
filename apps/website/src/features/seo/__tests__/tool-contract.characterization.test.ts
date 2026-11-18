/**
 * @file Characterization of the SEO agent-tool contract, built THROUGH THE HOST CONTRIBUTOR
 * (`contributeSeoTools().build(deps)`), so it pins what the assistant's composition root receives
 * regardless of which package the catalog and handlers live in. It must stay green, unedited, across
 * the move of the tool catalog and handlers into `@jini-ai/cms/seo`.
 *
 * Pinned: registration ids and their order (saved in permissions and audit rows), every descriptor
 * byte-for-byte against a committed golden (including `metadata`: the host's search vocabulary and
 * approval policy), the derived-risk map, the per-tool permission refusal, one success view per
 * tool, the settings tool's refusal of an unknown key and the version-conflict envelope of a stale
 * `expectedVersion`. Real in-memory adapters back every port, so a write is asserted against real
 * repo state.
 */
import "#src/platform/site-dir/__tests__/helpers/isolated-catalog-home";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import { ForbiddenError } from "@jini-ai/cms/core";
import { createSitemapService } from "@jini-ai/cms/seo";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryAssetRenditionRepo, InMemoryMediaContentTypeStore, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "#src/features/media/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";
import { InMemorySettingsRepo } from "#src/features/settings/index";
import { createSeoDeps } from "../index.js";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { contributeSeoTools, type SeoToolDeps } from "../tool-registrations.js";

const WORKSPACE_ID = "ws-seo-contract";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-11-18T00:00:00.000Z";
const PERMISSION = "admin.seo.manage";

const TOOL_IDS = [
  "seo_get_entry_meta",
  "seo_analyze_entry",
  "seo_set_entry_overrides",
  "seo_get_settings",
  "seo_set_settings",
  "seo_regenerate_sitemap",
] as const;

const DERIVED_RISK: ReadonlyArray<readonly [string, string]> = [
  ["seo_get_entry_meta", "none"],
  ["seo_analyze_entry", "none"],
  ["seo_set_entry_overrides", "mutates-durable-state"],
  ["seo_get_settings", "none"],
  ["seo_set_settings", "mutates-durable-state"],
  ["seo_regenerate_sitemap", "mutates-durable-state"],
];

const REFUSAL_INPUT: Readonly<Record<(typeof TOOL_IDS)[number], unknown>> = {
  seo_get_entry_meta: { entryId: "post-1" },
  seo_analyze_entry: { entryId: "post-1" },
  seo_set_entry_overrides: { entryId: "post-1", expectedVersion: 1, title: "Changed" },
  seo_get_settings: {},
  seo_set_settings: { twitterSite: "@example" },
  seo_regenerate_sitemap: {},
};

const GOLDEN = JSON.parse(readFileSync(new URL("./tool-contract.characterization.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

/** What the tools return for the seeded post, copied from the behaviour before the move. */
const EXPECTED = {
  entryMeta: {"meta": {"version": 1, "title": "Hello World", "description": "An excerpt body.", "canonical": "https://example.test/hello-world", "robots": {"noindex": false, "nofollow": false}, "openGraph": {"title": "Hello World", "description": "An excerpt body.", "type": "article", "url": "https://example.test/hello-world"}, "twitter": {"card": "summary_large_image", "title": "Hello World", "description": "An excerpt body."}, "jsonLd": [{"@context": "https://schema.org", "@type": "Article", "headline": "Hello World", "description": "An excerpt body."}]}},
  analysis: {"analysis": {"entryId": "post-1", "score": 100, "issues": [], "resolved": {"version": 1, "title": "Hello World", "description": "An excerpt body.", "canonical": "https://example.test/hello-world", "robots": {"noindex": false, "nofollow": false}, "openGraph": {"title": "Hello World", "description": "An excerpt body.", "type": "article", "url": "https://example.test/hello-world"}, "twitter": {"card": "summary_large_image", "title": "Hello World", "description": "An excerpt body."}, "jsonLd": [{"@context": "https://schema.org", "@type": "Article", "headline": "Hello World", "description": "An excerpt body."}]}}},
  settings: {"settings": {"titleTemplate": "%s", "defaultRobots": {"noindex": false, "nofollow": false}, "sitemapEnabled": true, "robotsRules": []}},
  settingsAfterWrite: {"settings": {"titleTemplate": "%s", "twitterSite": "@example", "defaultRobots": {"noindex": false, "nofollow": false}, "sitemapEnabled": true, "robotsRules": []}},
  overrides: {"overrides": {"title": "Changed"}},
  unknownKeyMessage: "'notASetting' is not a registered SEO setting field. Fix the input and retry — this will not resolve on retry without an input change. Schema for 'seo_set_settings': " + JSON.stringify((GOLDEN.seo_set_settings as { inputSchema: unknown }).inputSchema),
  conflictMessage: "VERSION_CONFLICT: This entry was changed by someone else after you opened it (you had version 7, it is now version 1). Nothing was saved. Reload it to see the latest version, then make your change again.. Your change was NOT applied and nothing was overwritten. Call content_read.seo_entry_meta again, reapply the change on top of what it returns, and resend with that result's `version` as `expectedVersion`. Do not resend this call unchanged. If the other change conflicts with what the person asked for, tell them instead of choosing.",
};

interface Fixture {
  deps: SeoToolDeps;
  allow: { value: boolean };
  postRepo: InMemoryPostRepo;
  settingsRepo: InMemorySettingsRepo;
}

async function makeFixture(): Promise<Fixture> {
  const allow = { value: true };
  let counter = 0;
  const clock = { nowMs: () => Date.parse(NOW), nowIso: () => NOW };
  const idGen = { newId: () => { counter += 1; return `seo-id-${counter}`; } };
  const postRepo = new InMemoryPostRepo({}, { initialRows: [buildPostRecord({
    id: "post-1", workspaceId: WORKSPACE_ID, title: "Hello World", slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "An excerpt body." }] }] },
    status: "published", kind: "post", updatedAt: NOW, version: 1, seoExtJson: null,
  })] });
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = new InMemoryPrincipalRepo({}, { initialRows: [] });
  await ensureSeoSettingDefinitions({ settingsRepo, clock, ids: idGen, principals: principalRepo }, { workspaceId: WORKSPACE_ID, systemPrincipalId: "system-seo" });
  const base = {
    workspaceId: WORKSPACE_ID, seoReady: Promise.resolve(), outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    postRepo, settingsRepo, principalRepo, mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }),
    mediaContentTypeStore: new InMemoryMediaContentTypeStore(),
    assetRenditionRepo: new InMemoryAssetRenditionRepo({}, { initialRows: [] }),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
    clock, idGen,
    authorize: async () => (allow.value ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" }),
    originRegistry: {
      canonicalOrigin: async () => ({ scheme: "https" as const, host: "example.test", verifiedAt: NOW, source: "workspace-setting" as const }),
      isAllowedRedirectTarget: async () => false,
      isAllowedEgressTarget: async () => false,
    },
  };
  const seoDeps = createSeoDeps({ deps: base }, {});
  const sitemapService = createSitemapService({ deps: seoDeps }, {});
  return { deps: { ...base, seoDeps, sitemapService } as unknown as SeoToolDeps, allow, postRepo, settingsRepo };
}

/** What reaches the model: the tool result as JSON, so a key that is `undefined` is not a view difference. */
async function viewOf(result: Promise<unknown>): Promise<unknown> {
  return JSON.parse(JSON.stringify(await result));
}

function caller(registrations: ToolRegistration[]) {
  return (id: string, input: unknown): Promise<unknown> => {
    const found = registrations.find((registration) => registration.descriptor.id === id);
    assert.ok(found, `expected '${id}' to be wired`);
    const ctx: ToolExecutionContext = { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
    return Promise.resolve(found.handler(ctx, {}));
  };
}

test("(a) registration ids, in order, are the six seo tools", async () => {
  const ids = contributeSeoTools().build((await makeFixture()).deps, undefined).map((registration) => registration.descriptor.id);
  assert.deepEqual(ids, [...TOOL_IDS]);
});

test("(b) every descriptor equals the committed golden, metadata included", async () => {
  for (const registration of contributeSeoTools().build((await makeFixture()).deps, undefined)) {
    const descriptor = JSON.parse(JSON.stringify(registration.descriptor));
    assert.deepStrictEqual(descriptor, GOLDEN[registration.descriptor.id], registration.descriptor.id);
  }
  assert.deepEqual(Object.keys(GOLDEN), [...TOOL_IDS]);
});

test("(c) the contributor's derived-risk map is the six authored entries", () => {
  assert.deepEqual([...contributeSeoTools().risk.entries()], DERIVED_RISK.map(([id, risk]) => [id, risk]));
});

for (const toolId of TOOL_IDS) {
  test(`(d) ${toolId}: a principal without the permission is refused with the permission-denied error`, async () => {
    const fixture = await makeFixture();
    const call = caller(contributeSeoTools().build(fixture.deps, undefined));
    fixture.allow.value = false;
    await assert.rejects(call(toolId, REFUSAL_INPUT[toolId]), (error: unknown) => {
      assert.ok(error instanceof ForbiddenError, `got ${(error as Error)?.constructor?.name}`);
      assert.equal(error.message, `principal '${PRINCIPAL_ID}' is not authorized for '${PERMISSION}' (insufficient_permission)`);
      return true;
    });
  });
}

test("(e) one success call per tool returns the model-facing view", async () => {
  const fixture = await makeFixture();
  const call = caller(contributeSeoTools().build(fixture.deps, undefined));
  assert.deepStrictEqual(await viewOf(call("seo_get_entry_meta", { entryId: "post-1" })), EXPECTED.entryMeta);
  assert.deepStrictEqual(await viewOf(call("seo_analyze_entry", { entryId: "post-1" })), EXPECTED.analysis);
  assert.deepStrictEqual(await viewOf(call("seo_get_settings", {})), EXPECTED.settings);
  assert.deepStrictEqual(await viewOf(call("seo_set_settings", { twitterSite: "@example" })), EXPECTED.settingsAfterWrite);
  assert.deepStrictEqual(await viewOf(call("seo_set_entry_overrides", { entryId: "post-1", expectedVersion: 1, title: "Changed" })), EXPECTED.overrides);
  assert.deepStrictEqual(await call("seo_regenerate_sitemap", {}), { accepted: true });
  assert.equal((await fixture.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }))?.version, 2);
});

test("(f) the settings tool refuses an unknown key with the same message, and stores nothing", async () => {
  const fixture = await makeFixture();
  const call = caller(contributeSeoTools().build(fixture.deps, undefined));
  await assert.rejects(call("seo_set_settings", { notASetting: true }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, EXPECTED.unknownKeyMessage);
    return true;
  });
  assert.deepStrictEqual(await viewOf(call("seo_get_settings", {})), EXPECTED.settings);
});

test("(g) a write with a stale expectedVersion returns the same version-conflict envelope and changes nothing", async () => {
  const fixture = await makeFixture();
  const call = caller(contributeSeoTools().build(fixture.deps, undefined));
  await assert.rejects(call("seo_set_entry_overrides", { entryId: "post-1", expectedVersion: 7, title: "Stale" }), (error: unknown) => {
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, EXPECTED.conflictMessage);
    return true;
  });
  assert.equal((await fixture.postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" }))?.version, 1);
});

