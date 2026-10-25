/** OPUS-REVIEW T1: both seed and CAS writes validate before any mutation. */
import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { embedMarkerSnippetFromConfig } from "@jini-ai/cms/widgets/markers";
import { createPost, InMemoryPostRepo } from "#src/features/post/index";
import { InMemoryPagesHtmlDocumentStore } from "#src/features/pages/html-document-store.memory";
import { PluginEmbedValidationError } from "../../exports/diagnostics.js";
import { config, definition, harness, owner, workspaceId } from "../fixtures/plugin-exports.js";
const clock = { nowMs: () => Date.parse("2026-10-24T00:00:00.000Z") };

test("T1: invalid known props reject seed/save with a typed editor error and preserve content/version", async () => {
  const { runtime } = harness();
  const repo = new InMemoryPostRepo();
  await createPost({ deps: { repo, clock }, input: { workspaceId, id: "page", title: "Page", kind: "page" } });
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId, postId: "page" }, { repo, clock, validatePluginEmbeds: runtime.validateHtml });
  const invalid = embedMarkerSnippetFromConfig({ config: { ...config, props: { label: 42 } } });
  const beforeSeed = await repo.findById({ workspaceId, id: "page" });
  await assert.rejects(store.ensureHtmlFormat(invalid), PluginEmbedValidationError);
  assert.deepEqual(await repo.findById({ workspaceId, id: "page" }), beforeSeed);
  await store.ensureHtmlFormat("<p>Original</p>");
  await store.read();
  const beforeWrite = await repo.findById({ workspaceId, id: "page" });
  await assert.rejects(store.write(invalid), PluginEmbedValidationError);
  assert.deepEqual(await repo.findById({ workspaceId, id: "page" }), beforeWrite);
});

test("T1: unknown/disabled save with warnings; versions give actionable editor reasons", async () => {
  for (const packages of [[], [{ ...owner, enabled: false }]]) {
    const { runtime } = harness({ packages });
    const warnings = await runtime.validateHtml({ workspaceId, html: embedMarkerSnippetFromConfig({ config }) });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /fallback/);
  }
  const newer = await harness().runtime.validateHtml({ workspaceId, html: embedMarkerSnippetFromConfig({ config: { ...config, version: 4 } }) });
  assert.match(newer[0]!.message, /needs plugin v4/i);
  const retired = await harness({ packages: [{ ...owner, exports: { button: { ...definition, minVersion: 2 } } }] }).runtime.validateHtml({ workspaceId, html: embedMarkerSnippetFromConfig({ config }) });
  assert.match(retired[0]!.message, /contract v1 retired/i);
});

test("T1: a mixed batch cannot hide invalid props behind an earlier valid occurrence", async () => {
  const { runtime } = harness();
  const html = embedMarkerSnippetFromConfig({ config }) + embedMarkerSnippetFromConfig({ config: { ...config, props: { label: true } } });
  await assert.rejects(runtime.validateHtml({ workspaceId, html }), PluginEmbedValidationError);
  await assert.rejects(runtime.validateHtml({ workspaceId: "other-site", html }), PluginEmbedValidationError);
});

test("T1: asynchronous validation cannot recapture a newer write's concurrency basis", async () => {
  const repo = new InMemoryPostRepo();
  await createPost({ deps: { repo, clock }, input: { workspaceId, id: "page", title: "Page", kind: "page" } });
  let release!: () => void;
  const secondGate = new Promise<void>(resolve => { release = resolve; });
  const store = new InMemoryPagesHtmlDocumentStore({ workspaceId, postId: "page" }, { repo, clock,
    validatePluginEmbeds: async ({ html }) => { if (html.includes("second")) await secondGate; return []; } });
  await store.ensureHtmlFormat("<p>Original</p>");
  await store.read();
  const first = store.write("<p>first</p>");
  const second = store.write("<p>second</p>");
  const rejected = assert.rejects(second, /edited elsewhere/);
  await first;
  release();
  await rejected;
  assert.equal(await store.read(), "<p>first</p>");
});
