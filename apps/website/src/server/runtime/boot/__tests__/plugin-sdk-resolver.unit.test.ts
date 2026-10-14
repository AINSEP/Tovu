import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { registerPluginSdkResolver, resolveDefaultSdkModulePath } from "../plugin-sdk-resolver.js";

/**
 * @file `resolveDefaultSdkModulePath()` — the true default path every real boot call site
 * (`index.ts`, `serve.ts`, `export.ts`) relies on when `registerPluginSdkResolver()` is called
 * with no `sdkModulePath` override.
 *
 * The resolution-hook tests (including the integration suite in `__tests__/integration/`)
 * supplies a fixture `sdkModulePath` override, so none of them ever exercise this function's real
 * return value — that's exactly how the previous relative-path arithmetic (`"../../../..."`,
 * wrong by a different amount under `tsx` vs. compiled `dist/`) went unnoticed through two
 * unrelated directory renames. This file closes that gap by asserting on the function's return
 * value directly, with no `module.register()`/dynamic-`import()` machinery involved.
 */

test("resolveDefaultSdkModulePath(): returns the real, on-disk @tovu/sdk build location — the same location Node's own package resolution reaches, not a hand-computed relative guess", () => {
  const defaultPath = resolveDefaultSdkModulePath();

  // Ground truth: how Node itself resolves the "@tovu/sdk" bare specifier via the real
  // npm-workspace `node_modules/@tovu/sdk` symlink — independent of this file's own directory
  // depth, so it can't drift the way `path.join(import.meta.dirname, "../../../...")` did.
  const expectedPath = createRequire(import.meta.url).resolve("@tovu/sdk");

  assert.equal(
    defaultPath,
    expectedPath,
    "resolveDefaultSdkModulePath() must return the exact location real Node module resolution gives for the bare specifier \"@tovu/sdk\", not a directory-depth guess relative to this file's own location"
  );
  assert.equal(existsSync(defaultPath), true, `resolveDefaultSdkModulePath() returned a path that does not exist on disk: ${defaultPath}`);
});

test("both exact SDK specifiers resolve to the same host module despite plugin-local shadow packages", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "plugin-sdk-alias-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sdkModulePath = path.join(root, "host-sdk.mjs");
  await writeFile(sdkModulePath, 'export const marker = "HOST";');
  for (const specifier of ["@jini-ai/plugin-sdk", "@tovu/sdk"]) { // legacy alias
    const shadow = path.join(root, "node_modules", specifier);
    await mkdir(shadow, { recursive: true });
    await writeFile(path.join(shadow, "package.json"), JSON.stringify({ type: "module", exports: { ".": "./index.mjs" } }));
    await writeFile(path.join(shadow, "index.mjs"), 'export const marker = "SHADOW";');
  }
  const entry = path.join(root, "plugin.mjs");
  await writeFile(entry, `
    import * as canonical from "@jini-ai/plugin-sdk";
    import * as legacy from "@tovu/sdk"; // legacy alias
    export { canonical, legacy };
    export { sep } from "node:path";
    export const deepImport = (specifier) => import(specifier);
  `);
  registerPluginSdkResolver({ sdkModulePath });
  const imported = await import(pathToFileURL(entry).href);
  assert.equal(imported.canonical.marker, "HOST");
  assert.equal(imported.canonical, imported.legacy);
  assert.equal(imported.sep, path.sep);
  for (const specifier of ["@jini-ai/plugin-sdk/private", "@tovu/sdk/private"]) { // legacy alias
    await assert.rejects(imported.deepImport(specifier), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
});
