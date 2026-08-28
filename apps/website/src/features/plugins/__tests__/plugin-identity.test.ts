import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { checkNamespaceAdoption, getPluginIdentity } from "../plugin-identity.js";

/** @file ADR-023 §5/§6 (T5 fix, round-2 revision) — the two-track namespace-adoption guard. */

function openDb(): { db: Database.Database; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-identity-"));
  const db = new Database(path.join(dir, "content.db"));
  return { db, dir };
}

test("first declare for a pluginId mints its identity record and is always allowed", () => {
  const { db, dir } = openDb();
  const decision = checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme" } });
  assert.deepEqual(decision, { allowed: true, track: "first-mint" });
  const identity = getPluginIdentity({ db, pluginId: "plugin-a" });
  assert.equal(identity?.provenance.sourceUrl, "https://example.com/a");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a repeat declare with IDENTICAL provenance is allowed on the 'unchanged' track (the common boot-time case)", () => {
  const { db, dir } = openDb();
  const provenance = { sourceUrl: "builtin://newsletter", publisher: "tovu-core" };
  checkNamespaceAdoption({ db, pluginId: "newsletter", provenance });
  const second = checkNamespaceAdoption({ db, pluginId: "newsletter", provenance: { ...provenance } });
  assert.deepEqual(second, { allowed: true, track: "unchanged" });
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("track (a): a verified same-key signature match on BOTH sides auto-adopts despite a provenance mismatch elsewhere", () => {
  const { db, dir } = openDb();
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme", signature: "sig-xyz" } });
  const decision = checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a-v2", publisher: "acme-renamed", signature: "sig-xyz" } });
  assert.deepEqual(decision, { allowed: true, track: "verified-signature" });
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("track (b): an unsigned provenance mismatch requires consent — refused, not silently adopted", () => {
  const { db, dir } = openDb();
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme" } });
  const decision = checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://evil.example.com", publisher: "acme" } });
  assert.equal(decision.allowed, false);
  assert.equal(decision.track, "consent-required");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("track (b): a publisher-string-only match with no signature on either side still requires consent", () => {
  const { db, dir } = openDb();
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme" } });
  const decision = checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://different.example.com/a", publisher: "acme" } });
  assert.equal(decision.allowed, false, "publisher alone is self-declared and non-cryptographic — cannot carry identity proof");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("track (b): a signature on only ONE side does not auto-adopt", () => {
  const { db, dir } = openDb();
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme", signature: "sig-xyz" } });
  const decision = checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme" } }); // no signature this time
  assert.equal(decision.allowed, false);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the identity record itself is never overwritten by a later mismatched declare (permanent retirement)", () => {
  const { db, dir } = openDb();
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://example.com/a", publisher: "acme" } });
  checkNamespaceAdoption({ db, pluginId: "plugin-a", provenance: { sourceUrl: "https://evil.example.com", publisher: "acme" } }); // refused, but attempted
  const identity = getPluginIdentity({ db, pluginId: "plugin-a" });
  assert.equal(identity?.provenance.sourceUrl, "https://example.com/a", "the original, first-minted provenance is retained");
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
