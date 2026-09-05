import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { resolveDefaultSdkModulePath } from "../plugin-sdk-resolver.js";

/**
 * @file `resolveDefaultSdkModulePath()` — the true default path every real boot call site
 * (`index.ts`, `serve.ts`, `export.ts`) relies on when `registerPluginSdkResolver()` is called
 * with no `sdkModulePath` override.
 *
 * Every OTHER test touching this module (the integration suite in `__tests__/integration/`)
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
