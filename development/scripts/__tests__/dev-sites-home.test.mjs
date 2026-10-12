import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { devSitesHome } from "../dev-sites-home.mjs";
import { jiniConsumers } from "../jini-links.mjs";
import { announceRunningDevSite } from "../dev.mjs";

// No app/server is imported or started. This exercises the actual dev selection adapter.
test("dev keeps the checkout default despite Documents sites, while explicit selection attaches", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-sites-home-")));
  try {
    const repoRoot = path.join(root, "repo"), options = { env: {}, homeDir: root };
    fs.mkdirSync(repoRoot);
    assert.throws(() => devSitesHome({ repoRoot }, options), /Site folder is unavailable/);
    const checkout = path.join(repoRoot, "sites", "tovu-dev"); fs.mkdirSync(checkout, { recursive: true });
    fs.writeFileSync(path.join(checkout, "config.json"), "{}"); fs.writeFileSync(path.join(checkout, ".site-meta.json"), "{}");
    const dir = path.join(root, "Documents", "Tovu", "alpha"); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), "{}"); fs.writeFileSync(path.join(dir, ".site-meta.json"), "{}");
    fs.writeFileSync(path.join(dir, ".tovu-running.json"), JSON.stringify({ pid: process.pid, port: 3456, app: "Desktop", scheme: "http", started: new Date().toISOString(), token: "fixture" }));
    assert.equal(devSitesHome({ repoRoot }, options).dir, path.join(repoRoot, "sites", "tovu-dev"));
    const selected = devSitesHome({ repoRoot }, { ...options, env: { TOVU_SITE: "alpha" } });
    assert.equal(selected.dir, dir); assert.equal(selected.running?.port, 3456); assert.equal(selected.running?.app, "Desktop");
    assert.equal(fs.existsSync(path.join(dir, ".tovu-running.json.lock")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("Jini linking includes the Desktop consumer that needs the shared home exports", () => {
  const desktop = jiniConsumers().find((consumer) => consumer.dir.endsWith(path.join("apps", "desktop")));
  assert.ok(desktop); assert.ok(desktop.names.includes("platform"));
});

test("an existing owner exit explains no server was started and gives the exact alternate-site command", () => {
  const lines = [];
  assert.equal(announceRunningDevSite({ record: { app: "Desktop", scheme: "https", port: 3456 } }, { log: (line) => lines.push(line) }), "https://localhost:3456/admin/");
  assert.deepEqual(lines, [
    "tovu dev: Running in Desktop (port 3456). https://localhost:3456/admin/",
    "tovu dev: Attached to the existing site; no new server started. Choose another site with TOVU_SITE=<site-name> npm run dev.",
  ]);
});

test("explicit dev selection scans the nested default and continues to find old-level sites", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dev-sitesnest-")));
  try {
    const repoRoot = path.join(root, "repo"); fs.mkdirSync(repoRoot);
    for (const [name, dir] of [["nested", path.join(root, "Documents", "Tovu", "sites", "nested")], ["old", path.join(root, "Documents", "Tovu", "old")]]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "config.json"), "{}"); fs.writeFileSync(path.join(dir, ".site-meta.json"), "{}");
      assert.equal(devSitesHome({ repoRoot }, { homeDir: root, env: { TOVU_SITE: name } }).dir, dir);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("stalecard: dev resolves its default in the configured home and refuses a stale themes-only fallback", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "stalecard-dev-home-")));
  try {
    const repoRoot = path.join(root, "repo"), home = path.join(root, "configured-sites");
    const stale = path.join(repoRoot, "sites", "tovu-dev"), moved = path.join(home, "tovu-dev");
    fs.mkdirSync(path.join(stale, "themes"), { recursive: true });
    fs.mkdirSync(moved, { recursive: true });
    fs.writeFileSync(path.join(moved, "config.json"), '{}');
    fs.writeFileSync(path.join(moved, ".site-meta.json"), '{}');
    const options = { homeDir: root, env: { TOVU_SITES_HOME: home } };
    assert.equal(devSitesHome({ repoRoot }, options).dir, moved);
    fs.rmSync(moved, { recursive: true });
    assert.throws(() => devSitesHome({ repoRoot }, options), /Site folder is unavailable/);
    assert.deepEqual(fs.readdirSync(stale), ['themes']);
    fs.rmSync(stale, { recursive: true });
    assert.throws(() => devSitesHome({ repoRoot }, options), /Site folder is unavailable/);
    assert.equal(fs.existsSync(stale), false);
    assert.throws(() => devSitesHome({ repoRoot }, { ...options, env: { ...options.env, TOVU_SITE_DIR: stale } }), /Site folder is unavailable/);
    assert.equal(fs.existsSync(stale), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
