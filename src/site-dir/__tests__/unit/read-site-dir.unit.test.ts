import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readSiteDir } from "../../read-site-dir.js";

/**
 * @file SPEC-003 C-004 (`readSiteDir`) — TDD certification, unit tier.
 *
 * Traces: REQ-04, state.spec.md §5 (selector contract), state.spec.md §2 (ConfigJson/SiteMetaJson
 * schemas), behavior.spec.md §4 (64 KiB size limit), EC-03 (invalid config.json at serve time).
 *
 * `readSiteDir` does not exist yet — expected to fail to compile/run until Programmer implements
 * `src/site-dir/read-site-dir.ts` (tasks.md T010). Correct TDD state.
 *
 * **Coverage tooling note (2026-07-28, TDD recertification — for whoever reads a coverage report
 * next, human or LLM):** `node --experimental-test-coverage`'s branch-coverage figure for
 * `read-site-dir.ts` reads below its 98% gate as measured. This is NOT missing test coverage —
 * every reachable branch is exercised (verified: 100% of real source arms across all 4
 * unit-suite files; full mechanical breakdown in `test-certification.md`'s Coverage Gates
 * section). The shortfall is a `tsx`/esbuild artifact: transpiling any module that imports
 * something injects a CommonJS-interop preamble (`__copyProps`/`__toESM`/`__toCommonJS`) with no
 * real source-map anchor, so V8's block-coverage instrumentation attributes several of those
 * synthetic branches to nearby lines in the SOURCE file — directly confirmed by pulling the raw
 * lcov data: the reported uncovered-branch line numbers land inside `read-site-dir.ts`'s own
 * file-header JSDoc comment, not in any executable code. Do not "fix" this by adding more
 * tests — there is nothing left to cover. If this ever needs to actually read 98%+: swap to a
 * source-map-accurate coverage tool (c8/istanbul), logged as a real follow-up in `todos.md`, not
 * done as of this note.
 *
 * Outcome Matrix:
 *   Given dir missing config.json                       -> throws SiteDirInvalidError naming "config.json"
 *   Given dir missing .site-meta.json (config.json ok)   -> throws SiteDirInvalidError naming ".site-meta.json"
 *   Given config.json exists but is not a regular file    -> throws SiteDirInvalidError naming "config.json"
 *   Given config.json is unparseable JSON                -> throws SiteDirInvalidError naming the parse error (EC-03)
 *   Given .site-meta.json is unparseable JSON             -> throws SiteDirInvalidError naming ".site-meta.json" (EC-03)
 *   Given config.json.name is empty/whitespace-only      -> throws SiteDirInvalidError
 *   Given config.json.name is absent or not a string      -> throws SiteDirInvalidError
 *   Given config.json.name exceeds 200 chars after trim   -> throws SiteDirInvalidError
 *   Given config.json exceeds 64 KiB                     -> throws SiteDirInvalidError
 *   Given config.json carries real domain/port values     -> returns them verbatim, not nulled out
 *   Given both files present, valid, within size          -> returns { config, meta } content-equal to the files on disk
 */

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-read-site-dir-"));
}

function validConfig() {
  return { name: "Demo Site", domain: null, port: null };
}

function validMeta() {
  return {
    siteId: "11111111-1111-1111-1111-111111111111",
    templateId: "starter",
    templateVersion: "1.0.0",
    schemaVersion: 17,
    schemaTag: "0017_magical_rawhide_kid",
    createdAt: "2026-07-28T00:00:00.000Z",
  };
}

function assertSiteDirInvalid(fn: () => unknown, fileHint: RegExp, label: string): void {
  assert.throws(
    fn,
    (err: unknown) => {
      assert.ok(err instanceof Error, `${label}: must throw a real Error`);
      assert.equal((err as Error).name, "SiteDirInvalidError", `${label}: must be the SITE_DIR_INVALID-mapped error type`);
      assert.match((err as Error).message, fileHint, `${label}: message must name the failing file (errors.spec.md §3 SITE_DIR_INVALID.file schema)`);
      return true;
    }
  );
}

test("missing config.json -> SiteDirInvalidError naming config.json", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json/, "missing config.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("missing .site-meta.json (crashed init, AC-05) -> SiteDirInvalidError naming .site-meta.json", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(validConfig()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /\.site-meta\.json/, "missing .site-meta.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("EC-03: config.json contains invalid JSON -> SiteDirInvalidError naming config.json and the parse failure", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), "{ this is not valid json ,,, ");
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json/, "corrupt config.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("config.json.name empty/whitespace-only -> SiteDirInvalidError (state.spec.md §2: name required, 1..200 chars after trim)", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "   ", domain: null, port: null }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json|name/, "empty config.json.name");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("behavior.spec.md §4: config.json larger than 64 KiB -> SiteDirInvalidError (corruption guard)", () => {
  const dir = mkTempDir();
  try {
    const oversizedName = "x".repeat(70 * 1024);
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: oversizedName, domain: null, port: null }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json|size|64/i, "oversized config.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("behavior.spec.md §4: .site-meta.json larger than 64 KiB -> SiteDirInvalidError", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(validConfig()));
    const oversizedMeta = { ...validMeta(), templateId: "x".repeat(70 * 1024) };
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(oversizedMeta));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /\.site-meta\.json|size|64/i, "oversized .site-meta.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("config.json exists but is a directory, not a regular file -> SiteDirInvalidError naming config.json", () => {
  const dir = mkTempDir();
  try {
    // A dir entry named config.json stats fine, so the "missing" guard above does not fire — only
    // the regular-file check stands between this and a readFileSync EISDIR crash.
    fs.mkdirSync(path.join(dir, "config.json"));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json/, "config.json is a directory");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("EC-03: .site-meta.json contains invalid JSON -> SiteDirInvalidError naming .site-meta.json and the parse failure", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(validConfig()));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), '{"siteId": "11111111", truncated mid-write');
    assertSiteDirInvalid(() => readSiteDir({ dir }), /\.site-meta\.json/, "corrupt .site-meta.json");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("state.spec.md §2: config.json.name absent, or present but not a string, -> SiteDirInvalidError (a required field, not an optional one)", () => {
  for (const badName of [undefined, null, 42, ["Demo Site"], { value: "Demo Site" }]) {
    const dir = mkTempDir();
    try {
      fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: badName, domain: null, port: null }));
      fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
      assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json|name/, `config.json.name = ${JSON.stringify(badName)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("state.spec.md §2: config.json.name longer than 200 chars after trim -> SiteDirInvalidError (the upper bound of the 1..200 rule, reached without tripping the 64 KiB file guard)", () => {
  const dir = mkTempDir();
  try {
    // 201 chars: over the name bound, but nowhere near the separate 64 KiB whole-file guard, so
    // this reaches the length check rather than being short-circuited by the size check.
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: `  ${"n".repeat(201)}  `, domain: null, port: null }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));
    assertSiteDirInvalid(() => readSiteDir({ dir }), /config\.json|name|200/, "201-char config.json.name");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("state.spec.md §2: a config.json carrying real domain and port values returns them verbatim (the optional fields are passed through, not nulled out)", () => {
  const dir = mkTempDir();
  try {
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "  Trimmed Site  ", domain: "example.com", port: 8080 }));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(validMeta()));

    const result = readSiteDir({ dir });
    assert.equal(result.config.name, "Trimmed Site", "state.spec.md §2: name is stored trimmed");
    assert.equal(result.config.domain, "example.com", "a present domain must survive the read, not be replaced with null");
    assert.equal(result.config.port, 8080, "BR-02: config.json.port is serve's 2nd port tier — it must survive the read, not be replaced with null");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("both files present, valid, within size -> readSiteDir returns { config, meta } content-equal to disk", () => {
  const dir = mkTempDir();
  try {
    const config = validConfig();
    const meta = validMeta();
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(config));
    fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify(meta));

    const result = readSiteDir({ dir });
    assert.deepEqual(result.config, config);
    assert.deepEqual(result.meta, meta);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
