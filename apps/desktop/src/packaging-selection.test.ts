/** Packaging selection covers both the spawned payload and the independently collected shell. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { TmpDir } from "temp-file";
import { NpmNodeModulesCollector } from "app-builder-lib/out/node-module-collector/npmNodeModulesCollector.js";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUARD = path.resolve(DESKTOP_ROOT, "../../development/scripts/check-no-linked-jini.mjs");
const SELECTED = "@jini-ai/plugin-observability-sentry";
const UNUSED = "@jini-ai/plugin-analytics-posthog";

/** Create an installed package with real manifest metadata for npm's production collector. */
function writePackage({ directory, name, fields = {} }: {
  directory: string; name: string; fields?: Record<string, unknown>;
}): void {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name, version: "1.0.0", ...fields }));
}

test("package and every release staging path check shell and payload inputs before packaging", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, "package.json"), "utf8"));
  assert.equal(scripts.prepackage, "npm run release:inputs");
  assert.equal(scripts.prestage, "npm run release:inputs");
  assert.equal(scripts["release:inputs"],
    "node ../../development/scripts/check-no-linked-jini.mjs && cd ../.. && node development/scripts/check-no-linked-jini.mjs");
  const release = fs.readFileSync(path.resolve(DESKTOP_ROOT, "../../.github/workflows/desktop-release.yml"), "utf8");
  const stagingCommands = release.split("\n").filter((line) => line.includes("npm run stage"));
  assert.equal(stagingCommands.length, 2, "both the desktop matrix and Store build use the guarded stage entry");
});

for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
  for (const kind of ["registry", "linked", "file"] as const) {
    test(`release inputs ${kind === "registry" ? "accept" : "refuse"} ${kind} plugin in ${field}`, t => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-release-selection-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      writePackage({ directory: root, name: "tovu-desktop", fields: {
        [field]: { [SELECTED]: kind === "file" ? "file:../plugin" : "1.0.0" },
      } });
      const installed = path.join(root, "node_modules", SELECTED);
      if (kind === "linked") {
        const source = path.join(root, "plugin-source");
        writePackage({ directory: source, name: SELECTED });
        fs.mkdirSync(path.dirname(installed), { recursive: true });
        fs.symlinkSync(source, installed, "junction");
      } else {
        writePackage({ directory: installed, name: SELECTED });
      }
      const result = spawnSync(process.execPath, [GUARD], { cwd: root, encoding: "utf8", timeout: 15_000 });
      assert.equal(result.status, kind === "registry" ? 0 : 1, result.stderr);
      if (kind === "linked") assert.match(result.stderr, /npm-linked/);
      if (kind === "file") assert.match(result.stderr, /file: dependencies cannot ship/);
    });
  }
}

for (const selected of [false, true]) {
  test(`shell production collection ships ${selected ? "one selected provider" : "no optional providers"}`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-shell-selection-"));
    const temporary = new TmpDir("desktop-shell-selection");
    t.after(async () => { await temporary.cleanup(); fs.rmSync(root, { recursive: true, force: true }); });
    writePackage({ directory: root, name: "tovu-desktop", fields: {
      dependencies: { "@jini-ai/core": "1.0.0" },
      optionalDependencies: selected ? { [SELECTED]: "1.0.0" } : {},
      devDependencies: { [UNUSED]: "1.0.0" },
    } });
    // Both unused and unselected packages are installed: presence alone must not select either.
    for (const name of ["@jini-ai/core", SELECTED, UNUSED]) {
      writePackage({ directory: path.join(root, "node_modules", name), name });
    }
    const { nodeModules } = await new NpmNodeModulesCollector(root, temporary).getNodeModules({ packageName: "tovu-desktop" });
    const expected = selected ? ["@jini-ai/core", SELECTED] : ["@jini-ai/core"];
    assert.deepEqual(nodeModules.map((entry) => entry.name).sort(), expected.sort());
    // Materialize exactly the collector's shell input list, the list electron-builder copies.
    const shipped = path.join(root, "app.asar/node_modules");
    for (const entry of nodeModules) {
      const destination = path.join(shipped, entry.name);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.cpSync(entry.dir, destination, { recursive: true });
    }
    assert.deepEqual(fs.readdirSync(path.join(shipped, "@jini-ai")).sort(), expected.map((name) => name.slice("@jini-ai/".length)).sort());
  });
}
