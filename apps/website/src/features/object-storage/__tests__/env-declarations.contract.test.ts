import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { parseObjectStoresFile, readBundledObjectStoreEnvDeclarations } from "../registry.js";

const env = { selector: "example", settings: { bucket: "EXAMPLE_BUCKET" }, credentialFields: {}, secret: "EXAMPLE_SECRET", required: ["EXAMPLE_BUCKET", "EXAMPLE_SECRET"] };
const entry = { id: "example-store", module: "provider.mjs", env };
function sources(t: TestContext, entries: unknown[][]): string {
  const sourceRoot = mkdtempSync(path.join(tmpdir(), "env-declarations-"));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  for (const [index, providers] of entries.entries()) {
    const dir = path.join(sourceRoot, `example-${index}`); mkdirSync(dir);
    writeFileSync(path.join(dir, "plugin.json"), "{}");
    writeFileSync(path.join(dir, "tovu-object-stores.json"), JSON.stringify({ schemaVersion: 1, providers }));
    writeFileSync(path.join(dir, "provider.mjs"), 'throw new Error("data discovery must not execute");');
  }
  return sourceRoot;
}

test("sync env discovery returns optional mapping data without provider execution", t => {
  const sourceRoot = sources(t, [[entry, { id: "example-no-env", label: "Example", module: "unused.mjs" }]]);
  assert.deepEqual(readBundledObjectStoreEnvDeclarations({ sourceRoot }), [{ providerId: "example-store", ...env }]);
});
test("duplicate selectors across packages are refused rather than order-dependent", t => {
  const sourceRoot = sources(t, [[entry], [{ ...entry, id: "example-other" }]]);
  assert.throws(() => readBundledObjectStoreEnvDeclarations({ sourceRoot }), { message: "Object store env selector 'example' is declared twice." });
});
test("malformed mapping fields never reach media selection", t => {
  for (const invalid of [null, [], {}, { ...env, selector: "local" }, { ...env, selector: "BAD" }, { ...env, selector: 7 }, { ...env, settings: [] }, { ...env, settings: { bucket: "bad" } }, { ...env, credentialFields: null }, { ...env, secret: 7 }, { ...env, secret: "bad" }, { ...env, required: "EXAMPLE_BUCKET" }, { ...env, required: [] }, { ...env, required: [7] }]) {
    const raw = JSON.stringify({ schemaVersion: 1, providers: [{ ...entry, env: invalid }] });
    assert.equal(parseObjectStoresFile({ raw }).ok, false, JSON.stringify(invalid));
  }
  const sourceRoot = sources(t, [[{ ...entry, env: null }]]);
  assert.throws(() => readBundledObjectStoreEnvDeclarations({ sourceRoot }), /Object store env declarations.*were not loaded/);
});
test("unreadable declarations are synchronous errors", t => {
  const sourceRoot = sources(t, [[entry]]);
  const file = path.join(sourceRoot, "example-0", "tovu-object-stores.json");
  rmSync(file); mkdirSync(file);
  assert.throws(() => readBundledObjectStoreEnvDeclarations({ sourceRoot }));
});
