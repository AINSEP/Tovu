import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { definePlugin, HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import type { Tier2Request } from "@jini-ai/plugins/host/worker";
import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { PLUGIN_SDK_SPECIFIERS } from "@jini-ai/plugins/host";
import { importPluginModule, main, startIfWorker, TIER2_IMPORT_POLICY } from "../worker.js";

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
 * - the C043 import policy is SDK-only, plus exactly the specifiers the registered content-analyzer
 *   entry needs -> the policy test (the refusals run in real workers in
 *   `worker-import-allowlist.integration.test.ts`).
 * - the policy is set up on the real-import path: an injected importer touches no entry path on disk,
 *   and a malformed entry URL is a structured `stage: "import"` reply -> the two set-up tests.
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

test("main() without an importer resolves both SDK specifiers to the same module outside the repo and runs its filter", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-tier2-worker-"));
  try {
    const entry = path.join(dir, "index.mjs");
    await writeFile(
      entry,
      `import { definePlugin } from "@jini-ai/plugin-sdk";\n` +
        `import { definePlugin as legacyDefinePlugin } from "@tovu/sdk"; // legacy alias\n` +
        `if (definePlugin !== legacyDefinePlugin) throw new Error("SDK aliases diverged");\n` +
        `export default definePlugin({ setup(sdk) { sdk.addFilter("content.entry.beforeSave", (e) => ({ title: e.title })); } });\n`,
    );
    const { posted, parentPort } = port();
    const request: Tier2Request = {
      kind: "beforeSave",
      // The installed-package layout: the registered root is the folder the entry sits in.
      plugin: { ...plugin, entryPath: pathToFileURL(entry).href, packageRoot: dir },
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

for (const imported of [null, "a string module"] as const) {
  test(`main() treats an imported module that is ${imported === null ? "null" : "not an object"} as having no default export, and posts runTier2Call's refusal for it`, async () => {
    const withObject = port();
    const request: Tier2Request = { kind: "probe", plugin: { ...plugin, entryPath: "/x.js" } };
    await main({ workerData: request, parentPort: withObject.parentPort }, { importModule: async () => ({}) });
    const { posted, parentPort } = port();
    await main({ workerData: request, parentPort }, { importModule: async () => imported });
    // Same reply as a module object with no `default`: a non-object import never reaches `.default`.
    assert.equal(posted.length, 1);
    assert.deepEqual(posted, withObject.posted);
    assert.equal((posted[0] as { ok: boolean }).ok, false);
  });
}

test("the C043 import policy is SDK-only, plus exactly the two specifiers content-analyzer's entry imports", () => {
  assert.deepEqual(TIER2_IMPORT_POLICY, {
    sdkSpecifiers: PLUGIN_SDK_SPECIFIERS,
    trustedImports: [{ entryPath: CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath, specifiers: ["@jini-ai/cms/seo/content-analysis", "@jini-ai/cms/html/site/slug"] }],
  });
});

test("main() with an injected importer does no filesystem set-up for the entry path", async () => {
  const { posted, parentPort } = port();
  // Under a regular file, so any real-path lookup of this entry fails with ENOTDIR.
  const entryPath = path.join(import.meta.filename, "server", "index.mjs");
  const imported: string[] = [];
  await main(
    { workerData: { kind: "probe", plugin: { ...plugin, entryPath } } satisfies Tier2Request, parentPort },
    { importModule: async (modulePath) => { imported.push(modulePath); return { default: definePlugin({ setup: () => undefined }) }; } },
  );
  assert.deepEqual(imported, [entryPath]);
  assert.deepEqual(posted, [{ ok: true, kind: "probe", hooks: [] }]);
});

test("main() without an importer answers a malformed entry file URL with an import-stage reply", async () => {
  const { posted, parentPort } = port();
  await main({ workerData: { kind: "probe", plugin: { ...plugin, entryPath: "file:///plugins/%2Fbad/server/index.mjs" } } satisfies Tier2Request, parentPort });
  assert.equal(posted.length, 1);
  assert.deepEqual({ ...(posted[0] as object), error: undefined }, { ok: false, stage: "import", error: undefined });
});
