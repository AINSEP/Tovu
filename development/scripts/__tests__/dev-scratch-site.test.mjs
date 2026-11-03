import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareDevSitesHome } from "../dev-sites-home.mjs";
import { buildDevChildEnv } from "../dev.mjs";

function initialized(dir, id) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), '{}');
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: id }));
}

test("a clone's implicit dev start migrates a scratch DB instead of the owner's default site", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-scratch-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repoRoot = path.join(root, "clone"), owner = path.join(root, "owner-sites", "tovu-dev");
  initialized(owner, "owner-id");
  fs.mkdirSync(repoRoot);
  const env = { TOVU_SITES_HOME: path.dirname(owner), TOVU_CONTENT_DB: path.join(owner, "content.db") };
  const messages = [], initializations = [];
  const options = { env, homeDir: root, scratchRoot: path.join(root, "scratch"), log: line => messages.push(line),
    initialize: async ({ dir, env: childEnv }) => { initializations.push(childEnv); initialized(dir, "scratch-id"); },
  };
  const selected = await prepareDevSitesHome({ repoRoot }, options);
  assert.notEqual(selected.dir, owner);
  assert.equal(selected.env.TOVU_SITE_DIR, selected.dir);
  assert.notEqual(selected.env.TOVU_CONTENT_DB, env.TOVU_CONTENT_DB);
  assert.equal(buildDevChildEnv({ parent: env, env: selected.env }).TOVU_CONTENT_DB, undefined);
  assert.ok(selected.env.TOVU_DESKTOP_USER_DATA_DIR.startsWith(options.scratchRoot));
  assert.equal(selected.env.TOVU_SITE_SELECTION_PINNED, "1");
  assert.equal(initializations.length, 1);
  assert.ok(messages.some(line => line.includes("scratch") && line.includes("content.db")));
  assert.deepEqual(fs.readdirSync(owner).sort(), [".site-meta.json", "config.json"]);
  const again = await prepareDevSitesHome({ repoRoot }, options);
  assert.equal(again.dir, selected.dir);
  assert.equal(initializations.length, 1);
  assert.equal(env.TOVU_SITE_DIR, undefined);
});

test("both dev launchers prepare the selection before starting a writing API child", () => {
  for (const file of ["dev.mjs", "dev-server.mjs"]) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(source.includes("await prepareDevSitesHome({ repoRoot"));
    assert.ok(source.includes("selectedSite.env"));
  }
});

test("a scratch initialization failure warns and degrades to memory without selecting an owner DB", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-scratch-failure-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const messages = [];
  const selected = await prepareDevSitesHome({ repoRoot: root }, { env: {}, homeDir: root,
    scratchRoot: path.join(root, "scratch"), initialize: async () => { throw new Error("initializer unavailable"); },
    log: line => messages.push(line),
  });
  assert.equal(selected.env.TOVU_DB, "memory");
  assert.equal(selected.dbPath, ":memory:");
  assert.equal(selected.running, null);
  assert.ok(messages.some(line => line.includes("will not persist")));
});

test("two checkouts with the same home get distinct default scratch databases", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-checkouts-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selections = [];
  for (const name of ["one", "two"]) {
    const repoRoot = path.join(root, name); fs.mkdirSync(repoRoot);
    const selected = await prepareDevSitesHome({ repoRoot }, { env: {}, homeDir: root, log: () => {},
      initialize: async ({ dir }) => { initialized(dir, `scratch-${name}`); },
    });
    t.after(() => fs.rmSync(path.dirname(selected.env.TOVU_DESKTOP_USER_DATA_DIR), { recursive: true, force: true }));
    selections.push(selected);
  }
  assert.notEqual(selections[0].dbPath, selections[1].dbPath);
  assert.notEqual(selections[0].env.TOVU_DESKTOP_USER_DATA_DIR, selections[1].env.TOVU_DESKTOP_USER_DATA_DIR);
});

test("explicit development site selections retain their site and announce the DB target", async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-explicit-test-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "sites", "chosen"); initialized(dir, "chosen-id");
  for (const selection of [{ TOVU_SITE: "chosen", TOVU_SITES_HOME: path.dirname(dir) }, { TOVU_SITE_DIR: dir }]) {
    const messages = [];
    const selected = await prepareDevSitesHome({ repoRoot: root }, { env: selection, homeDir: root,
      initialize: () => assert.fail("explicit site must not be initialized"), log: line => messages.push(line),
    });
    assert.equal(selected.dir, dir);
    assert.equal(selected.env.TOVU_SITE_DIR, dir);
    assert.ok(messages.some(line => line.includes("content.db")));
  }
});
