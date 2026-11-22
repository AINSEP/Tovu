import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { HOOK_CONTENT_ENTRY_BEFORE_SAVE } from "@tovu/sdk";

import type { Tier2Reply, Tier2Request } from "@jini-ai/plugins/host/worker";
import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { createTier2WorkerRunner } from "../run-in-worker.js";

/**
 * @file C043: a Tier-2 plugin that is not compiled into Tovu may import, by name, only the plugin
 * SDK. Real workers, one per call, each loading a plugin package written to a temp directory in
 * the site-install layout (`<package>/server/index.mjs`).
 *
 * Requirement-to-test map:
 * - both SDK specifiers still resolve and the plugin runs -> the SDK test.
 * - `node:fs`, `child_process`, an installed npm package and a `data:` module are refused by name,
 *   with a plain refusal message, before any of the plugin's own code runs -> the refusal tests.
 * - a relative path that climbs out of the plugin package is refused too (otherwise it is the same
 *   escape with more dots) -> the climb-out test.
 * - the plugin's own relative files still load -> the SDK test's `./helper.mjs`.
 * - a built-in compiled into Tovu (content-analyzer imports `@jini-ai/cms` and `#src/…`) is not
 *   under the allowlist and still loads in a real worker -> the built-in test.
 */

/** Generous: a fresh tsx worker on a loaded CI host must never flake the success path. */
const TIMEOUT_MS = 30_000;
const runner = createTier2WorkerRunner({}, { timeoutMs: TIMEOUT_MS });

async function withPluginPackage(source: string, run: (entryUrl: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-tier2-allowlist-"));
  try {
    await mkdir(path.join(root, "server"), { recursive: true });
    await writeFile(path.join(root, "server", "helper.mjs"), `export const shout = (text) => text.toUpperCase();\n`);
    const entry = path.join(root, "server", "index.mjs");
    await writeFile(entry, source);
    await run(pathToFileURL(entry).href);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function probe(entryPath: string): Tier2Request {
  return { kind: "probe", plugin: { pluginId: "t2-allowlist", entryPath, capabilities: ["hooks.attach"], hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] } };
}

const PLUGIN_BODY = `export default definePlugin({ setup(sdk) { sdk.addFilter("content.entry.beforeSave", (e) => ({ title: e.title })); } });\n`;

test("a site-layout tier-2 plugin still imports both SDK specifiers and its own relative files", async () => {
  await withPluginPackage(
    `import { definePlugin } from "@jini-ai/plugin-sdk";\n` +
      `import { definePlugin as legacyDefinePlugin } from "@tovu/sdk"; // legacy alias\n` +
      `import { shout } from "./helper.mjs";\n` +
      `if (definePlugin !== legacyDefinePlugin || shout("a") !== "A") throw new Error("imports diverged");\n` +
      PLUGIN_BODY,
    async (entryUrl) => {
      assert.deepEqual(await runner(probe(entryUrl)), { ok: true, kind: "probe", hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] });
    },
  );
});

function assertRefused(reply: Tier2Reply, specifier: string): void {
  assert.equal(reply.ok, false, `${specifier} must be refused`);
  if (reply.ok) return;
  assert.equal(reply.stage, "import");
  assert.match(reply.error, new RegExp(`may not import "${specifier.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`));
  assert.match(reply.error, /only the plugin SDK/);
}

for (const specifier of ["node:fs", "fs", "child_process", "node:child_process", "zod", "data:text/javascript,export default 1"]) {
  test(`a site-layout tier-2 plugin is refused when it imports "${specifier}"`, async () => {
    await withPluginPackage(
      `import { definePlugin } from "@tovu/sdk";\nimport * as other from ${JSON.stringify(specifier)};\n` +
        `globalThis.__tier2AllowlistLeak = other;\n` + PLUGIN_BODY,
      async (entryUrl) => assertRefused(await runner(probe(entryUrl)), specifier),
    );
  });
}

test("a dynamic import() of a refused specifier inside the plugin is refused as well", async () => {
  await withPluginPackage(
    `import { definePlugin } from "@tovu/sdk";\nawait import("node:" + "child_process");\n` + PLUGIN_BODY,
    async (entryUrl) => assertRefused(await runner(probe(entryUrl)), "node:child_process"),
  );
});

test("a relative path that climbs out of the plugin package is refused", async () => {
  const outside = await mkdtemp(path.join(tmpdir(), "tovu-tier2-outside-"));
  try {
    await writeFile(path.join(outside, "escape.mjs"), `export default "escaped";\n`);
    await withPluginPackage(
      `import { definePlugin } from "@tovu/sdk";\n` +
        `import escaped from ${JSON.stringify(`../../${path.basename(outside)}/escape.mjs`)};\nglobalThis.__tier2AllowlistLeak = escaped;\n` + PLUGIN_BODY,
      async (entryUrl) => {
        const reply = await runner(probe(entryUrl));
        assert.equal(reply.ok, false);
        if (!reply.ok) assert.match(reply.error, /outside its own package/);
      },
    );
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("the built-in content-analyzer, which imports host packages, still loads in a real worker", async () => {
  const reply = await runner(probe(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath));
  assert.deepEqual(reply, { ok: true, kind: "probe", hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] });
});
