import assert from "node:assert/strict";
import test from "node:test";

import { checkRawFilePath } from "../backstop-policy.js";
import { checkTreePath } from "../file-tree-policy.js";

/**
 * @file Owner-approved FU-A 2c (2026-10-25): a credential-config file keeps its meaning under an
 * editor/backup suffix (`.bak`, `.old`, `.orig`, `~`, stacked or any case), and key/database files are
 * recognised by name even without a stem. Both the typed-tree rule (checkTreePath) and the raw-file
 * rule (checkRawFilePath) must refuse them, at the root and nested.
 */

const DENIED = [
  ".mcp.local.json.bak", ".mcp.local.json.old", ".mcp.local.json.orig", ".mcp.local.json~", ".mcp.local.json.bak~",
  ".npmrc.bak", ".npmrc.old", ".npmrc.orig", ".npmrc~", ".NPMRC.BAK", ".netrc.bak", ".netrc~",
  ".env~", ".env.bak", ".env.local~", ".ENV~",
  ".pem", ".key", ".PEM", "server.pem.bak", "tls.key~", "id_rsa~", "id_ed25519.orig",
  "site.db.bak", "site.db~", "site.db.old", "content.sqlite3", "content.sqlite3.bak", "content.sqlite.orig",
];

const ALLOWED = ["npmrc-guide.md", "pemberton.css", "keynote.txt", "backup-notes.txt", "env.txt", "mcp.md"];

test("credential/key/database names under a backup suffix are refused by the typed-tree rule, root and nested", () => {
  for (const name of DENIED) {
    for (const relPath of [name, `assets/deep/${name}`]) {
      assert.notEqual(checkTreePath(relPath), null, relPath);
      assert.ok(checkTreePath(relPath)!.startsWith(`"${relPath}" `), relPath);
    }
  }
});

test("the same names are refused by the raw-file rule, root and nested", () => {
  for (const name of DENIED) {
    for (const relPath of [name, `assets/deep/${name}`]) {
      assert.notEqual(checkRawFilePath({ relPath }), null, relPath);
    }
  }
});

test("look-alike ordinary names stay allowed by both rules", () => {
  for (const name of ALLOWED) {
    assert.equal(checkTreePath(name), null, name);
    assert.equal(checkRawFilePath({ relPath: name }), null, name);
  }
});
