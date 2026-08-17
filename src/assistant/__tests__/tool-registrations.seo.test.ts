/**
 * @file Covers the 6 SEO tools: catalog completeness (every entry wired — nothing withheld in this
 * domain), published contracts, risk cross-check, the ADR-021 authorization half (mixed:
 * `seo_get_entry_meta`/`seo_analyze_entry`/`seo_get_settings`/`seo_regenerate_sitemap` are
 * explicit-handler-checked; `seo_set_entry_overrides`/`seo_set_settings` are self-enforcing
 * chokepoints), and a multi-tool workflow test (set overrides -> get to verify -> analyze).
 *
 * Uses the REAL in-memory `PostRepoPort`/`SettingsRepoPort` adapters and the real
 * `getEntryMeta`/`analyzeEntry`/`setEntrySeoOverrides`/`getSeoSettings`/`setSeoSettings`/
 * `regenerateSitemapCache` domain functions, so "the override actually landed" is asserted against
 * real repo state, not a spy.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { ForbiddenError } from "@jini-ai/cms/core";
import { InMemoryPostRepo } from "../../features/post";
import type { PostRecord } from "../../features/post/post";
import { InMemorySettingsRepo } from "../../features/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import {
  InMemoryAssetRenditionRepo,
  InMemoryMediaRepo,
  InMemoryTransformDefinitionRepo,
} from "../../media";
import { getSeoAgentToolCatalog, type AgentToolDefinition } from "../../seo/agent-tools";
import { ensureSeoSettingDefinitions, getSeoSettings } from "../../seo/settings";
import { contributeSeoTools } from "../../seo/tool-registrations";
import type { RouteDeps } from "../../server/routes/types";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations";
import { resetToolContributorsForTests } from "../tool-contribution-registry";

// SEO moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 batch 2 — see `tool-contribution-registry.ts`'s
// header), so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly
// installs it first, mirroring what the real composition roots now do via
// `installFirstPartyToolContributors()`. Reset first so this file's own registration is the only one
// this process's registry holds while these tests run.
resetToolContributorsForTests();
contributeSeoTools();

const WORKSPACE_ID = "ws-seo-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-07-29T00:00:00.000Z";

function seedPost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE_ID,
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "An excerpt body." }] }] },
    status: "published",
    kind: "post",
    updatedAt: NOW,
    version: 1,
    seoExtJson: null,
    ...overrides,
  };
}

async function fakeRouteDeps(options: { allow?: boolean; posts?: PostRecord[] } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];

  const postRepo = new InMemoryPostRepo(options.posts ?? [seedPost()]);
  const settingsRepo = new InMemorySettingsRepo();

  const clock = { nowIso: () => NOW };
  let idCounter = 0;
  const idGen = { newId: () => `seo-tool-id-${++idCounter}` };
  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };
  const principalRepo = new InMemoryPrincipalRepo([]);

  await ensureSeoSettingDefinitions(
    { settingsRepo, clock, ids: idGen, principals: principalRepo },
    { workspaceId: WORKSPACE_ID, systemPrincipalId: "system-seo" },
  );

  const deps = {
    workspaceId: WORKSPACE_ID,
    seoReady: Promise.resolve(),
    postRepo,
    settingsRepo,
    principalRepo,
    mediaRepo: new InMemoryMediaRepo([]),
    assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
    transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    clock,
    idGen,
    authorize,
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, postRepo, settingsRepo };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function seoRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("seo_")).map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = seoRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = getSeoAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

const ALL_SEO_TOOL_IDS = ["seo_get_entry_meta", "seo_analyze_entry", "seo_set_entry_overrides", "seo_get_settings", "seo_set_settings", "seo_regenerate_sitemap"];

// ---------------------------------------------------------------------------
// 1. Catalog completeness — every entry wired, nothing withheld
// ---------------------------------------------------------------------------

test("exactly the 6 SEO catalog entries are registered — nothing withheld in this domain", async () => {
  const { deps } = await fakeRouteDeps();
  assert.deepEqual([...seoRegistrations(deps).keys()].sort(), [...ALL_SEO_TOOL_IDS].sort());
  assert.equal(getSeoAgentToolCatalog().length, 6, "sanity: the full SEO catalog is still 6 entries");
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired SEO registration publishes its catalog entry's inputSchema and description verbatim", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [id, registration] of seoRegistrations(deps)) {
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every wired SEO tool", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [, registration] of seoRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined);
  }
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the independent risk classification agrees with the catalog for every wired SEO tool", async () => {
  const { deps } = await fakeRouteDeps();
  for (const id of seoRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("a SEO catalog entry cannot downgrade its own risk — declaring sideEffects:'none' for seo_set_settings fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("seo_set_settings", { ...catalogEntry("seo_set_settings"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the ToolPolicy layer is a pass-through 'allow' for every wired SEO registration", async () => {
  const { deps } = await fakeRouteDeps();
  for (const [toolId, registration] of seoRegistrations(deps)) {
    const decision = registration.policy.authorize({ principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, tool: registration.descriptor, input: {} });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

// ---------------------------------------------------------------------------
// 4. Authorization (ADR-021 §2)
// ---------------------------------------------------------------------------

test("seo_get_entry_meta: calls authorize() with 'admin.seo.manage' and the run's principal", async () => {
  const { deps, authorizeCalls } = await fakeRouteDeps();
  authorizeCalls.length = 0;

  await wired(deps, "seo_get_entry_meta").handler(executionContext({ entryId: "post-1" }));

  assert.ok(authorizeCalls.length >= 1);
  assert.equal(authorizeCalls[0].principalId, PRINCIPAL_ID);
  assert.equal(authorizeCalls[0].permission, "admin.seo.manage");
  assert.equal(authorizeCalls[0].workspaceId, WORKSPACE_ID);
});

test("seo_get_entry_meta: a denied principal is rejected", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });

  await assert.rejects(
    () => wired(deps, "seo_get_entry_meta").handler(executionContext({ entryId: "post-1" })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match((error as Error).message, /is not authorized for/);
      return true;
    },
  );
});

test("seo_analyze_entry: a denied principal is rejected", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired(deps, "seo_analyze_entry").handler(executionContext({ entryId: "post-1" })));
});

test("seo_get_settings: a denied principal is rejected", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired(deps, "seo_get_settings").handler(executionContext({})));
});

test("seo_regenerate_sitemap: a denied principal is rejected", async () => {
  const { deps } = await fakeRouteDeps({ allow: false });
  await assert.rejects(() => wired(deps, "seo_regenerate_sitemap").handler(executionContext({})));
});

test("seo_set_entry_overrides: self-enforcing chokepoint — a denied principal is rejected and nothing is written", async () => {
  const { deps, postRepo } = await fakeRouteDeps({ allow: false });
  const before = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });

  await assert.rejects(
    () => wired(deps, "seo_set_entry_overrides").handler(executionContext({ entryId: "post-1", title: "New title" })),
    (error: unknown) => {
      assert.ok(error instanceof ForbiddenError, `expected a ForbiddenError, got ${String(error)}`);
      return true;
    },
  );

  const after = await postRepo.findById({ workspaceId: WORKSPACE_ID, id: "post-1" });
  assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
});

test("seo_set_settings: self-enforcing chokepoint — a denied principal is rejected and nothing is written", async () => {
  const { deps, settingsRepo } = await fakeRouteDeps({ allow: false });
  const before = await getSeoSettings({ settingsRepo }, { workspaceId: WORKSPACE_ID });

  // The settings write-service's own `set()` throws its local `features/settings/errors.ts`
  // `ForbiddenError` (a DIFFERENT class from `core/commands`'s, which `setEntrySeoOverrides` above
  // throws) — asserting the shared message shape rather than a specific class, since both are
  // legitimate "denied" outcomes from two different self-enforcing chokepoints.
  await assert.rejects(
    () => wired(deps, "seo_set_settings").handler(executionContext({ titleTemplate: "%s — Denied" })),
    (error: unknown) => {
      assert.ok(error instanceof Error, `expected an Error, got ${String(error)}`);
      assert.match((error as Error).message, /is not authorized for/);
      return true;
    },
  );

  const after = await getSeoSettings({ settingsRepo }, { workspaceId: WORKSPACE_ID });
  assert.deepEqual(after, before, "the permission gate must run ahead of any durable effect");
});

test("seo_set_entry_overrides: rejects an unregistered field the same way the chokepoint does, with the schema attached for retry", async () => {
  const { deps } = await fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "seo_set_entry_overrides").handler(executionContext({ entryId: "post-1", notAField: "x" })),
    /Fix the input and retry/,
  );
});

test("seo_get_entry_meta: an unknown entryId propagates SeoEntryNotFoundError unwrapped", async () => {
  const { deps } = await fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "seo_get_entry_meta").handler(executionContext({ entryId: "no-such-entry" })),
    /was not found/,
  );
});

// ---------------------------------------------------------------------------
// 5. Multi-tool workflow
// ---------------------------------------------------------------------------

test("workflow: set entry overrides, get entry meta to confirm the override is reflected, analyze to confirm the score improved", async () => {
  // Empty body: `deriveExcerpt` has no text to fall back to, so `description` is genuinely absent
  // (not merely un-overridden) until `seo_set_entry_overrides` sets one explicitly below.
  const { deps } = await fakeRouteDeps({ posts: [seedPost({ title: "Hello World", bodyJson: { type: "doc", content: [] } })] });

  const before = (await wired(deps, "seo_analyze_entry").handler(executionContext({ entryId: "post-1" }))) as {
    analysis: { score: number; issues: unknown[] };
  };
  assert.ok(before.analysis.issues.some((issue) => (issue as { code: string }).code === "missing_description"));

  await wired(deps, "seo_set_entry_overrides").handler(
    executionContext({ entryId: "post-1", title: "Custom Title", description: "A hand-written description." }),
  );

  const meta = (await wired(deps, "seo_get_entry_meta").handler(executionContext({ entryId: "post-1" }))) as {
    meta: { title: string; description?: string };
  };
  assert.equal(meta.meta.title, "Custom Title");
  assert.equal(meta.meta.description, "A hand-written description.");

  const after = (await wired(deps, "seo_analyze_entry").handler(executionContext({ entryId: "post-1" }))) as {
    analysis: { score: number; issues: unknown[] };
  };
  assert.equal(after.analysis.score, 100, "no more issues once title/description overrides are set");
  assert.equal(after.analysis.issues.length, 0);
});

test("workflow: set site-wide settings, get settings to confirm the patch landed and other fields are untouched", async () => {
  const { deps } = await fakeRouteDeps();

  const before = (await wired(deps, "seo_get_settings").handler(executionContext({}))) as {
    settings: { titleTemplate: string; sitemapEnabled: boolean };
  };
  assert.equal(before.settings.titleTemplate, "%s");
  assert.equal(before.settings.sitemapEnabled, true);

  await wired(deps, "seo_set_settings").handler(executionContext({ titleTemplate: "%s — My Site" }));

  const after = (await wired(deps, "seo_get_settings").handler(executionContext({}))) as {
    settings: { titleTemplate: string; sitemapEnabled: boolean };
  };
  assert.equal(after.settings.titleTemplate, "%s — My Site");
  assert.equal(after.settings.sitemapEnabled, true, "untouched field must survive the partial patch");
});
