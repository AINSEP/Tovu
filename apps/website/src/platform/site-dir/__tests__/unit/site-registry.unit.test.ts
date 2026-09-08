import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { openContentDbReadOnly } from "../../../db/sqlite/content-db.js";
import { posts as postsTable } from "../../../db/schema.js";
import { ValidationError } from "../../errors.js";
import { createSite, describeSiteBinding, includeServingSite, listSites, SITE_BINDING_NOT_SWITCHABLE_ENV, SITE_NAME_PATTERN } from "../../site-registry.js";

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

test("describeSiteBinding: switcherCompatible stays true for every binding that really is <cwd>/sites-relative", () => {
  // The two precedence branches whose result is, by construction, the same `<cwd>/sites/<name>` the
  // switcher's own write paths resolve.
  assert.equal(describeSiteBinding({ cwd: "/repo", env: {} }).switcherCompatible, true);
  assert.equal(describeSiteBinding({ cwd: "/repo", env: { TOVU_SITE: "second-site" } }).switcherCompatible, true);
});

test("describeSiteBinding: a TOVU_SITE_DIR pointing OUTSIDE <cwd>/sites is not switcher-compatible (2026-09-07)", () => {
  // This assertion was `true` until 2026-09-07, on the reasoning that every binding this function
  // produces is `{cwd, env}`-resolved like the switcher's own root. `resolveSiteRoot` honors
  // `TOVU_SITE_DIR` outright, so that never held for an override naming a path elsewhere on disk:
  // the binding claimed to be switchable while `listSites`/`createSite`/`sites_duplicate_site`
  // would have written under an unrelated `<cwd>/sites`.
  assert.equal(
    describeSiteBinding({ cwd: "/repo", env: { TOVU_SITE_DIR: "/elsewhere/my-site" } }).switcherCompatible,
    false
  );
  // An override that names a real `<cwd>/sites` child is still switchable — the rule is about where
  // the directory IS, not about the variable being set.
  assert.equal(
    describeSiteBinding({ cwd: "/repo", env: { TOVU_SITE_DIR: "/repo/sites/second-site" } }).switcherCompatible,
    true
  );
});

test("describeSiteBinding: an install-dir-pinned boot marks its binding non-switchable for every process that inherits its env", () => {
  // The channel `tovu serve <dir>` uses to tell the agent daemon — a SEPARATE process that rebuilds
  // its own RouteDeps, and the process where `sites_duplicate_site` actually runs — what the API
  // already knows. Needed even when `<dir>` sits under `<cwd>/sites`, which no path check can
  // distinguish from a switcher-chosen site.
  const env = { [SITE_BINDING_NOT_SWITCHABLE_ENV]: "1", TOVU_SITE_DIR: "/repo/sites/second-site" };
  assert.equal(describeSiteBinding({ cwd: "/repo", env }).switcherCompatible, false);
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

/**
 * `includeServingSite` — the served-but-unregistered case (2026-09-05 sites-listing fix).
 *
 * This repo's own `sites/tovu-com` carries neither `config.json` nor `.site-meta.json` (verified on
 * disk), so `readSiteDir` rejects it and `listSites` silently drops it — the admin Sites screen
 * rendered "All sites 0" while that very directory was being served. These tests fix the shape of
 * the composer that closes that gap WITHOUT loosening the validator: `listSites` keeps meaning
 * "directories `tovu serve` would accept", and the extra entry carries `registration:
 * "unregistered"` so the fact never goes missing.
 */

/** A serving directory that exists but carries no init markers — exactly `sites/tovu-com`. */
function mkUnregisteredServingDir(): { cwd: string; dir: string } {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-unregistered-"));
  const dir = path.join(cwd, "sites", "tovu-com");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "content.db"), "not a real db, but the folder is plainly in use");
  return { cwd, dir };
}

test("includeServingSite: appends the served directory as `unregistered` when it carries no init markers", () => {
  const { cwd, dir } = mkUnregisteredServingDir();
  try {
    const binding = describeSiteBinding({ cwd, env: {} });
    assert.equal(binding.dir, dir, "precondition: the default binding resolves to this folder");
    assert.deepEqual(listSites({ cwd, env: {} }), [], "precondition: the strict listing still drops it");

    const composed = includeServingSite({ sites: listSites({ cwd, env: {} }), binding });

    assert.equal(composed.length, 1, "the site being served must appear in the listing");
    assert.equal(composed[0]?.name, "tovu-com");
    assert.equal(composed[0]?.dir, dir);
    assert.equal(composed[0]?.registration, "unregistered", "the card must still be able to say `tovu serve` would reject this folder");
    assert.equal(composed[0]?.active, true, "the only entry this ever appends is the one being served");
    assert.equal(composed[0]?.displayName, "tovu-com", "no config.json exists to read a display name from — the folder name is the honest answer");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("includeServingSite: marks a real initialized site `registered` and appends nothing", () => {
  const { cwd } = mkSitesRoot();
  try {
    createSite({ name: "bound-site" }, { cwd });
    const env = { TOVU_SITE: "bound-site" };
    const binding = describeSiteBinding({ cwd, env });

    const composed = includeServingSite({ sites: listSites({ cwd, env }), binding });

    assert.equal(composed.length, 1, "a served site already in the strict listing must not be duplicated");
    assert.equal(composed[0]?.name, "bound-site");
    assert.equal(composed[0]?.registration, "registered");
    assert.equal(composed[0]?.active, true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("includeServingSite: appends nothing when the served directory does not exist on disk", () => {
  const { cwd } = mkSitesRoot();
  try {
    const binding = describeSiteBinding({ cwd, env: { TOVU_SITE: "never-created" } });
    assert.equal(fs.existsSync(binding.dir), false, "precondition: nothing was ever created there");

    assert.deepEqual(includeServingSite({ sites: listSites({ cwd, env: {} }), binding }), [], "a card for a folder that is not there would be its own lie");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("includeServingSite: appends nothing when the served path is a FILE rather than a directory", () => {
  const { cwd, sitesDir } = mkSitesRoot();
  try {
    fs.writeFileSync(path.join(sitesDir, "a-file"), "not a directory");
    const binding = describeSiteBinding({ cwd, env: { TOVU_SITE: "a-file" } });

    assert.deepEqual(includeServingSite({ sites: listSites({ cwd, env: {} }), binding }), []);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("includeServingSite: keeps every registered sibling, and the appended entry is the ONLY active one", () => {
  const { cwd } = mkUnregisteredServingDir();
  try {
    createSite({ name: "site-a" }, { cwd });
    createSite({ name: "site-b" }, { cwd });
    const binding = describeSiteBinding({ cwd, env: {} });

    const composed = includeServingSite({ sites: listSites({ cwd, env: {} }), binding });

    assert.deepEqual(
      composed.map((site) => [site.name, site.registration, site.active]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [
        ["site-a", "registered", false],
        ["site-b", "registered", false],
        ["tovu-com", "unregistered", true],
      ],
      "the two real sites keep their own state; only the served folder is added, and only it is active",
    );
    // The invariant the Activate button leans on: an `unregistered` entry is ALWAYS the serving one,
    // and the UI disables Activate for whatever is already serving. That is what keeps the activate
    // route's own strict `listSites()` 404 unreachable from this screen — see `sites-route.test.ts`.
    for (const site of composed) {
      if (site.registration === "unregistered") assert.equal(site.active, true);
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("includeServingSite: does NOT loosen readSiteDir — a half-written site is still absent from both the strict and the composed listing", () => {
  const { cwd, sitesDir } = mkSitesRoot();
  try {
    // A `config.json` but no `.site-meta.json` commit marker: an interrupted `initSite` (INV-02).
    const halfWritten = path.join(sitesDir, "half-written");
    fs.mkdirSync(halfWritten);
    fs.writeFileSync(path.join(halfWritten, "config.json"), JSON.stringify({ name: "x", domain: null, port: null }));
    const binding = describeSiteBinding({ cwd, env: { TOVU_SITE: "some-other-site" } });

    const composed = includeServingSite({ sites: listSites({ cwd, env: {} }), binding });

    assert.deepEqual(
      composed.map((site) => site.name),
      [],
      "only the SERVED directory is ever added — a half-written folder nobody is serving stays out",
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
