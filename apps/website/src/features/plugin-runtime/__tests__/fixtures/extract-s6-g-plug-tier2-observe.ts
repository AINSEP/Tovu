/**
 * @file EXTRACT-S6 G-plug tier-2 observer: one REAL worker-backed tier-2 call that succeeds, one
 * runaway call stopped by the real timeout, and the before-save preview of each, recorded as plain
 * data. Uses the same composition (`composePluginRuntime` + `createTier2WorkerRunner`) and the same
 * echo fixture plugin as `server/runtime/plugin-tier2/__tests__/tier2-runtime.integration.test.ts`;
 * that file stays the behavioral proof, this one freezes the exact bytes.
 */
import path from "node:path";

import { HOOK_CONTENT_ENTRY_BEFORE_SAVE, type ContentEntryDraft } from "@tovu/sdk";

import { InMemoryPluginActivationRepo, setPluginEnabled, type PluginManifest } from "@jini-ai/plugins/host";
import { createPost, InMemoryPostRepo } from "#src/features/post/index";
import { composePluginRuntime, type PluginRuntimeSource } from "#src/server/runtime/composition/plugin-runtime";
import { createTier2WorkerRunner } from "#src/server/runtime/plugin-tier2/run-in-worker";

import { settle } from "./extract-s6-g-plug-observe.js";

const WORKSPACE = "ws-tier2";
const FIXTURE_ENTRY = path.join(import.meta.dirname, "..", "..", "..", "..", "server", "runtime", "plugin-tier2", "__tests__", "fixtures", "echo-plugin", "plugin.ts");
/** Same generous success budget as the existing real-worker test: a fresh tsx worker must not flake. */
export const SUCCESS_TIMEOUT_MS = 30_000;
/** Same runaway budget as the existing loop test. */
export const LOOP_TIMEOUT_MS = 6_000;
const clock = { nowMs: () => Date.parse("2026-10-04T12:00:00.000Z") };

function echoManifest(id: string): PluginManifest {
  return {
    id, name: "Tier 2 Echo", version: "1.0.0", sdkRange: "^0.1.0 || ^0.2.0", engine: 1, tier: "tier-2",
    capabilities: ["content.read", "content.extend", "hooks.attach"], hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE],
    fields: [{ path: `ext.${id}.titleLength`, type: "integer", queryable: false }, { path: `ext.${id}.seenSlug`, type: "string", queryable: false }],
    integrity: {},
  };
}

async function enabledRuntime(id: string, timeoutMs: number, importedInProcess: string[]) {
  const repo = new InMemoryPluginActivationRepo();
  const source: PluginRuntimeSource = {
    manifest: echoManifest(id), source: "built-in", entryPath: FIXTURE_ENTRY,
    importModule: async (entryPath) => { importedInProcess.push(entryPath); throw new Error("a tier-2 plugin must never be imported in-process"); },
  };
  const runtime = composePluginRuntime({ workspaceId: WORKSPACE, clock, activationRepo: repo, sources: [source], failureThreshold: 2, tier2CallRunner: createTier2WorkerRunner({}, { timeoutMs }) });
  const enabled = await settle(async () => setPluginEnabled({
    deps: { clock, repo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled },
    input: { workspaceId: WORKSPACE, pluginId: id, enabled: true },
  }));
  const row = async () => JSON.parse(JSON.stringify(await repo.getActivation({ workspaceId: WORKSPACE, pluginId: id }))) as unknown;
  return { runtime, enabled, row };
}

function draft(title: string): ContentEntryDraft {
  return { id: "preview", workspaceId: WORKSPACE, title, slug: "draft-slug", status: "draft", bodyJson: {}, ext: {} };
}

/** Item 4, success half: enable probe, a saved post's `ext`, and a preview that saves nothing. */
export async function observeTier2Success(): Promise<unknown> {
  const importedInProcess: string[] = [];
  const { runtime, enabled, row } = await enabledRuntime("tier2-echo", SUCCESS_TIMEOUT_MS, importedInProcess);
  const afterEnable = await row();
  const postRepo = new InMemoryPostRepo();
  const saved = await settle(() => createPost({ deps: { repo: postRepo, clock, beforeSaveHook: runtime.beforeSaveHook }, input: { workspaceId: WORKSPACE, id: "p1", title: "Hello" } }));
  const savedExt = (await postRepo.findById({ workspaceId: WORKSPACE, id: "p1" }))?.ext;
  const preview = await settle(() => runtime.previewPluginBeforeSave("tier2-echo", draft("Preview me")));
  return JSON.parse(JSON.stringify({
    enabled, afterEnable, savedOk: (saved as { value?: unknown }).value !== undefined, savedExt, preview,
    previewSavedPost: await postRepo.findById({ workspaceId: WORKSPACE, id: "preview" }),
    afterPreview: await row(), importedInProcess,
    pluginEvaluatedInThisThread: (globalThis as { __tier2EchoFixtureEvaluated?: boolean }).__tier2EchoFixtureEvaluated ?? false,
  })) as unknown;
}

/** Item 4, runaway half: the real timeout on preview (not counted) and on save (counted, quarantines). */
export async function observeTier2Timeout(): Promise<unknown> {
  const { runtime, enabled, row } = await enabledRuntime("tier2-loop", LOOP_TIMEOUT_MS, []);
  const afterEnable = await row();
  const preview = await settle(() => runtime.previewPluginBeforeSave("tier2-loop", draft("loop")));
  const afterPreview = await row();
  const firstSave = await settle(() => runtime.beforeSaveHook(draft("loop")));
  const afterFirstSave = await row();
  const secondSave = await settle(() => runtime.beforeSaveHook(draft("loop")));
  const afterSecondSave = await row();
  const previewAfterQuarantine = await settle(() => runtime.previewPluginBeforeSave("tier2-loop", draft("x")));
  return JSON.parse(JSON.stringify({ enabled, afterEnable, preview, afterPreview, firstSave, afterFirstSave, secondSave, afterSecondSave, previewAfterQuarantine })) as unknown;
}
