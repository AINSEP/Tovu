import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDbReadOnly } from "../../../db/sqlite/content-db.js";
import { posts as postsTable } from "../../../db/schema.js";
import { ValidationError } from "../../errors.js";
import { createSite, describeSiteBinding, listSites, SITE_NAME_PATTERN } from "../../site-registry.js";

/**
 * @file 2026-09-04 sites-switcher decision — TDD for `site-registry.ts`'s list/create half.
 *
 * `createSite` is a thin wrapper over `initSite` (already certified by
 * `init-site.integration.test.ts`), so these tests do not re-prove `initSite`'s own layout
 * contract — they prove the wrapper's OWN job: folder-name validation, `sitesRoot` derivation,
 * `listSites`'s directory scan/skip-invalid/`active`-flag behavior, and (BR: "tovu init should
 * seed a '/' page") that a site created THIS way actually has one, since `createSite` shares
 * `seed.ts`'s `seededPosts` with `tovu init` via the same `readTemplate`-generated
 * `content/templates/starter/seed-content.json` (see `seed.ts`'s own root-page addition).
 */

function mkSitesRoot(): { cwd: string; sitesDir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-registry-"));
  const sitesDir = path.join(cwd, "sites");
  fs.mkdirSync(sitesDir);
  return { cwd, sitesDir };
}

test("listSites: returns [] when sites/ does not exist at all (fresh checkout, before any tovu init)", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-site-registry-nodir-"));
  try {
    assert.deepEqual(listSites({ cwd }), []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("listSites: skips a non-directory entry and a directory missing .site-meta.json, without throwing", () => {
  const { cwd, sitesDir } = mkSitesRoot();
  try {
    fs.writeFileSync(path.join(sitesDir, ".DS_Store"), "not a site");
    fs.mkdirSync(path.join(sitesDir, "half-written"));
    fs.writeFileSync(path.join(sitesDir, "half-written", "config.json"), JSON.stringify({ name: "x", domain: null, port: null }));
    // No `.site-meta.json` written — simulates an interrupted `initSite` that never reached its
    // commit marker (INV-02); `readSiteDir` must reject it, and `listSites` must skip it silently.

    assert.deepEqual(listSites({ cwd }), []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("createSite: rejects an invalid folder name before writing anything to disk", () => {
  const { cwd, sitesDir } = mkSitesRoot();
  try {
    assert.throws(() => createSite({ name: "Not Valid!" }, { cwd }), ValidationError);
    assert.deepEqual(fs.readdirSync(sitesDir), [], "nothing may be written for a rejected name");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("SITE_NAME_PATTERN: accepts lowercase/digits/dashes only, rejecting anything that could escape sitesRoot", () => {
  assert.equal(SITE_NAME_PATTERN.test("my-second-site"), true);
  assert.equal(SITE_NAME_PATTERN.test("Has-Upper"), false);
  assert.equal(SITE_NAME_PATTERN.test("has space"), false);
  assert.equal(SITE_NAME_PATTERN.test("../escape"), false);
  assert.equal(SITE_NAME_PATTERN.test("nested/path"), false);
  assert.equal(SITE_NAME_PATTERN.test(""), false);
});

test("createSite + listSites: a created site is listed with the right name/dir/displayName, and is NOT marked active under an unrelated cwd/env", () => {
  const { cwd } = mkSitesRoot();
  try {
    const result = createSite({ name: "my-second-site" }, { cwd });
    assert.equal(result.name, "my-second-site");
    assert.equal(result.dir, path.join(cwd, "sites", "my-second-site"));
    assert.match(result.siteId, /^[0-9a-f-]{36}$/i);

    const sites = listSites({ cwd });
    assert.equal(sites.length, 1);
    assert.equal(sites[0]?.name, "my-second-site");
    assert.equal(sites[0]?.dir, result.dir);
    assert.equal(sites[0]?.displayName, "my-second-site", "createSite passes `name` through as initSite's display-name default");
    assert.match(sites[0]?.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    // `resolveSiteRoot({cwd})` with no TOVU_SITE_DIR/TOVU_SITE override resolves to
    // `<cwd>/sites/tovu-com` (`site-root.ts`'s own default), never this freshly created site.
    assert.equal(sites[0]?.active, false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("listSites: marks the site matching TOVU_SITE as active, and every sibling as not", () => {
  const { cwd } = mkSitesRoot();
  try {
    createSite({ name: "site-a" }, { cwd });
    createSite({ name: "site-b" }, { cwd });

    const sites = listSites({ cwd, env: { TOVU_SITE: "site-b" } });
    const byName = Object.fromEntries(sites.map((s) => [s.name, s.active]));
    assert.deepEqual(byName, { "site-a": false, "site-b": true });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("createSite: the resulting content.db has a published kind:'page' row at slug '/' (the seeded homepage, matching tovu init byte for byte)", () => {
  const { cwd } = mkSitesRoot();
  try {
    const result = createSite({ name: "root-page-check" }, { cwd });
    const db = openContentDbReadOnly(path.join(result.dir, "content.db"));
    try {
      const rows = db.select().from(postsTable).all();
      const rootPage = rows.find((row) => row.slug === "/");
      assert.ok(rootPage, "expected a post row claiming slug '/' right after createSite");
      assert.equal(rootPage?.kind, "page", "the '/' row must be kind:'page' (post.ts's ROOT_SLUG gate), never kind:'post'");
      assert.equal(rootPage?.status, "published", "an unpublished '/' row would never actually render for GET /");
    } finally {
      db.$client.close();
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("describeSiteBinding: falls back to the default site name when neither override is set", () => {
  const binding = describeSiteBinding({ cwd: "/repo", env: {} });
  assert.equal(binding.dir, path.join("/repo", "sites", "tovu-com"));
  assert.equal(binding.name, "tovu-com");
  assert.equal(binding.dirOverridden, false);
});

test("describeSiteBinding: TOVU_SITE names a folder under sites/, and is NOT reported as an override", () => {
  const binding = describeSiteBinding({ cwd: "/repo", env: { TOVU_SITE: "second-site" } });
  assert.equal(binding.dir, path.join("/repo", "sites", "second-site"));
  assert.equal(binding.name, "second-site");
  assert.equal(binding.dirOverridden, false, "TOVU_SITE is the vocabulary activate writes — it is not what defeats an activate");
});

test("describeSiteBinding: TOVU_SITE_DIR is reported as an override, because it OUTRANKS the TOVU_SITE line activate writes", () => {
  const binding = describeSiteBinding({ cwd: "/repo", env: { TOVU_SITE_DIR: "/elsewhere/my-site", TOVU_SITE: "queued-site" } });
  assert.equal(binding.dir, path.resolve("/elsewhere/my-site"));
  assert.equal(binding.name, "my-site");
  assert.equal(binding.dirOverridden, true);
});

test("describeSiteBinding: agrees with listSites()'s own `active` flag for a real created site", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-binding-"));
  try {
    fs.mkdirSync(path.join(cwd, "sites"));
    createSite({ name: "bound-site" }, { cwd });
    const env = { TOVU_SITE: "bound-site" };
    const binding = describeSiteBinding({ cwd, env });
    const listed = listSites({ cwd, env });
    const active = listed.filter((site) => site.active);
    assert.equal(active.length, 1);
    assert.equal(active[0].dir, binding.dir, "the two derivations must never disagree about which site is live");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
