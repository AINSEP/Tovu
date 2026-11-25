import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { resolveAppVersion, resolveJiniVersion, runningVersionFrom } from "../build-constants.js";

/** A read port over an in-memory file map; a missing file throws like readFileSync. */
function filesReader(files: Record<string, unknown>): (file: string, encoding: "utf8") => string {
  return (file) => {
    if (!(file in files)) throw Object.assign(new Error(`ENOENT ${file}`), { code: "ENOENT" });
    return JSON.stringify(files[file]);
  };
}

test("TOVU_VERSION wins over TOVU_IMAGE_TAG; the image tag loses its leading v", () => {
  assert.equal(runningVersionFrom({ TOVU_VERSION: " 1.4.0 ", TOVU_IMAGE_TAG: "v9.9.9" }), "1.4.0");
  assert.equal(runningVersionFrom({ TOVU_IMAGE_TAG: "v2.0.1" }), "2.0.1");
  assert.equal(runningVersionFrom({ TOVU_VERSION: "  " }), null);
});

test("app version: env precedence first, then the running build's manifest, then its package.json", () => {
  const read = filesReader({ [path.join("/app", "runtime-manifest.json")]: { tovuVersion: "3.1.0" }, [path.join("/app", "package.json")]: { version: "0.1.0" } });
  assert.equal(resolveAppVersion({ env: { TOVU_VERSION: "1.4.0", TOVU_IMAGE_TAG: "v9.9.9" }, productRoot: "/app" }, { read }), "1.4.0");
  assert.equal(resolveAppVersion({ env: { TOVU_IMAGE_TAG: "v9.9.9" }, productRoot: "/app" }, { read }), "9.9.9");
  assert.equal(resolveAppVersion({ env: {}, productRoot: "/app" }, { read }), "3.1.0");
  const sourceOnly = filesReader({ [path.join("/app", "package.json")]: { version: "0.1.0" } });
  assert.equal(resolveAppVersion({ env: {}, productRoot: "/app" }, { read: sourceOnly }), "0.1.0");
  assert.equal(resolveAppVersion({ env: {}, productRoot: "/app" }, { read: filesReader({}) }), "unknown");
});

test("jini version is the resolved core package's own manifest, not a nested or unrelated package.json", () => {
  const entry = path.join("/x", "node_modules", "@jini-ai", "core", "dist", "errors", "reporter.js");
  const read = filesReader({
    [path.join("/x", "node_modules", "@jini-ai", "core", "dist", "package.json")]: { type: "module" },
    [path.join("/x", "node_modules", "@jini-ai", "core", "package.json")]: { name: "@jini-ai/core", version: "0.7.3-next.2" },
    [path.join("/x", "package.json")]: { name: "tovu", version: "0.1.0", dependencies: { "@jini-ai/core": "^0.6.0" } },
  });
  assert.equal(resolveJiniVersion({ coreEntry: entry }, { read }), "0.7.3-next.2");
  assert.equal(resolveJiniVersion({ coreEntry: entry }, { read: filesReader({}) }), "unknown");
});

test("jini version from the core package this host actually resolves", () => {
  const coreEntry = createRequire(import.meta.url).resolve("@jini-ai/core/errors/reporter");
  let dir = path.dirname(coreEntry);
  while (!existsSync(path.join(dir, "package.json")) || !readFileSync(path.join(dir, "package.json"), "utf8").includes('"name": "@jini-ai/core"')) dir = path.dirname(dir);
  const installed = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { version: string }).version;
  assert.equal(resolveJiniVersion({ coreEntry }, { read: readFileSync }), installed);
});
