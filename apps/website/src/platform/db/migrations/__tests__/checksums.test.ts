import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { stripComments } from "../../kernel/__tests__/raw-sqlite-scan.js";
import { LEGACY_BASELINE_ID, legacyBaselineChecksum } from "../0000_legacy_baseline.js";
import { MIGRATION_CHECKSUMS } from "../checksums.js";
import { CONTENT_MIGRATIONS } from "../index.js";
import { FROZEN_CHAIN, LEGACY_DRIZZLE_DIR } from "../legacy-sqlite.js";

/**
 * @file Holds the migration history immutable (ADR-066 §3, §7):
 * - every step's pinned checksum equals the one derived from its sources, so editing a shipped step
 *   goes red here instead of differing silently between databases;
 * - the legacy drizzle folder cannot grow (schema changes are TS steps now).
 *
 * `UPDATE_MIGRATION_CHECKSUMS=1` pins NEW ids only; it never rewrites an existing checksum.
 */

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..");
const CHECKSUMS_FILE = path.join(MIGRATIONS_DIR, "checksums.ts");

/** A TS step's checksum: its source with comments removed and whitespace collapsed. */
function sourceChecksum(id: string): string {
  const file = path.join(MIGRATIONS_DIR, `${id}.ts`);
  const text = stripComments(file, fs.readFileSync(file, "utf8")).replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(text).digest("hex");
}

const derive = (id: string) => (id === LEGACY_BASELINE_ID ? legacyBaselineChecksum() : sourceChecksum(id));

test("every step's pinned checksum matches its sources", () => {
  const unpinned = CONTENT_MIGRATIONS.map((step) => step.id).filter((id) => MIGRATION_CHECKSUMS[id] === undefined);
  if (process.env.UPDATE_MIGRATION_CHECKSUMS === "1" && unpinned.length > 0) {
    const lines = unpinned.map((id) => `  "${id}": "${derive(id)}",\n`).join("");
    fs.writeFileSync(CHECKSUMS_FILE, fs.readFileSync(CHECKSUMS_FILE, "utf8").replace(/\n};\n$/, `\n${lines}};\n`));
    return;
  }
  assert.deepEqual(unpinned, [], "pin new steps with UPDATE_MIGRATION_CHECKSUMS=1");
  for (const step of CONTENT_MIGRATIONS) {
    assert.equal(derive(step.id), MIGRATION_CHECKSUMS[step.id], `${step.id} changed after it was pinned; add a new step instead`);
    assert.equal(step.checksum, MIGRATION_CHECKSUMS[step.id]);
  }
});

test("the legacy drizzle chain is frozen", () => {
  const sqlFiles = fs.readdirSync(LEGACY_DRIZZLE_DIR).filter((name) => name.endsWith(".sql"));
  assert.equal(sqlFiles.length, FROZEN_CHAIN.length, "no new drizzle migrations: write a TS step in platform/db/migrations");
  assert.ok(sqlFiles.sort().at(-1)?.startsWith(FROZEN_CHAIN.lastTag));
});
