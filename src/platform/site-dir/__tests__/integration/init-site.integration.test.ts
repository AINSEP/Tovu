import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initSite } from "../../init-site.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";

/**
 * @file SPEC-003 C-007 (`initSite`) — TDD certification, integration tier (happy path + input
 * validation + INV-03 + AC-14; fault injection lives in `init-site-fault-injection.integration.test.ts`
 * to keep this file's scenarios fast and non-destructive of fs permissions).
 *
 * Traces: REQ-01, REQ-02, REQ-03, BR-01, BR-03, INV-03, AC-01, AC-02, AC-04, AC-14, EC-01, EC-02, EC-06.
 *
 * `initSite` does not exist yet — expected to fail to compile/run until Programmer implements
 * `src/platform/site-dir/init-site.ts` (tasks.md T014). Correct TDD state.
 */

const TEMPLATE_JSON_PATH = path.resolve(import.meta.dirname, "../../../../content/templates/starter/template.json");

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-init-site-"));
}

test("AC-01/AC-14/REQ-01: a clean init produces exactly the required layout with correct config/meta values", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "demo");
  try {
    const result = initSite({ dir: target, name: "Demo" });

    assert.equal(result.dir, target);
    assert.match(result.siteId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "siteId is a generated UUID (state.spec.md §2)");

    // REQ-01: exactly the required layout, no more, no less.
    const entries = fs.readdirSync(target).sort();
    assert.deepEqual(entries, [".site-meta.json", "config.json", "content.db", "overrides", "plugins", "themes", "uploads"].sort());

    const config = JSON.parse(fs.readFileSync(path.join(target, "config.json"), "utf8"));
    assert.equal(config.name, "Demo");

    const meta = JSON.parse(fs.readFileSync(path.join(target, ".site-meta.json"), "utf8"));
    assert.equal(meta.templateId, "starter");
    assert.equal(meta.siteId, result.siteId);
    const runtime = runtimeSchemaVersion();
    assert.equal(meta.schemaVersion, runtime.index, "AC-01: .site-meta.json records the runtime's latest bundled migration index");
    assert.equal(meta.schemaTag, runtime.tag, "AC-01: .site-meta.json records the runtime's latest bundled migration tag");
    assert.match(meta.createdAt, /^\d{4}-\d{2}-\d{2}T/, "createdAt is a date-time string");

    // AC-14: the four contract-placeholder dirs exist and are empty.
    for (const dirName of ["uploads", "themes", "plugins", "overrides"]) {
      const p = path.join(target, dirName);
      assert.ok(fs.statSync(p).isDirectory(), `${dirName} must be a directory`);
      assert.deepEqual(fs.readdirSync(p), [], `${dirName} must be empty at init`);
    }

    // AC-14: nothing was created outside the target dir.
    assert.deepEqual(fs.readdirSync(parent), ["demo"], "no sibling file/dir may appear outside the target");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("BR-03: omitting --name defaults the site name to the directory basename", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "my-cool-site");
  try {
    initSite({ dir: target });
    const config = JSON.parse(fs.readFileSync(path.join(target, "config.json"), "utf8"));
    assert.equal(config.name, "my-cool-site");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-01 (allowed case): an existing EMPTY directory is a valid init target and init proceeds using it", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "pre-existing-empty");
  fs.mkdirSync(target);
  try {
    const result = initSite({ dir: target, name: "Pre-existing" });
    assert.equal(result.dir, target);
    assert.ok(fs.existsSync(path.join(target, ".site-meta.json")));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("AC-04/EC-01: an existing NON-EMPTY directory -> InitDirNotEmptyError, directory unmodified", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "occupied");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "pre-existing-file.txt"), "leave me alone");
  try {
    assert.throws(
      () => initSite({ dir: target, name: "Should Fail" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "InitDirNotEmptyError");
        return true;
      }
    );
    assert.deepEqual(fs.readdirSync(target), ["pre-existing-file.txt"], "AC-04: the directory must be completely unmodified");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-02: the init target exists as a regular file -> InitDirNotEmptyError (same class), nothing written", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "a-file-not-a-dir");
  fs.writeFileSync(target, "i am a file");
  try {
    assert.throws(
      () => initSite({ dir: target, name: "Should Fail" }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "InitDirNotEmptyError");
        return true;
      }
    );
    assert.ok(fs.statSync(target).isFile(), "EC-02: the file must remain untouched, not replaced by a directory");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("EC-06: an empty/whitespace-only --name is rejected as VALIDATION, nothing created", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "should-not-exist");
  try {
    assert.throws(
      () => initSite({ dir: target, name: "   " }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "ValidationError");
        return true;
      }
    );
    assert.equal(fs.existsSync(target), false, "EC-06: nothing is created when --name fails validation");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("behavior.spec.md §4: a --name longer than 200 chars (after trim) is rejected as VALIDATION", () => {
  const parent = mkTempParent();
  const target = path.join(parent, "too-long-name");
  try {
    assert.throws(
      () => initSite({ dir: target, name: "x".repeat(201) }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal((err as Error).name, "ValidationError");
        return true;
      }
    );
    assert.equal(fs.existsSync(target), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("INV-03: init never mutates templates/starter/ (read-only at runtime) — content unchanged after a real init run", () => {
  const before = fs.readFileSync(TEMPLATE_JSON_PATH, "utf8");
  const beforeMtime = fs.statSync(TEMPLATE_JSON_PATH).mtimeMs;

  const parent = mkTempParent();
  const target = path.join(parent, "inv-03-check");
  try {
    initSite({ dir: target, name: "INV03" });
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }

  const after = fs.readFileSync(TEMPLATE_JSON_PATH, "utf8");
  const afterMtime = fs.statSync(TEMPLATE_JSON_PATH).mtimeMs;
  assert.equal(after, before, "INV-03: template.json content must be byte-identical after init runs");
  assert.equal(afterMtime, beforeMtime, "INV-03: template.json must not have been written to (mtime unchanged)");
});
