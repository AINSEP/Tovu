/** Regression coverage for both dependency trees that ship the jini-mcp executable. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { missingBridgePeers } from "./jini-mcp-peers.js";
import { declaredDependencies, findPackageDir, isExcluded } from "./stage-payload-lib.ts";

const BRIDGE_PEERS = ["@modelcontextprotocol/sdk", "@cfworker/json-schema"];
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Reads the resolved package instead of assuming its package.json is exported or lives in dist. */
function installedMcpManifest(): { name: string; peerDependencies: Record<string, string> } {
  let directory = path.dirname(fileURLToPath(import.meta.resolve("@jini-ai/mcp")));
  while (!fs.existsSync(path.join(directory, "package.json"))) {
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, "cannot find the installed @jini-ai/mcp package.json");
    directory = parent;
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  assert.equal(manifest.name, "@jini-ai/mcp");
  return manifest;
}

test("both packaged bridge consumers declare the installed MCP runtime peers", () => {
  const installed = installedMcpManifest();
  const required = BRIDGE_PEERS.filter((peer) => Object.hasOwn(installed.peerDependencies, peer));
  assert.deepEqual(required, BRIDGE_PEERS, "the installed @jini-ai/mcp must declare both bridge peers");

  for (const filename of ["package.json", "apps/desktop/package.json"]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, filename), "utf8"));
    const missing = missingBridgePeers({ manifest, required });
    for (const peer of required) {
      assert.equal(
        missing.includes(peer),
        false,
        `${filename} does not declare ${peer}; the packaged jini-mcp bridge imports it and npm never installs an optional peer`,
      );
    }
  }
});

test("missingBridgePeers accepts explicit production declarations", () => {
  const manifest = { dependencies: {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@cfworker/json-schema": "^4.1.1",
  } };
  assert.deepEqual(missingBridgePeers({ manifest, required: BRIDGE_PEERS }), []);
});

test("missingBridgePeers reports the absent peer even when it is a dev dependency", () => {
  const manifest = {
    dependencies: { "@modelcontextprotocol/sdk": "^1.29.0" },
    devDependencies: { "@cfworker/json-schema": "^4.1.1" },
  };
  assert.deepEqual(missingBridgePeers({ manifest, required: BRIDGE_PEERS }), ["@cfworker/json-schema"]);
});

test("missingBridgePeers reports all peers in required order when dependencies are absent", () => {
  assert.deepEqual(missingBridgePeers({ manifest: {}, required: BRIDGE_PEERS }), [
    "@modelcontextprotocol/sdk", "@cfworker/json-schema",
  ]);
});

/** Exercise staging's edge policy on the fixture without depending on the host install.
 * @complexity O(packages + edges × ancestor depth) filesystem reads; each directory is visited once. */
function packagedJiniDirectories({ hostDirectory }: { hostDirectory: string }): string[] {
  const seen = new Set<string>();
  const queue = [fs.realpathSync(hostDirectory)];
  const jini: string[] = [];
  while (queue.length > 0) {
    const directory = queue.pop()!; // The loop guard proves the queue is nonempty.
    if (seen.has(directory)) continue;
    seen.add(directory);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    if (manifest.name?.startsWith("@jini-ai/")) jini.push(directory);
    for (const dependency of declaredDependencies(directory).filter((name) => !isExcluded(name))) {
      const resolved = findPackageDir(directory, dependency);
      assert.ok(resolved, `${directory} cannot resolve packaged dependency ${dependency}`);
      queue.push(resolved);
    }
  }
  return jini;
}

test("packaged peer discovery follows transitive and required peer edges, but not development or optional peers", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-runtime-peers-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const packages = {
    "": { name: "host", dependencies: { carrier: "1" }, devDependencies: { "@jini-ai/dev-only": "1" } },
    "node_modules/carrier": { name: "carrier", dependencies: { "@jini-ai/transitive": "1" } },
    "node_modules/@jini-ai/transitive": { name: "@jini-ai/transitive", peerDependencies: { "@jini-ai/required": "1", "@jini-ai/opt-in": "1" },
      peerDependenciesMeta: { "@jini-ai/opt-in": { optional: true } } },
    "node_modules/@jini-ai/required": { name: "@jini-ai/required", dependencies: { carrier: "1" } },
    "node_modules/@jini-ai/dev-only": { name: "@jini-ai/dev-only" },
    "node_modules/@jini-ai/opt-in": { name: "@jini-ai/opt-in" },
  };
  for (const [relative, manifest] of Object.entries(packages)) {
    const directory = path.join(root, relative);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
  }
  // macOS temp paths can enter via /var and resolve through /private/var; compare canonical paths.
  assert.deepEqual(packagedJiniDirectories({ hostDirectory: root }).map((directory) => fs.realpathSync(directory)).sort(),
    ["required", "transitive"].map((name) => fs.realpathSync(path.join(root, "node_modules", "@jini-ai", name))).sort());
});

// The server is staged from the root manifest into Resources/tovu. Desktop chat boot wiring is
// paused in main.ts, so the Electron main process does not load Codex isolation.
test("the packaged server declares the optional Codex isolation parser", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const directory = findPackageDir(REPO_ROOT, "@jini-ai/daemon");
  assert.ok(directory, "the packaged server uses @jini-ai/daemon");
  const daemon = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const isolation = fs.readFileSync(path.join(directory, "dist/agent-executor/codex/isolation.js"), "utf8");
  // Pin the actual lazy load without scanning unrelated adapters or requiring the parser installed.
  assert.equal(daemon.peerDependenciesMeta["smol-toml"].optional, true);
  assert.match(isolation, /createRequire\(import\.meta\.url\)\(['"]smol-toml['"]\)/);
  assert.deepEqual(missingBridgePeers({ manifest, required: ["smol-toml"] }), [], "package.json");
  assert.equal(manifest.dependencies["smol-toml"], "^1.9.1");
});

test("the default payload document extractors declare production parser ranges", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  // Both extractors are registered by server/runtime/composition/deps.ts and load via injection.
  // Declaration checks must work before the coordinator regenerates the lockfile and installs.
  assert.deepEqual(missingBridgePeers({ manifest, required: ["mammoth", "unpdf"] }), []);
  assert.equal(manifest.dependencies.mammoth, "^1.12.3");
  assert.equal(manifest.dependencies.unpdf, "^1.8.1");
});
