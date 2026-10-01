import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
import ts from "typescript";

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

  const originalSetup = definition.setup;
  const plugin = sdk.definePlugin(definition);
  assert.equal(definition.setup, originalSetup);
  assert.equal(plugin.definition.setup, originalSetup);

  assert.equal(plugin.definition, definition, "definePlugin must not clone, wrap, or mutate the definition");
  assert.equal(setupCalls, 0, "definePlugin itself must never invoke setup() — that is loadPlugin's job (BR-01 step 4)");
});

test("REQ-08/C-001: definePlugin performs no filesystem writes or fetches and throws nothing", (t) => {
  const writes = [
    t.mock.method(fs, "writeFileSync", () => {}),
    t.mock.method(fs, "writeFile", () => {}),
    t.mock.method(fs.promises, "writeFile", async () => {}),
    t.mock.method(globalThis, "fetch", async () => new Response()),
  ];
  syncBuiltinESMExports();
  try {
    assert.doesNotThrow(() => sdk.definePlugin({ setup() {} }));
    for (const write of writes) assert.equal(write.mock.callCount(), 0);
  } finally {
    for (const write of writes) write.mock.restore();
    syncBuiltinESMExports();
  }
});

test("ADR-024 §3 / REQ-05: BeforeSaveFilter may be sync or async — both are valid at the type level", () => {
  // The compiler API checks this consumer; tsx alone does not check types.
  const fixture = path.resolve(import.meta.dirname, "before-save-consumer.ts");
  const source = `import type { BeforeSaveFilter } from "../../index.js";
    const syncFilter: BeforeSaveFilter = () => ({ count: 1 });
    const asyncFilter: BeforeSaveFilter = async () => ({ count: 1 });`;
  const options: ts.CompilerOptions = {
    strict: true, noEmit: true, types: [], skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (file) => file === fixture ? source : readFile(file);
  host.fileExists = (file) => file === fixture || fileExists(file);
  const program = ts.createProgram([fixture], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  const syncFilter: sdk.BeforeSaveFilter = (_entry, _ctx) => ({ count: 1 });
  const asyncFilter: sdk.BeforeSaveFilter = async (_entry, _ctx) => ({ count: 1 });
  assert.equal(typeof syncFilter, "function");
  assert.equal(typeof asyncFilter, "function");
});

test("REQ-08/ADR-005 rule 1: @tovu/sdk exports nothing from @tovu/core — no import of '@tovu/core' or a relative reach into ../../../../src anywhere in the package's own source", async () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const files = fs.readdirSync(root, { recursive: true }).map(String)
    .filter((file) => file.endsWith(".ts") && !file.split(path.sep).includes("__tests__"));
  assert.ok(files.includes("index.ts"));
  for (const file of files) {
    const fullPath = path.join(root, file);
    const tree = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, "utf8"), ts.ScriptTarget.Latest, true);
    const check = (node: ts.Node): void => {
      let specifier: ts.Node | undefined;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier = node.arguments[0];
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const name = specifier.text;
        assert.ok(!name.startsWith("@tovu/core"), `${file}: forbidden import ${name}`);
        if (name.startsWith(".")) {
          const target = path.resolve(path.dirname(fullPath), name);
          assert.ok(target.startsWith(root + path.sep), `${file}: import escapes SDK: ${name}`);
        }
      }
      ts.forEachChild(node, check);
    };
    check(tree);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "../package.json"), "utf8"));
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    assert.ok(!Object.keys(pkg[field] ?? {}).some((name) => name.startsWith("@tovu/core")));
  }
});

test("REQ-08/AC-10: package.json's exports map blocks deep imports into anything but the package root", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const pkgPath = path.join(__dirname, "../../../package.json");
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as { exports?: Record<string, Record<string, string>> };

  assert.ok(pkg.exports, "@tovu/sdk's package.json must declare an exports map (ADR-005 rule 1)");
  assert.deepEqual(
    Object.keys(pkg.exports!),
    ["."],
    "the exports map must expose exactly the package root ('.') — any additional subpath entry " +
      "(e.g. './internal') would reopen the deep-import back door ADR-005 rule 1 closes"
  );
});


test("the package root export targets exist and @tovu/sdk is importable", async () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.deepEqual(pkg.exports["."], { types: "./dist/index.d.ts", default: "./dist/index.js" });
  for (const target of Object.values(pkg.exports["."]) as string[]) {
    assert.ok(fs.statSync(path.join(root, target)).isFile(), `missing target ${target}`);
  }
  const publicSdk = await import("@tovu/sdk");
  assert.deepEqual(Object.keys(publicSdk).sort(), EXPECTED_RUNTIME_EXPORTS);
  const definition = { setup() {} };
  assert.equal(publicSdk.definePlugin(definition).definition, definition);
});
