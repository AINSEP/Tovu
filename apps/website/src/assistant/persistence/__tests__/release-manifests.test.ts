/** PLAN C3: all three consumers adopt the storage release, and the chat override still selects it. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import semver from "semver";

const manifest = (file: string) => JSON.parse(readFileSync(file, "utf8"));

test("root/admin/site-chat select the same new chat release and preserve the UI override", () => {
  const root = manifest("package.json");
  const release = semver.minVersion(root.dependencies["@jini-ai/chat"])!;
  assert.equal(semver.gte(release, "0.5.0"), true, "the common release must include storage adoption");
  for (const file of ["package.json", "apps/admin/package.json", "apps/site-chat/package.json"]) {
    const pkg = manifest(file);
    assert.equal(semver.satisfies(release, pkg.dependencies["@jini-ai/chat"]), true, `${file} must accept the common chat release`);
    assert.equal(pkg.dependencies["@jini-ai/sqlite"], undefined);
    assert.equal(pkg.dependencies["@jini-ai/sqlite-chat"], undefined);
    if (file !== "package.json") assert.equal(pkg.overrides["@jini-ai/ui"], "$@jini-ai/ui");
  }
  const selectors = Object.keys(root.overrides).filter(key => key.startsWith("@jini-ai/chat@"));
  assert.deepEqual(selectors, [`@jini-ai/chat@${root.dependencies["@jini-ai/chat"]}`]);
  assert.equal(semver.satisfies(release, selectors[0]!.slice("@jini-ai/chat@".length)), true);
  assert.deepEqual(root.overrides[selectors[0]!], { "@jini-ai/ui": "$@jini-ai/ui" });
  for (const [name, minimum] of [["db", "0.2.0"], ["daemon", "0.5.0"], ["registry", "0.5.0"]]) {
    assert.equal(semver.gte(semver.minVersion(root.dependencies[`@jini-ai/${name}`])!, minimum!), true, `${name} must retain the adoption release`);
  }
});
