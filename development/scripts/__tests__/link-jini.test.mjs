import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * End-to-end test of `link-jini.mjs`: the real script is copied into a throwaway repo layout (the
 * script locates its repo from its own path, so a copy is the only way to point it at a fixture)
 * and run as a subprocess against a fake Jini packages directory. Nothing under the real checkout
 * is touched. The failure class pinned here: a consumer app whose `node_modules/@jini-ai` is left
 * on registry copies because the script's consumer list did not name it (apps/desktop once was;
 * its gates then ran against published packages and failed with ERR_PACKAGE_PATH_NOT_EXPORTED).
 */
const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeJson({ file, value }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function buildFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "link-jini-")));
  const repo = path.join(root, "repo");
  const jini = path.join(root, "Jini", "packages");
  fs.mkdirSync(path.join(repo, "development", "scripts"), { recursive: true });
  for (const name of ["link-jini.mjs", "jini-links.mjs"]) {
    fs.copyFileSync(path.join(scriptsDir, name), path.join(repo, "development", "scripts", name));
  }
  writeJson({ file: path.join(repo, "package.json"), value: { dependencies: { "@jini-ai/core": "^0.7.0" } } });
  const apps = { admin: ["core"], desktop: ["core", "platform"], "site-chat": ["core"], "later-app": ["platform"], "no-jini-app": [] };
  for (const [app, names] of Object.entries(apps)) {
    const dependencies = Object.fromEntries(names.map((name) => [`@jini-ai/${name}`, "^0.7.0"]));
    writeJson({ file: path.join(repo, "apps", app, "package.json"), value: { dependencies } });
  }
  for (const name of ["core", "platform"]) fs.mkdirSync(path.join(jini, name), { recursive: true });
  // An app that has never been installed: a registry copy must be replaced, a missing scope created.
  fs.mkdirSync(path.join(repo, "apps", "desktop", "node_modules", "@jini-ai", "platform"), { recursive: true });
  fs.writeFileSync(path.join(repo, "apps", "desktop", "node_modules", "@jini-ai", "platform", "package.json"), "{}");
  return { root, repo, jini };
}

function runLink({ repo, jini }, args = []) {
  return execFileSync(process.execPath, [path.join(repo, "development", "scripts", "link-jini.mjs"), ...args], {
    env: { ...process.env, JINI_PACKAGES_DIR: jini },
    encoding: "utf8",
  });
}

function linkTarget({ repo, app, name }) {
  const linkPath = path.join(repo, ...app, "node_modules", "@jini-ai", name);
  if (!fs.existsSync(linkPath)) return null;
  return fs.lstatSync(linkPath).isSymbolicLink() ? fs.realpathSync(linkPath) : null;
}

test("link-jini links every app that depends on @jini-ai/*, including apps/desktop and apps added later", () => {
  const fixture = buildFixture();
  try {
    runLink(fixture);
    const expected = [
      [["."], "core"],
      [["apps", "admin"], "core"],
      [["apps", "site-chat"], "core"],
      [["apps", "desktop"], "core"],
      [["apps", "desktop"], "platform"],
      [["apps", "later-app"], "platform"],
    ];
    for (const [app, name] of expected) {
      assert.equal(linkTarget({ repo: fixture.repo, app, name }), path.join(fixture.jini, name), `${app.join("/")} -> ${name}`);
    }
    assert.equal(fs.existsSync(path.join(fixture.repo, "apps", "no-jini-app", "node_modules")), false);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});

test("link-jini --dry-run changes nothing and a second run is a no-op", () => {
  const fixture = buildFixture();
  try {
    runLink(fixture, ["--dry-run"]);
    assert.equal(linkTarget({ repo: fixture.repo, app: ["apps", "desktop"], name: "core" }), null);
    assert.equal(fs.existsSync(path.join(fixture.repo, "development", ".jini-link-state.json")), false);
    runLink(fixture);
    assert.match(runLink(fixture), /\(0 link\(s\) changed\)/);
  } finally { fs.rmSync(fixture.root, { recursive: true, force: true }); }
});
