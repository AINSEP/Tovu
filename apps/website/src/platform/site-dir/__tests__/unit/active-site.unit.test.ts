import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { persistActiveSite, readEnvLine, readPersistedActiveSite, upsertEnvLine } from "../../active-site.js";

/**
 * @file 2026-09-04 sites-switcher decision — TDD for `active-site.ts`'s Activate persistence half.
 *
 * `persistActiveSite` deliberately never touches this process's own `process.env` (see that
 * function's own doc) — every assertion here is against the `.env` FILE it wrote, never against
 * `resolveSiteRoot()`'s live answer, which is the whole point of the "restart required" design.
 */

function mkRepoRootFixture(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-active-site-"));
}

test("upsertEnvLine: appends a new KEY=value to an empty source", () => {
  assert.equal(upsertEnvLine("", "TOVU_SITE", "my-site"), "TOVU_SITE=my-site\n");
});

test("upsertEnvLine: appends without disturbing existing lines (order and content untouched)", () => {
  const source = "TOVU_ADMIN_PASSWORD=secret123\nTOVU_INTEGRATIONS_ROOT_KEY=abc\n";
  const result = upsertEnvLine(source, "TOVU_SITE", "my-site");
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_INTEGRATIONS_ROOT_KEY=abc\nTOVU_SITE=my-site\n");
});

test("upsertEnvLine: replaces an existing KEY=value in place, preserving every other line verbatim", () => {
  const source = "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=old-site\nTOVU_INTEGRATIONS_ROOT_KEY=abc\n";
  const result = upsertEnvLine(source, "TOVU_SITE", "new-site");
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=new-site\nTOVU_INTEGRATIONS_ROOT_KEY=abc\n");
});

test("upsertEnvLine: a source with no trailing newline still gets exactly one new line appended (no blank line inserted)", () => {
  const result = upsertEnvLine("TOVU_ADMIN_PASSWORD=secret123", "TOVU_SITE", "my-site");
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=my-site\n");
});

test("persistActiveSite: writes TOVU_SITE=<name> to a fresh repo root with no .env yet", () => {
  const cwd = mkRepoRootFixture();
  try {
    persistActiveSite({ name: "my-site" }, { cwd });
    const written = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.equal(written, "TOVU_SITE=my-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: upserts into an EXISTING .env without touching any other line (secrets included)", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=old-site\n");
    persistActiveSite({ name: "new-site" }, { cwd });
    const written = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.equal(written, "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=new-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: never touches this process's own process.env", () => {
  const cwd = mkRepoRootFixture();
  const before = process.env.TOVU_SITE;
  try {
    persistActiveSite({ name: "some-other-site" }, { cwd });
    assert.equal(process.env.TOVU_SITE, before, "activate must persist to disk only — the live process keeps whatever it already booted with");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readEnvLine: returns null when the key is absent", () => {
  assert.equal(readEnvLine("TOVU_ADMIN_PASSWORD=secret123\n", "TOVU_SITE"), null);
});

test("readEnvLine: returns the value for a present key, trimmed", () => {
  assert.equal(readEnvLine("TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE= my-site \n", "TOVU_SITE"), "my-site");
});

test("readEnvLine: reads back exactly what upsertEnvLine wrote (round trip)", () => {
  const written = upsertEnvLine("TOVU_ADMIN_PASSWORD=secret123\n", "TOVU_SITE", "round-trip-site");
  assert.equal(readEnvLine(written, "TOVU_SITE"), "round-trip-site");
});

test("readEnvLine: the FIRST matching line wins — the same one upsertEnvLine would replace", () => {
  const source = "TOVU_SITE=first\nTOVU_SITE=second\n";
  assert.equal(readEnvLine(source, "TOVU_SITE"), "first");
  assert.equal(upsertEnvLine(source, "TOVU_SITE", "third"), "TOVU_SITE=third\nTOVU_SITE=second\n");
});

test("readPersistedActiveSite: null when there is no .env file at all", () => {
  const cwd = mkRepoRootFixture();
  try {
    assert.equal(readPersistedActiveSite({ cwd }), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: null for an empty TOVU_SITE= (a no-op for resolveSiteRoot, not a pending choice)", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_SITE=\n");
    assert.equal(readPersistedActiveSite({ cwd }), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: reads back the name persistActiveSite just wrote", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_ADMIN_PASSWORD=super-secret\n");
    persistActiveSite({ name: "queued-site" }, { cwd });
    assert.equal(readPersistedActiveSite({ cwd }), "queued-site");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
