/**
 * @file Coverage for `site-config.ts` — the name rule and the atomic `config.json` write behind
 * "Rename…". Real files in a temp dir, not fakes: the whole point of this module is what ends up
 * ON DISK after a write, and a mocked `fs` would assert that the code calls the functions it
 * obviously calls while proving nothing about the file a site's next boot has to parse.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { normalizeSiteName, writeSiteName, readCatalogSite, catalogSiteIdentity } from "./site-config.ts";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-site-config-"));
}

/** A site dir whose `config.json` holds `contents`. */
function writeConfig(contents: unknown) {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(contents, null, 2));
  return dir;
}

function readConfig(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
}

test("normalizeSiteName enforces validateConfig's rule: 1..200 chars AFTER trimming", () => {
  assert.equal(normalizeSiteName("My Site"), "My Site");
  // Trimmed, so the stored value is what `tovu serve` would itself compute.
  assert.equal(normalizeSiteName("  My Site  "), "My Site");
  assert.equal(normalizeSiteName("a".repeat(200)), "a".repeat(200));

  // Trim happens BEFORE the length check, so whitespace is empty rather than length 3 — the same
  // order `read-site-dir.ts`'s `validateConfig` uses. A name that passed here but failed there
  // would stop the site booting, which is the whole reason this rule is duplicated at all.
  assert.equal(normalizeSiteName("   "), null);
  assert.equal(normalizeSiteName(""), null);
  assert.equal(normalizeSiteName("a".repeat(201)), null);
  // 201 chars of content plus padding still fails: the bound is on the trimmed value.
  assert.equal(normalizeSiteName(`  ${"a".repeat(201)}  `), null);
});

test("normalizeSiteName refuses a non-string rather than coercing one", () => {
  // The renderer cannot be trusted to have sent a string — this arrives over IPC.
  for (const value of [undefined, null, 42, {}, ["a"], true]) {
    assert.equal(normalizeSiteName(value), null, `${JSON.stringify(value) ?? "undefined"} must not be a name`);
  }
});

test("writeSiteName writes the trimmed name and PRESERVES every other key", () => {
  // `ConfigJson` is documented as an additive-only compatibility surface, so a rename that rebuilt
  // the object from the three keys this shell knows about would silently drop the rest. `future`
  // stands in for a field a newer Tovu adds that this shell has never heard of.
  const dir = writeConfig({ name: "old", domain: "example.com", port: 4321, future: { kept: true } });

  assert.equal(writeSiteName(dir, "  new name  "), "new name");

  assert.deepEqual(readConfig(dir), {
    name: "new name",
    domain: "example.com",
    port: 4321,
    future: { kept: true },
  });
});

test("writeSiteName refuses an invalid name BEFORE touching the file", () => {
  const dir = writeConfig({ name: "original", port: 4321 });

  assert.throws(() => writeSiteName(dir, "   "), /1 to 200 characters/);

  // The refusal must leave the site exactly as it was. A validation that ran after an open-and-
  // truncate would refuse the name and still break the next boot.
  assert.deepEqual(readConfig(dir), { name: "original", port: 4321 });
});

test("writeSiteName refuses a directory with no readable config.json rather than creating one", () => {
  const dir = tempDir();
  assert.throws(() => writeSiteName(dir, "new name"), /could not be read as a site config/);
  // Emphatically not created: a `config.json` written into a folder that is not a site would make
  // `classifySiteDir` start calling it half a site.
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
});

test("writeSiteName refuses a config.json that is not a JSON object", () => {
  for (const body of ["[1,2,3]", '"just a string"', "{ not json", "null"]) {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, "config.json"), body);
    const before = fs.readFileSync(path.join(dir, "config.json"));
    assert.throws(() => writeSiteName(dir, "new name"), /could not be read as a site config/, `body: ${body}`);
    assert.deepEqual(fs.readFileSync(path.join(dir, "config.json")), before);
  }
});

test("writeSiteName refuses an oversized config.json instead of parsing it", () => {
  // `read-site-dir.ts`'s own 64 KiB corruption guard, mirrored. Valid JSON, just far too big to be
  // a config file.
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name: "x", pad: "p".repeat(70 * 1024) }));
  const before = fs.readFileSync(path.join(dir, "config.json"));
  assert.throws(() => writeSiteName(dir, "new name"), /could not be read as a site config/);
  assert.deepEqual(fs.readFileSync(path.join(dir, "config.json")), before);
});

test("writeSiteName leaves no temp file behind on success", () => {
  // The temp-then-rename is what makes the write atomic, but the temp file lives INSIDE the
  // operator's own site directory — the one place this app should leave no litter.
  const dir = writeConfig({ name: "old" });
  writeSiteName(dir, "new");
  assert.deepEqual(fs.readdirSync(dir), ["config.json"]);
});

test("writeSiteName reports a failed write as operator-facing and leaves config.json untouched", () => {
  const dir = writeConfig({ name: "old", port: 4321 });
  // Occupy this process's temp name with a non-empty folder: the write fails (EISDIR) and even the
  // best-effort cleanup cannot remove it — the original failure is still the one reported.
  const squatter = path.join(dir, `config.json.${process.pid}.tmp`);
  fs.mkdirSync(path.join(squatter, "inside"), { recursive: true });
  assert.throws(() => writeSiteName(dir, "new"), {
    message: new RegExp(`^${path.join(dir, "config.json").replaceAll("\\", "\\\\")} could not be written: EISDIR`),
  });
  assert.deepEqual(readConfig(dir), { name: "old", port: 4321 });
});

test("the written file is valid JSON that round-trips, with a trailing newline", () => {
  // The next thing to read this file is `tovu serve`'s own `JSON.parse`. A file that needs this
  // module to read it back is not good enough.
  const dir = writeConfig({ name: "old", domain: null, port: null });
  writeSiteName(dir, "Café Münster");
  const raw = fs.readFileSync(path.join(dir, "config.json"), "utf8");
  assert.equal(raw.endsWith("\n"), true, "POSIX text file should end with a newline");
  assert.equal(JSON.parse(raw).name, "Café Münster");
});

test("catalog identity accepts legacy markers and preserves a nonblank ID verbatim", () => {
  assert.deepEqual(catalogSiteIdentity({ meta: null }), {});
  assert.deepEqual(catalogSiteIdentity({ meta: {} }), {});
  assert.deepEqual(catalogSiteIdentity({ meta: { schemaVersion: 58 } }), {});
  assert.deepEqual(catalogSiteIdentity({ meta: { siteId: "  site-a  " } }), { siteId: "  site-a  " });
});

test("catalog identity refuses primitive/array markers and invalid identity fields", () => {
  for (const meta of [undefined, false, 42, "site-a", []]) {
    assert.throws(() => catalogSiteIdentity({ meta }), { message: "Invalid site marker" });
  }
  for (const siteId of [null, false, 42, {}, [], "", " \t "]) {
    assert.throws(() => catalogSiteIdentity({ meta: { siteId } }), { message: "Invalid site identity" });
  }
});

test("catalog admission combines the validated name and optional identity without writing", (t) => {
  const dir = writeConfig({ name: "  Site A  " });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const marker = path.join(dir, ".site-meta.json");
  for (const meta of [null, {}, { siteId: " site-a " }]) {
    const body = JSON.stringify(meta);
    fs.writeFileSync(marker, body);
    assert.deepEqual(readCatalogSite({ siteDir: dir }), meta && "siteId" in meta ? { name: "Site A", siteId: " site-a " } : { name: "Site A" });
    assert.equal(fs.readFileSync(marker, "utf8"), body);
  }
  fs.writeFileSync(marker, " ".repeat(64 * 1024 + 1));
  assert.throws(() => readCatalogSite({ siteDir: dir }), { message: "Invalid site markers" });
  fs.writeFileSync(marker, "{broken");
  assert.throws(() => readCatalogSite({ siteDir: dir }), SyntaxError);
  fs.writeFileSync(path.join(dir, "config.json"), '{"name":""}');
  fs.unlinkSync(marker);
  assert.throws(() => readCatalogSite({ siteDir: dir }), { message: "Invalid site markers" });
});
