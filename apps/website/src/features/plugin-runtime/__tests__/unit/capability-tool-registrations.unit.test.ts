import assert from "node:assert/strict";
import test from "node:test";

import { createToolRegistry } from "@jini-ai/core";

import type { PluginActivationRecord } from "../../activation.js";
import { InMemoryPluginActivationRepo } from "../../repo.memory.js";
import type { PluginDiscoveryRecord } from "../../discovery.js";
import type { PluginManifest } from "../../manifest.js";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import type { PostRecord } from "#src/features/post/post";
import {
  buildPluginCapabilityToolRegistrations,
  loadEnabledPluginCapabilityToolSources,
  pluginCapabilityToolDerivedRisk,
  registerEnabledPluginCapabilityTools,
  type PluginCapabilityToolDeps,
  type PluginCapabilityToolSource,
} from "../../capability-tool-registrations.js";

/**
 * @file Regression coverage for the 2026-08-26 plugin-discoverability fix
 * (`ADS-memory/reports/2026-08-26-plugin-discoverability-audit.md`, backlog task #11): every
 * ENABLED, valid plugin-runtime plugin that declares a readable field must become one real,
 * `search_tools`-discoverable, `content.read`-gated tool that reads that field's already-stored
 * value back for a given post. A DISABLED (or never-activated) plugin must NOT.
 *
 * Written RED-first against pre-fix behavior — before `capability-tool-registrations.ts` existed,
 * there was no loader to call at all, so every one of these failed with a module-resolution error.
 * See this task's handoff report for the captured failing run.
 */

const WORKSPACE = "ws-1";
const PRINCIPAL_ID = "principal-1";

const WORD_COUNT_MANIFEST: PluginManifest = {
  id: "word-count",
  name: "Word Count",
  version: "1.0.0",
  sdkRange: "^0.1.0 || ^0.2.0",
  engine: 1,
  tier: "tier-3",
  capabilities: ["content.read", "content.extend", "hooks.attach"],
  hooks: ["content.entry.beforeSave"],
  fields: [
    {
      path: "ext.word-count.count",
      type: "integer",
      queryable: false,
      description:
        "This post's word count and estimated reading time — computed and stored automatically every time the post is saved while this plugin is enabled.",
    },
  ],
  integrity: {},
};

/** A second, distinct plugin fixture (field carries NO manifest description) — proves the generic
 *  fallback description path, and that two enabled plugins mint two non-colliding tool ids. */
const NO_DESCRIPTION_MANIFEST: PluginManifest = {
  id: "read-time",
  name: "Read Time",
  version: "1.0.0",
  sdkRange: "^0.1.0 || ^0.2.0",
  engine: 1,
  tier: "tier-3",
  capabilities: ["content.read", "content.extend", "hooks.attach"],
  hooks: ["content.entry.beforeSave"],
  fields: [{ path: "ext.read-time.minutes", type: "integer", queryable: false }],
  integrity: {},
};

function discoveryRecord(manifest: PluginManifest, status: PluginDiscoveryRecord["status"] = "valid"): PluginDiscoveryRecord {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    source: "built-in",
    tier: manifest.tier,
    status,
    errors: status === "valid" ? [] : [{ code: "SOME_ERROR", file: null, message: "fixture" }],
    manifest: status === "valid" ? manifest : undefined,
  };
}

function activationRepoWith(records: PluginActivationRecord[]): InMemoryPluginActivationRepo {
  return new InMemoryPluginActivationRepo(records);
}

function enabledActivation(pluginId: string): PluginActivationRecord {
  return { pluginId, workspaceId: WORKSPACE, version: "1.0.0", enabled: true, updatedAt: "2026-08-26T00:00:00.000Z" };
}

function post(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "post-1",
    workspaceId: WORKSPACE,
    title: "Hello",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    updatedAt: "2026-08-26T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

function deps(overrides: Partial<PluginCapabilityToolDeps> = {}): PluginCapabilityToolDeps {
  return {
    authorize: async () => ({ allowed: true }) as never,
    workspaceId: WORKSPACE,
    postRepo: new InMemoryPostRepo(),
    pluginActivationRepo: activationRepoWith([enabledActivation("word-count")]),
    ...overrides,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: ToolHandler's ctx type is owned by @jini-ai/cms/core and is not exported.
function toolContext(input: unknown): any {
  return { input, principal: { id: PRINCIPAL_ID }, run: { id: "run-1" } };
}

// ---------------------------------------------------------------------------
// loadEnabledPluginCapabilityToolSources — the activation gate (RED-first: proves both directions)
// ---------------------------------------------------------------------------

test("an ENABLED, valid, field-declaring plugin produces exactly one tool source", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
    pluginActivationRepo: activationRepoWith([enabledActivation("word-count")]),
  });

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.id, "plugin_capability_word_count");
  assert.equal(sources[0]?.pluginId, "word-count");
});

test("a DISABLED plugin (explicit enabled:false) produces NO tool source", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
    pluginActivationRepo: activationRepoWith([{ ...enabledActivation("word-count"), enabled: false }]),
  });

  assert.deepEqual(sources, []);
});

test("a plugin with NO activation record at all produces NO tool source (plugin-runtime's own default is disabled, the OPPOSITE of Agent Plugins' default-active)", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
    pluginActivationRepo: activationRepoWith([]), // no row for "word-count" at all
  });

  assert.deepEqual(sources, []);
});

test("an invalid plugin produces no tool source even if (inconsistently) activated", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST, "invalid")],
    pluginActivationRepo: activationRepoWith([enabledActivation("word-count")]),
  });

  assert.deepEqual(sources, []);
});

test("two enabled plugins mint two distinct, non-colliding tool ids", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST), discoveryRecord(NO_DESCRIPTION_MANIFEST)],
    pluginActivationRepo: activationRepoWith([enabledActivation("word-count"), enabledActivation("read-time")]),
  });

  const ids = sources.map((s) => s.id).sort();
  assert.deepEqual(ids, ["plugin_capability_read_time", "plugin_capability_word_count"]);
});

test("a field with no manifest-authored description falls back to a non-empty generic description", async () => {
  const sources = await loadEnabledPluginCapabilityToolSources({
    workspaceId: WORKSPACE,
    discoverPlugins: async () => [discoveryRecord(NO_DESCRIPTION_MANIFEST)],
    pluginActivationRepo: activationRepoWith([enabledActivation("read-time")]),
  });

  const field = sources[0]?.fields[0];
  assert.ok(field);
  assert.ok(field.description.length > 0);
  assert.ok(field.description.includes("read-time"), "the fallback must still name the plugin/field, even if weaker prose");
});

// ---------------------------------------------------------------------------
// buildPluginCapabilityToolRegistrations — catalog shape + description content
// ---------------------------------------------------------------------------

const WORD_COUNT_SOURCE: PluginCapabilityToolSource = {
  id: "plugin_capability_word_count",
  pluginId: "word-count",
  pluginName: "Word Count",
  description:
    "Reads content metrics and other data the installed 'Word Count' plugin has already computed and stored for one existing post or page. " +
    "This post's word count and estimated reading time — computed and stored automatically every time the post is saved while this plugin is enabled. " +
    "Requires an existing postId — call content_post_search, content_post_list, or content_post_get first if you do not already have one.",
  fields: [{ path: "ext.word-count.count", fieldKey: "count", type: "integer", description: "word count and reading time" }],
};

test("the built registration is read-only, content.read-gated, and requires a postId", () => {
  const [registration] = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps());
  assert.ok(registration);
  assert.equal(registration.descriptor.id, "plugin_capability_word_count");
  assert.equal(pluginCapabilityToolDerivedRisk([WORD_COUNT_SOURCE]).get("plugin_capability_word_count"), "none");

  const schema = registration.descriptor.inputSchema as Record<string, unknown>;
  assert.deepEqual(schema.required, ["postId"]);
  assert.equal(schema.additionalProperties, false);
});

test("the tool description contains the real user vocabulary this fix targets", () => {
  const [registration] = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps());
  const description = registration?.descriptor.description ?? "";
  for (const term of ["word count", "reading time", "content metrics", "post"]) {
    assert.ok(description.toLowerCase().includes(term), `description must contain '${term}': ${description}`);
  }
});

test("the handler refuses a caller the authorizer denies", async () => {
  const registrations = buildPluginCapabilityToolRegistrations(
    [WORD_COUNT_SOURCE],
    deps({ authorize: async () => ({ allowed: false, reason: "nope" }) as never }),
  );
  const registration = registrations.find((entry) => entry.descriptor.id === "plugin_capability_word_count");
  assert.ok(registration);

  await assert.rejects(() => registration.handler(toolContext({ postId: "post-1" })));
});

test("reading an existing post that already carries the plugin's stored field returns the real value", async () => {
  const postRepo = new InMemoryPostRepo([post({ ext: { "word-count": { count: 42 } } })]);
  const registrations = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps({ postRepo }));
  const registration = registrations.find((entry) => entry.descriptor.id === "plugin_capability_word_count");
  assert.ok(registration);

  const result = (await registration.handler(toolContext({ postId: "post-1" }))) as Record<string, unknown>;
  assert.equal(result.postId, "post-1");
  assert.equal(result.pluginId, "word-count");
  assert.deepEqual(result.fields, { count: 42 });
  assert.equal("note" in result, false, "a post that HAS the field must carry no 'not computed yet' note");
});

test("reading a post that has never been saved since the plugin was enabled returns null + an explanatory note, not an error", async () => {
  const postRepo = new InMemoryPostRepo([post()]); // no `ext` at all
  const registrations = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps({ postRepo }));
  const registration = registrations.find((entry) => entry.descriptor.id === "plugin_capability_word_count");
  assert.ok(registration);

  const result = (await registration.handler(toolContext({ postId: "post-1" }))) as Record<string, unknown>;
  assert.deepEqual(result.fields, { count: null });
  assert.ok(String(result.note).includes("has not computed any field for this post yet"));
});

test("reading a nonexistent postId throws with the exact not-found message", async () => {
  const registrations = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps());
  const registration = registrations.find((entry) => entry.descriptor.id === "plugin_capability_word_count");
  assert.ok(registration);

  await assert.rejects(
    () => registration.handler(toolContext({ postId: "does-not-exist" })),
    (error: unknown) => error instanceof Error && error.message === "post 'does-not-exist' was not found",
  );
});

test("an ext bag shaped unexpectedly (not an object) degrades to null + note rather than throwing", async () => {
  // Defensive case: `post.ext` is a generic JsonObject at the type level (see post.ts's own field
  // doc) — this asserts the handler's `isRecord` narrowing, not merely the happy path.
  const postRepo = new InMemoryPostRepo([post({ ext: { "word-count": "not-an-object" } as never })]);
  const registrations = buildPluginCapabilityToolRegistrations([WORD_COUNT_SOURCE], deps({ postRepo }));
  const registration = registrations.find((entry) => entry.descriptor.id === "plugin_capability_word_count");
  assert.ok(registration);

  const result = (await registration.handler(toolContext({ postId: "post-1" }))) as Record<string, unknown>;
  assert.deepEqual(result.fields, { count: null });
  assert.ok("note" in result);
});

// ---------------------------------------------------------------------------
// registerEnabledPluginCapabilityTools — end-to-end registration, and the collision guard
// ---------------------------------------------------------------------------

test("registerEnabledPluginCapabilityTools registers exactly one tool for one enabled plugin", async () => {
  const registry = createToolRegistry();
  await registerEnabledPluginCapabilityTools(registry, {
    ...deps(),
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
    pluginActivationRepo: activationRepoWith([enabledActivation("word-count")]),
  });

  assert.ok(registry.has("plugin_capability_word_count"));
  assert.equal(registry.list().length, 1);
});

test("registerEnabledPluginCapabilityTools registers nothing for a disabled plugin", async () => {
  const registry = createToolRegistry();
  await registerEnabledPluginCapabilityTools(registry, {
    ...deps(),
    discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
    pluginActivationRepo: activationRepoWith([]),
  });

  assert.equal(registry.list().length, 0);
  assert.equal(registry.has("plugin_capability_word_count"), false);
});

test("a tool id that collides with an already-registered tool fails LOUDLY at registration time (ToolRegistry's own built-in guard), never silently shadows it", async () => {
  const registry = createToolRegistry();
  registry.register({
    descriptor: { id: "plugin_capability_word_count", description: "pre-existing native tool" },
    handler: async () => ({}),
    policy: { authorize: () => "allow" },
  });

  await assert.rejects(
    () =>
      registerEnabledPluginCapabilityTools(registry, {
        ...deps(),
        discoverPlugins: async () => [discoveryRecord(WORD_COUNT_MANIFEST)],
        pluginActivationRepo: activationRepoWith([enabledActivation("word-count")]),
      }),
    (error: unknown) =>
      error instanceof Error && error.message === 'ToolRegistry: tool "plugin_capability_word_count" is already registered',
  );
});
