import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import type { Tier2Request } from "@jini-ai/plugins/host/worker";
import { importPluginModule, main, startIfWorker } from "../worker.js";

/**
 * @file The Tier-2 worker entry's `main()`, run in-process (the real-worker path is the
 * composition integration test, whose worker coverage is suppressed by design).
 *
 * Requirement-to-test map:
 * - refuses to run without a parent port -> the guard test.
 * - posts exactly runTier2Call's reply -> the injected-importer test.
 * - with no injected importer, registers the `@tovu/sdk` resolver BEFORE importing, so a plugin
 *   outside every node_modules tree still resolves the runtime's SDK (CIC U-002, per worker)
 *   -> the real-import test.
 */

const plugin = { pluginId: "t2", capabilities: ["hooks.attach"] as const, hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] };

function port() {
  const posted: unknown[] = [];
  return { posted, parentPort: { postMessage: (message: unknown) => { posted.push(message); } } };
}

test("main() refuses to run outside a worker", async () => {
  await assert.rejects(main({ workerData: {}, parentPort: null }), {
    message: "the tier-2 plugin worker must run inside a worker_threads Worker",
  });
});

test("startIfWorker() does nothing on the main thread and runs main() inside a worker", async () => {
  assert.equal(startIfWorker({ isMainThread: true, workerData: {}, parentPort: null }), undefined);
  await assert.rejects(startIfWorker({ isMainThread: false, workerData: {}, parentPort: null })!, {
    message: "the tier-2 plugin worker must run inside a worker_threads Worker",
  });
});

test("main() posts the call's reply using the injected importer", async () => {
  const { posted, parentPort } = port();
  const request: Tier2Request = { kind: "probe", plugin: { ...plugin, entryPath: "/x.js" } };
  await main(
    { workerData: request, parentPort },
    { importModule: async () => ({ default: definePlugin({ setup: (sdk) => sdk.addFilter(HOOK_CONTENT_ENTRY_BEFORE_SAVE, () => ({})) }) }) },
  );
  assert.deepEqual(posted, [{ ok: true, kind: "probe", hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] }]);
});

test("main() without an importer resolves @tovu/sdk for a plugin outside the repo and runs its filter", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-tier2-worker-"));
  try {
    const entry = path.join(dir, "index.mjs");
    await writeFile(
      entry,
      `import { definePlugin } from "@tovu/sdk";\n` +
        `export default definePlugin({ setup(sdk) { sdk.addFilter("content.entry.beforeSave", (e) => ({ title: e.title })); } });\n`,
    );
    const { posted, parentPort } = port();
    const request: Tier2Request = {
      kind: "beforeSave",
      plugin: { ...plugin, entryPath: pathToFileURL(entry).href },
      entry: { id: "e", workspaceId: "ws", title: "Hi", slug: "hi", status: "draft", bodyJson: {}, ext: {} } as import("@tovu/sdk").ContentEntryDraft,
      ctx: { pluginId: "t2", workspaceId: "ws" },
    };
    await main({ workerData: request, parentPort });
    assert.deepEqual(posted, [{ ok: true, kind: "beforeSave", patch: { title: "Hi" } }]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("under tsx, importPluginModule unwraps a default export that carries __esModule (dev-only CJS interop)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-tier2-interop-"));
  try {
    const entry = path.join(dir, "index.mjs");
    await writeFile(entry, `export default { __esModule: true, default: "inner" };\n`);
    const imported = (await importPluginModule(pathToFileURL(entry).href)) as { default?: unknown };
    assert.equal(imported.default, "inner");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
