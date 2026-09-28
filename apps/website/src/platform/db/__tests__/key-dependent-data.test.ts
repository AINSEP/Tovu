import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { findKeyDependentData } from "../key-dependent-data.js";

/**
 * @file `findKeyDependentData` (`platform/db/key-dependent-data.ts`) against real SQLite files.
 */

// ---------------------------------------------------------------------------
// findKeyDependentData — moved here from `features/webhooks/site-key-sources.ts` with the scan
// itself (storage plan N2: onto the storage kernel). `site-key-ensure.ts` receives it injected;
// the admin Site Token route imports it directly.
//
// These 4 cases were originally written against the CLI's `tovu root-key ensure` command
// (`cli/__tests__/unit/root-key-ensure.unit.test.ts`, deleted in `abc4807d5` when that command was
// absorbed into `ensureSiteKeyForBoot`) and lost with it. `site-key-ensure.unit.test.ts` only
// exercises this function indirectly (via `ensureSiteKey`'s own "refuse" case, sealed_ciphertext
// only) — restored here as direct tests against the function itself, covering the 3 cases that
// indirect exercise never reached (webhook_subscriptions, a clean DB, and an unreadable DB path)
// plus the sealed_ciphertext case for a complete, self-contained direct suite at this function's
// new home.
// ---------------------------------------------------------------------------

function buildSealedCiphertextDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE publish_credential_sets (id INTEGER PRIMARY KEY, sealed_ciphertext TEXT)");
    db.exec("INSERT INTO publish_credential_sets (sealed_ciphertext) VALUES ('cipher-bytes')");
  } finally {
    db.close();
  }
}

function buildWebhookSubscriptionsDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE webhook_subscriptions (id INTEGER PRIMARY KEY)");
    db.exec("INSERT INTO webhook_subscriptions (id) VALUES (1)");
  } finally {
    db.close();
  }
}

function buildEmptyDb(dbPath: string): void {
  const db = new Database(dbPath);
  try {
    db.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  } finally {
    db.close();
  }
}

test("findKeyDependentData: a non-null sealed_ciphertext row counts as key-dependent data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildSealedCiphertextDb(dbPath);
    assert.equal(await findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: a webhook_subscriptions row counts as key-dependent data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildWebhookSubscriptionsDb(dbPath);
    assert.equal(await findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: a DB with neither table counts as clean", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    buildEmptyDb(dbPath);
    assert.equal(await findKeyDependentData([dbPath]), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: an unreadable DB path fails closed (counts as data present)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "does-not-exist.db");
    assert.equal(await findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("findKeyDependentData: a non-null column ending in sealed_ciphertext (oauth_sealed_ciphertext) counts too", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tovu-key-dependent-data-"));
  try {
    const dbPath = join(dir, "content.db");
    const db = new Database(dbPath);
    try {
      db.exec("CREATE TABLE external_mcp_servers (id INTEGER PRIMARY KEY, oauth_sealed_ciphertext TEXT)");
      db.exec("INSERT INTO external_mcp_servers (oauth_sealed_ciphertext) VALUES ('cipher-bytes')");
    } finally {
      db.close();
    }
    assert.equal(await findKeyDependentData([dbPath]), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
