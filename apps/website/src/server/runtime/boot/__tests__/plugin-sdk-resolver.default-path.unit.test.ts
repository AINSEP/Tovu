import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { registerPluginSdkResolver, resolveDefaultSdkModulePath } from "../plugin-sdk-resolver.js";

/**
 * @file Every real boot call site (`index.ts`, `serve.ts`, `export.ts`) calls
 * `registerPluginSdkResolver()` with NO options. Its own file (one process) because the hook is a
 * once-per-process registration: a plugin outside the runtime's `node_modules` tree must receive the
 * bundled SDK module that `resolveDefaultSdkModulePath()` names.
 */
test("registerPluginSdkResolver() with no options redirects a plugin's SDK import to the bundled default SDK", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-sdk-default-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = path.join(root, "plugin.mjs");
  await writeFile(entry, 'export * as sdk from "@tovu/sdk";'); // legacy alias
  registerPluginSdkResolver();
  const plugin = await import(pathToFileURL(entry).href);
  const bundled = await import(pathToFileURL(resolveDefaultSdkModulePath()).href);
  assert.equal(typeof bundled.definePlugin, "function");
  assert.equal(plugin.sdk.definePlugin, bundled.definePlugin);
});

test("a second registration in the same process is refused as a boot-sequencing bug", async () => {
  const { PluginSdkResolverAlreadyRegisteredError } = await import("../plugin-sdk-resolver.js");
  assert.throws(() => registerPluginSdkResolver(), (error: unknown) => error instanceof PluginSdkResolverAlreadyRegisteredError
    && (error as Error).name === "PluginSdkResolverAlreadyRegisteredError");
});
