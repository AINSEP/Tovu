import assert from "node:assert/strict";
import test from "node:test";

import { checkTreePath, resolveTreeRelativePath } from "../file-tree-policy.js";

/**
 * @file Regex/boundary tables for `file-tree-policy.ts` (Stryker lane L14: 28 survivors at the id
 * segment pattern L76, the segment length guard L96 and the MCP-config name L117, AP4). A tree's id
 * segments become a directory under themes/skills/plugins on the destination, so every separator
 * rule and the 64-char bound is pinned; every secret-bearing file name is shown to be refused at any
 * depth.
 */

test("resolveTreeRelativePath: id segments are lowercase alnum joined by single '-' or '.', 1..64 chars, anchored", () => {
  const ok = (seg: string) => resolveTreeRelativePath("theme-files", ["static", seg]);
  const cases: Array<[string, boolean]> = [
    ["a", true], ["basic", true], ["a-b", true], ["a.b", true], ["a1-b2.c3", true], ["a".repeat(64), true],
    ["a".repeat(65), false], ["", false], ["-a", false], ["a-", false], [".a", false], ["a.", false], ["a--b", false], ["a..b", false],
    ["a_b", false], ["A", false], ["a/b", false], ["..", false], ["a\n", false], [" a", false], ["a b", false],
  ];
  for (const [seg, valid] of cases) assert.equal(ok(seg), valid ? `themes/static/${seg}` : null, JSON.stringify(seg));
});

test("resolveTreeRelativePath: each kind has its fixed base dir and exactly two segments", () => {
  assert.equal(resolveTreeRelativePath("agent-skill", ["tier", "skill"]), "skills/tier/skill");
  assert.equal(resolveTreeRelativePath("agent-plugin", ["tier", "p"]), "agent-plugins/tier/p");
  assert.equal(resolveTreeRelativePath("site-plugin", ["tier", "p"]), "plugins/tier/p");
  assert.equal(resolveTreeRelativePath("theme-files", ["only-one"]), null);
  assert.equal(resolveTreeRelativePath("theme-files", ["a", "b", "c"]), null);
});

test("checkTreePath: secret-bearing names are refused at the root AND nested", () => {
  const names = [".mcp.local.json", ".mcp..json", ".env", ".env.production", ".npmrc", ".netrc", ".fs-custom-root.json",
    "x.storage-secret.json", "id_rsa", "id_ed25519.pub", "server.pem", "tls.KEY", "cert.p12", "a.pfx", "site.db", "c.sqlite", "d.db-wal", "d.db-shm"];
  for (const name of names) {
    assert.notEqual(checkTreePath(name), null, name);
    assert.notEqual(checkTreePath(`deep/er/${name}`), null, `deep/er/${name}`);
  }
});

test("checkTreePath: ordinary files with look-alike parts are allowed (extension is the LAST dot of the LEAF only)", () => {
  for (const relPath of ["mcp.json", "readme.md", "keys/readme.md", "db/index.html", "assets.v2/logo", "env/app.js", "a.pem.txt"]) {
    assert.equal(checkTreePath(relPath), null, relPath);
  }
});
