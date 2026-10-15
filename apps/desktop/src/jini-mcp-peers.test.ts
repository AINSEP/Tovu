/** Regression coverage for both dependency trees that ship the jini-mcp executable. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { missingBridgePeers } from "./jini-mcp-peers.js";

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
