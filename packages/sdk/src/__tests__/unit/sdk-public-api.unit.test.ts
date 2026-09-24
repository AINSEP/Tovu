import assert from "node:assert/strict";
import test from "node:test";

import * as sdk from "../../index";

/**
 * @file C-001…C-004 `@tovu/sdk` public-API snapshot test — SPEC-005 REQ-08/AC-10, ADR-005 rule 4.
 *
 * "A public-API snapshot test pins the SDK surface (types + runtime exports); changing it fails
 * CI unless acknowledged" (REQ-08). This test is deliberately a flat, explicit inventory rather
 * than a generic `toMatchSnapshot()` — this codebase's test runner (`node:test`) has no built-in
 * snapshot facility, and an explicit list is itself the acknowledgement mechanism ADR-005 rule 4
 * asks for: adding/removing/renaming an export requires editing this file, which is a visible,
 * reviewable diff.
 *
 * TDD-certified against the stub in `../../index.ts`; currently RED — `definePlugin` throws "not
 * implemented". These assertions describe the contract the Programmer stage must satisfy.
 */

const EXPECTED_RUNTIME_EXPORTS = [
  "definePlugin",
  "CONTENT_READ",
  "CONTENT_EXTEND",
  "HOOKS_ATTACH",
  "HOOK_CONTENT_ENTRY_BEFORE_SAVE",
  "HOOK_POINTS",
].sort();

test("REQ-08/AC-10: @tovu/sdk's runtime export surface is exactly the certified set — no more, no less", () => {
  const actual = Object.keys(sdk).sort();
  assert.deepEqual(
    actual,
    EXPECTED_RUNTIME_EXPORTS,
    "adding, removing, or renaming a runtime export changes the ecosystem compatibility surface " +
      "(ADR-005) and must be a deliberate, acknowledged edit to this test, not an incidental diff"
  );
});

test("REQ-04: the three v1 capability tokens are the exact, pinned literal strings", () => {
  assert.equal(sdk.CONTENT_READ, "content.read");
  assert.equal(sdk.CONTENT_EXTEND, "content.extend");
  assert.equal(sdk.HOOKS_ATTACH, "hooks.attach");
});

test("REQ-05: the hook-point constant is the exact, pinned literal string", () => {
  assert.equal(sdk.HOOK_CONTENT_ENTRY_BEFORE_SAVE, "content.entry.beforeSave");
});

test("hooks v2 §3.1: HOOK_POINTS has exactly one entry, content.entry.beforeSave, kind filter, capability hooks.attach, since 0.1.0", () => {
  assert.deepEqual(sdk.HOOK_POINTS, [
    {
      name: "content.entry.beforeSave",
      kind: "filter",
      capability: "hooks.attach",
      since: "0.1.0",
      description: "Runs before a content entry is saved; may write into the plugin's own ext.{pluginId} namespace.",
    },
  ]);
});

test("REQ-08/C-001: definePlugin is a function export", () => {
  assert.equal(typeof sdk.definePlugin, "function");
});

test("REQ-08/C-001: definePlugin(def) returns the same definition, typed as Plugin (pure identity, no I/O)", () => {
  let setupCalls = 0;
  const definition: sdk.PluginDefinition = {
    setup() {
      setupCalls += 1;
    },
  };

  const plugin = sdk.definePlugin(definition);

  assert.equal(plugin.definition, definition, "definePlugin must not clone, wrap, or mutate the definition");
  assert.equal(setupCalls, 0, "definePlugin itself must never invoke setup() — that is loadPlugin's job (BR-01 step 4)");
});

test("REQ-08/C-001: definePlugin performs no I/O and throws nothing for a well-formed definition", () => {
  assert.doesNotThrow(() => sdk.definePlugin({ setup() {} }));
});

test("ADR-024 §3 / REQ-05: BeforeSaveFilter may be sync or async — both are valid at the type level", () => {
  // Type-level assertion exercised via the snapshot test's compile step (tsx transpiles this
  // file; a type error here would fail the whole suite at import time, which is deliberate).
  const syncFilter: sdk.BeforeSaveFilter = (_entry, _ctx) => ({ count: 1 });
  const asyncFilter: sdk.BeforeSaveFilter = async (_entry, _ctx) => ({ count: 1 });
  assert.equal(typeof syncFilter, "function");
  assert.equal(typeof asyncFilter, "function");
});

test("REQ-08/ADR-005 rule 1: @tovu/sdk exports nothing from @tovu/core — no import of '@tovu/core' or a relative reach into ../../../../src anywhere in the package's own source", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const indexPath = path.join(__dirname, "../../index.ts");
  const source = await fs.readFile(indexPath, "utf8");

  assert.doesNotMatch(
    source,
    /@tovu\/core/,
    "packages/sdk must never import from @tovu/core — plugin authors only ever see this file's exports"
  );
  assert.doesNotMatch(
    source,
    /from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/src/,
    "packages/sdk must have zero dependency on src/ (Module Map: 'consumed by plugin code, not by core')"
  );
});

test("REQ-08/AC-10: package.json's exports map blocks deep imports into anything but the package root", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const pkgPath = path.join(__dirname, "../../../package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as { exports?: Record<string, unknown> };

  assert.ok(pkg.exports, "@tovu/sdk's package.json must declare an exports map (ADR-005 rule 1)");
  assert.deepEqual(
    Object.keys(pkg.exports!),
    ["."],
    "the exports map must expose exactly the package root ('.') — any additional subpath entry " +
      "(e.g. './internal') would reopen the deep-import back door ADR-005 rule 1 closes"
  );
});
