import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { jiniSourcePath, parseJiniSourceRef, resolveJiniPackageSrc } from "../lib/jini-source-root.js";

/** @file `@jini-ai/<pkg>/...` source refs resolve through the linked package, else the env fallback. */

function jiniTree(): { jini: string; repo: string } {
  const root = mkdtempSync(path.join(tmpdir(), "jini-source-root-"));
  const jini = path.join(root, "Jini", "packages");
  mkdirSync(path.join(jini, "cms", "src", "change-sets"), { recursive: true });
  writeFileSync(path.join(jini, "cms", "src", "change-sets", "agent-tools.ts"), "export {};\n");
  const repo = path.join(root, "Tovu");
  mkdirSync(path.join(repo, "node_modules", "@jini-ai"), { recursive: true });
  return { jini, repo };
}

test("parses only @jini-ai refs", () => {
  assert.deepEqual(parseJiniSourceRef({ ref: "@jini-ai/cms/change-sets/agent-tools.ts" }), { pkg: "cms", rest: "change-sets/agent-tools.ts" });
  assert.deepEqual(parseJiniSourceRef({ ref: "@jini-ai/cms" }), { pkg: "cms", rest: "" });
  assert.equal(parseJiniSourceRef({ ref: "apps/website/src/x.ts" }), null);
  assert.equal(parseJiniSourceRef({ ref: "../Jini/packages/cms/src/x.ts" }), null);
});

test("a linked package resolves through the symlink's real path to its src/", () => {
  const { jini, repo } = jiniTree();
  symlinkSync(path.join(jini, "cms"), path.join(repo, "node_modules", "@jini-ai", "cms"), "dir");
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "cms", env: {} }), path.join(jini, "cms", "src"));
  assert.equal(jiniSourcePath({ ref: "@jini-ai/cms/change-sets/agent-tools.ts", repoRoot: repo, env: {} }), path.join(jini, "cms", "src", "change-sets", "agent-tools.ts"));
});

test("an unlinked package falls back to JINI_PACKAGES_DIR, and is null with neither", () => {
  const { jini, repo } = jiniTree();
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "cms", env: {} }), null);
  assert.equal(jiniSourcePath({ ref: "@jini-ai/cms/x.ts", repoRoot: repo, env: {} }), null);
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "cms", env: { JINI_PACKAGES_DIR: jini } }), path.join(jini, "cms", "src"));
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "missing", env: { JINI_PACKAGES_DIR: jini } }), null);
});

test("a linked package without a src/ (a published install) defers to the env fallback", () => {
  const { jini, repo } = jiniTree();
  const published = path.join(path.dirname(jini), "published-cms");
  mkdirSync(published);
  symlinkSync(published, path.join(repo, "node_modules", "@jini-ai", "cms"), "dir");
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "cms", env: { JINI_PACKAGES_DIR: jini } }), path.join(jini, "cms", "src"));
  assert.equal(resolveJiniPackageSrc({ repoRoot: repo, pkg: "cms", env: {} }), null);
});
