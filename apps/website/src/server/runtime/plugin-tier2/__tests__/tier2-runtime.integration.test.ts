import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type ContentEntryDraft } from "@tovu/sdk";

import { setPluginEnabled } from "#src/features/plugin-runtime/activation";
import { PluginHookFailedError } from "#src/features/plugin-runtime/hook-registry";
import type { PluginManifest } from "#src/features/plugin-runtime/manifest";
import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";
import { createPost, InMemoryPostRepo } from "#src/features/post/index";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/runtime/composition/plugin-runtime";
import { createTier2WorkerRunner } from "../run-in-worker.js";

/**
 * @file Tier-2 plugin ABI end to end with REAL workers (AW-7): composition -> `loadPlugin()` ->
 * Tier-2 import seam -> a fresh `worker_threads` worker per probe and per filter call.
 *
 * Coverage of the worker side is suppressed by design here (the Jini TS bootstrap drops
 * NODE_V8_COVERAGE in the worker); `worker.unit.test.ts` covers that code in-process.
 *
 * Requirement-to-test map:
 * - enable -> save writes `ext` via the worker; the plugin module is never imported in this
 *   thread; preview returns the patch without saving -> the built-in round-trip test.
 * - a throwing plugin fails the save closed and quarantines at the threshold -> the throw test.
 * - a looping plugin is stopped by the timeout, fails closed, quarantines; a preview of it fails
 *   without counting -> the loop test.
 * - a SITE tier-2 plugin outside every node_modules tree loads from its module snapshot and
 *   resolves `@tovu/sdk` inside the worker -> the site test.
 */

const WORKSPACE = "ws-tier2";
const FIXTURE_ENTRY = path.join(import.meta.dirname, "fixtures", "echo-plugin", "plugin.ts");
/** Generous: a fresh tsx worker on a loaded CI host must never flake the success path. */
const SUCCESS_TIMEOUT_MS = 30_000;
/** The loop test waits this long per call; long enough for a probe under load, short enough to run. */
const LOOP_TIMEOUT_MS = 6_000;

const clock = () => ({ nowMs: () => Date.parse("2026-10-04T12:00:00.000Z") });

function echoManifest(id: string): PluginManifest {
  return {
    id,
    name: "Tier 2 Echo",
    version: "1.0.0",
    sdkRange: "^0.1.0 || ^0.2.0",
    engine: 1,
    tier: "tier-2",
    capabilities: ["content.read", "content.extend", "hooks.attach"],
    hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
    fields: [
      { path: `ext.${id}.titleLength`, type: "integer", queryable: false },
      { path: `ext.${id}.seenSlug`, type: "string", queryable: false },
    ],
    integrity: {},
  };
}

/** A built-in tier-2 source like slice A's: an absolute entry file, and an in-process importer that
 * must never be called. */
function builtInSource(id: string, importedInProcess: string[]): PluginRuntimeSource {
  return {
    manifest: echoManifest(id),
    source: "built-in",
    entryPath: FIXTURE_ENTRY,
    importModule: async (entryPath) => {
      importedInProcess.push(entryPath);
      throw new Error("a tier-2 plugin must never be imported in-process");
    },
  };
}

async function enabledRuntime(source: PluginRuntimeSource, timeoutMs: number, repo = new InMemoryPluginActivationRepo()) {
  const runtime = composePluginRuntime({
    workspaceId: WORKSPACE,
    clock: clock(),
    activationRepo: repo,
    sources: [source],
    failureThreshold: 2,
    tier2CallRunner: createTier2WorkerRunner({}, { timeoutMs }),
  });
  await setPluginEnabled({
    deps: { clock: clock(), repo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
    input: { workspaceId: WORKSPACE, pluginId: source.manifest.id, enabled: true },
  });
  return { runtime, repo };
}

function draft(title: string): ContentEntryDraft {
  return { id: "preview", workspaceId: WORKSPACE, title, slug: "draft-slug", status: "draft", bodyJson: {}, ext: {} };
}

test("built-in tier-2: enable probes in a worker, save writes ext through a worker, preview saves nothing", async () => {
  const importedInProcess: string[] = [];
  const { runtime } = await enabledRuntime(builtInSource("tier2-echo", importedInProcess), SUCCESS_TIMEOUT_MS);
  const postRepo = new InMemoryPostRepo();

  await createPost({ deps: { repo: postRepo, clock: clock(), beforeSaveHook: runtime.beforeSaveHook }, input: { workspaceId: WORKSPACE, id: "p1", title: "Hello" } });
  assert.deepEqual((await postRepo.findById({ workspaceId: WORKSPACE, id: "p1" }))?.ext, {
    "tier2-echo": { seenSlug: "hello", titleLength: 5 },
  });

  assert.deepEqual(await runtime.previewPluginBeforeSave("tier2-echo", draft("Preview me")), { seenSlug: "draft-slug", titleLength: 10 });
  assert.equal(await postRepo.findById({ workspaceId: WORKSPACE, id: "preview" }), null, "preview never saves");

  assert.deepEqual(importedInProcess, [], "the source's in-process importer was never used");
  assert.equal((globalThis as { __tier2EchoFixtureEvaluated?: boolean }).__tier2EchoFixtureEvaluated, undefined, "the plugin module never ran in this thread");
});

test("built-in tier-2: a throwing filter fails the save closed and quarantines at the threshold", async () => {
  const { runtime, repo } = await enabledRuntime(builtInSource("tier2-throw", []), SUCCESS_TIMEOUT_MS);
  const postRepo = new InMemoryPostRepo();
  const save = (id: string) => createPost({ deps: { repo: postRepo, clock: clock(), beforeSaveHook: runtime.beforeSaveHook }, input: { workspaceId: WORKSPACE, id, title: "throw" } });

  await assert.rejects(save("t1"), PluginHookFailedError);
  await assert.rejects(save("t2"), { name: "PluginHookFailedError", message: /echo fixture refused this draft/ });
  assert.equal(await postRepo.findById({ workspaceId: WORKSPACE, id: "t1" }), null, "fail closed: nothing saved");

  const activation = await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "tier2-throw" });
  assert.equal(activation?.enabled, false);
  assert.equal(activation?.quarantineFailureCount, 2);
  assert.match(activation?.quarantineReason ?? "", /echo fixture refused this draft/);
  assert.equal(await runtime.previewPluginBeforeSave("tier2-throw", draft("x")), null, "quarantine detached it");
});

test("built-in tier-2: a looping filter is stopped by the timeout; previews fail without counting, saves quarantine", async () => {
  const { runtime, repo } = await enabledRuntime(builtInSource("tier2-loop", []), LOOP_TIMEOUT_MS);
  const timedOut = { name: "PluginHookFailedError", message: new RegExp(`plugin 'tier2-loop' tier-2 exceeded ${LOOP_TIMEOUT_MS}ms timeout`) };

  await assert.rejects(runtime.previewPluginBeforeSave("tier2-loop", draft("loop")), timedOut);
  await assert.rejects(runtime.beforeSaveHook(draft("loop")), timedOut);
  assert.equal((await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "tier2-loop" }))?.enabled, true, "the preview did not count");
  await assert.rejects(runtime.beforeSaveHook(draft("loop")), timedOut);

  const activation = await repo.getActivation({ workspaceId: WORKSPACE, pluginId: "tier2-loop" });
  assert.equal(activation?.enabled, false);
  assert.equal(activation?.quarantineFailureCount, 2);
});

test("site tier-2: loads from its integrity-checked snapshot and resolves @tovu/sdk inside the worker", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-tier2-site-"));
  try {
    const installDir = path.join(root, "plugins");
    const manifest = echoManifest("tier2-site");
    const versionDir = path.join(installDir, manifest.id, manifest.version);
    await mkdir(path.join(versionDir, "server"), { recursive: true });
    const source =
      `import { definePlugin } from "@tovu/sdk";\n` +
      `export default definePlugin({ setup(sdk) { sdk.addFilter("content.entry.beforeSave", (e) => ({ titleLength: e.title.length })); } });\n`;
    await writeFile(path.join(versionDir, "server", "index.mjs"), source);
    const integrity = { "server/index.mjs": `sha256-${createHash("sha256").update(source).digest("hex")}` };
    await writeFile(path.join(versionDir, "tovu.plugin.json"), JSON.stringify({ ...manifest, integrity }));

    const repo = new InMemoryPluginActivationRepo();
    const runtime = composePluginRuntime({
      workspaceId: WORKSPACE,
      clock: clock(),
      activationRepo: repo,
      sources: [],
      installDir,
      tier2CallRunner: createTier2WorkerRunner({}, { timeoutMs: SUCCESS_TIMEOUT_MS }),
    });
    await setPluginEnabled({
      deps: { clock: clock(), repo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
      input: { workspaceId: WORKSPACE, pluginId: manifest.id, enabled: true },
    });
    assert.deepEqual(await runtime.beforeSaveHook(draft("Site")), { "tier2-site": { titleLength: 4 } });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
