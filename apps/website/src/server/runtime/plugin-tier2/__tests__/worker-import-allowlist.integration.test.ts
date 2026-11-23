import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
 * - `node:fs`, `child_process`, an npm package resolvable from the plugin's own `node_modules` and a
 *   `data:` module are refused by name, with a plain refusal message, before any of the plugin's own
 *   code runs -> the refusal tests (the fixture package is proven resolvable first, so a refusal is
 *   the policy, never a missing package).
 * - a relative path that climbs out of the plugin package is refused too (otherwise it is the same
 *   escape with more dots) -> the climb-out test.
 * - the plugin's own relative files still load -> the SDK test's `./helper.mjs`.
 * - the policy is SDK-only by default: the exact extra specifiers the host trusts for the registered
 *   content-analyzer entry are not open to any other plugin -> the trusted-specifier refusal test;
 *   content-analyzer itself still loads in a real worker with exactly those -> the built-in test.
 * - a malformed entry `file:` URL is a structured `stage: "import"` reply, not a crashed worker
 *   -> the malformed-URL test.
 * - every request carries the package root the host registered for THAT entry (an installed
 *   package's own root; content-analyzer's declared `sourceDir`), because Jini's worker refuses to
 *   guess one from the entry's location; a request without it is refused at import, never run
 *   without the policy -> the missing-root test.
 */

/** Generous: a fresh tsx worker on a loaded CI host must never flake the success path. */
const TIMEOUT_MS = 30_000;
const runner = createTier2WorkerRunner({}, { timeoutMs: TIMEOUT_MS });

const FIXTURE_DEPENDENCY = "tier2-fixture-dependency";

async function withPluginPackage(source: string, run: (entryUrl: string, packageRoot: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-tier2-allowlist-"));
  try {
    await mkdir(path.join(root, "server"), { recursive: true });
    await writeFile(path.join(root, "server", "helper.mjs"), `export const shout = (text) => text.toUpperCase();\n`);
    // A real dependency next to the plugin, so its refusal can only be the policy.
    const dependency = path.join(root, "node_modules", FIXTURE_DEPENDENCY);
    await mkdir(dependency, { recursive: true });
    await writeFile(path.join(dependency, "package.json"), JSON.stringify({ name: FIXTURE_DEPENDENCY, type: "module", exports: "./index.mjs" }));
    await writeFile(path.join(dependency, "index.mjs"), `export default "fixture";\n`);
    const entry = path.join(root, "server", "index.mjs");
    await writeFile(entry, source);
    assert.equal(createRequire(entry).resolve(FIXTURE_DEPENDENCY), path.join(dependency, "index.mjs"));
    await run(pathToFileURL(entry).href, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** `packageRoot` is the root the host registered for this entry; `undefined` only in the missing-root test. */
function probe(entryPath: string, packageRoot: string | undefined): Tier2Request {
  return {
    kind: "probe",
    plugin: { pluginId: "t2-allowlist", entryPath, ...(packageRoot === undefined ? {} : { packageRoot }), capabilities: ["hooks.attach"], hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] },
  };
}

const PLUGIN_BODY = `export default definePlugin({ setup(sdk) { sdk.addFilter("content.entry.beforeSave", (e) => ({ title: e.title })); } });\n`;

test("a site-layout tier-2 plugin still imports both SDK specifiers and its own relative files", async () => {
  await withPluginPackage(
    `import { definePlugin } from "@jini-ai/plugin-sdk";\n` +
      `import { definePlugin as legacyDefinePlugin } from "@tovu/sdk"; // legacy alias\n` +
      `import { shout } from "./helper.mjs";\n` +
      `if (definePlugin !== legacyDefinePlugin || shout("a") !== "A") throw new Error("imports diverged");\n` +
      PLUGIN_BODY,
    async (entryUrl, packageRoot) => {
      assert.deepEqual(await runner(probe(entryUrl, packageRoot)), { ok: true, kind: "probe", hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] });
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

for (const specifier of ["node:fs", "fs", "child_process", "node:child_process", FIXTURE_DEPENDENCY, "@jini-ai/cms/seo/content-analysis", "#src/platform/html/slug", "data:text/javascript,export default 1"]) {
  test(`a site-layout tier-2 plugin is refused when it imports "${specifier}"`, async () => {
    await withPluginPackage(
      `import { definePlugin } from "@tovu/sdk";\nimport * as other from ${JSON.stringify(specifier)};\n` +
        `globalThis.__tier2AllowlistLeak = other;\n` + PLUGIN_BODY,
      async (entryUrl, packageRoot) => assertRefused(await runner(probe(entryUrl, packageRoot)), specifier),
    );
  });
}

test("a dynamic import() of a refused specifier inside the plugin is refused as well", async () => {
  await withPluginPackage(
    `import { definePlugin } from "@tovu/sdk";\nawait import("node:" + "child_process");\n` + PLUGIN_BODY,
    async (entryUrl, packageRoot) => assertRefused(await runner(probe(entryUrl, packageRoot)), "node:child_process"),
  );
});

test("a relative path that climbs out of the plugin package is refused", async () => {
  const outside = await mkdtemp(path.join(tmpdir(), "tovu-tier2-outside-"));
  try {
    await writeFile(path.join(outside, "escape.mjs"), `export default "escaped";\n`);
    await withPluginPackage(
      `import { definePlugin } from "@tovu/sdk";\n` +
        `import escaped from ${JSON.stringify(`../../${path.basename(outside)}/escape.mjs`)};\nglobalThis.__tier2AllowlistLeak = escaped;\n` + PLUGIN_BODY,
      async (entryUrl, packageRoot) => {
        const reply = await runner(probe(entryUrl, packageRoot));
        assert.equal(reply.ok, false);
        if (!reply.ok) assert.match(reply.error, /outside its own package/);
      },
    );
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});

test("the built-in content-analyzer, which imports host packages, still loads in a real worker", async () => {
  const reply = await runner(probe(CONTENT_ANALYZER_RUNTIME_SOURCE.entryPath, CONTENT_ANALYZER_RUNTIME_SOURCE.sourceDir));
  assert.deepEqual(reply, { ok: true, kind: "probe", hooks: [HOOK_CONTENT_ENTRY_BEFORE_SAVE] });
});

test("the built-in content-analyzer's trusted specifiers are its own: a module in its sourceDir importing node:fs is refused", async () => {
  // A plugin entry placed directly inside content-analyzer's registered sourceDir, as a sibling of
  // its real entry: same package root, different entry, so it gets the SDK-only policy.
  const sibling = path.join(CONTENT_ANALYZER_RUNTIME_SOURCE.sourceDir, `tier2-allowlist-sibling-${process.pid}.mjs`);
  await writeFile(sibling, `import { definePlugin } from "@tovu/sdk";\nimport * as fs from "node:fs";\nglobalThis.__tier2AllowlistLeak = fs;\n` + PLUGIN_BODY);
  try {
    assertRefused(await runner(probe(pathToFileURL(sibling).href, CONTENT_ANALYZER_RUNTIME_SOURCE.sourceDir)), "node:fs");
  } finally {
    await rm(sibling, { force: true });
  }
});

test("a request without a registered package root is refused at import, never run without the policy", async () => {
  await withPluginPackage(`import { definePlugin } from "@tovu/sdk";\n` + PLUGIN_BODY, async (entryUrl) => {
    const reply = await runner(probe(entryUrl, undefined));
    assert.equal(reply.ok, false);
    if (!reply.ok) {
      assert.equal(reply.stage, "import");
      assert.match(reply.error, /has no registered package root/);
    }
  });
});

test("a malformed entry file URL is a structured import-stage reply, not a crashed worker", async () => {
  const reply = await runner(probe("file:///plugins/%2Fbad/server/index.mjs", "/plugins"));
  assert.equal(reply.ok, false);
  if (!reply.ok) assert.equal(reply.stage, "import");
});
