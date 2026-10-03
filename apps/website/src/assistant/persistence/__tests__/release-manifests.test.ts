/** PLAN C3: all three consumers adopt the storage release, and the chat override still selects it. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import semver from "semver";

const manifest = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("root/admin/site-chat select the same new chat release and preserve the UI override", () => {
  const root = manifest("package.json");
  for (const file of ["package.json", "apps/admin/package.json", "apps/site-chat/package.json"]) {
    const pkg = manifest(file);
    assert.equal(pkg.dependencies["@jini-ai/chat"], "^0.4.0");
    assert.equal(pkg.dependencies["@jini-ai/sqlite"], undefined);
    assert.equal(pkg.dependencies["@jini-ai/sqlite-chat"], undefined);
    if (file !== "package.json") assert.equal(pkg.overrides["@jini-ai/ui"], "$@jini-ai/ui");
  }
  const selectors = Object.keys(root.overrides).filter(key => key.startsWith("@jini-ai/chat@"));
  assert.deepEqual(selectors, ["@jini-ai/chat@^0.4.0"]);
  assert.equal(semver.satisfies("0.4.0", selectors[0]!.slice("@jini-ai/chat@".length)), true);
  assert.deepEqual(root.overrides[selectors[0]!], { "@jini-ai/ui": "$@jini-ai/ui" });
  assert.equal(root.dependencies["@jini-ai/db"], "^0.1.0");
  assert.equal(root.dependencies["@jini-ai/daemon"], "^0.4.0");
  assert.equal(root.dependencies["@jini-ai/registry"], "^0.4.0");
});
