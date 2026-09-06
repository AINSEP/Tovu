import assert from "node:assert/strict";
import test from "node:test";

import { buildDaemonSpawnArgs, isDaemonProcessForWorkspace } from "../daemon-supervisor.js";

/**
 * @file Regression coverage for the identity-before-kill gap the 2026-09-05 desktop multi-site
 * parity audit found: `spawnRealDaemonProcessFor` used to spawn byte-identical argv
 * (`[daemonPath]`/`["tsx", daemonPath]`) for every daemon instance, so a pid recovered from a future
 * persisted-registry reconciler could never be proven to still belong to a particular workspace —
 * Tovu-Runner's own `isProjectSidecar` technique (an argv-substring match) had nothing to match
 * against. `buildDaemonSpawnArgs` adds the missing discriminating token; `isDaemonProcessForWorkspace`
 * is the matching proof, mirroring `isProjectSidecar`'s shape.
 */

test("buildDaemonSpawnArgs appends a --workspace token naming the daemon's own workspace", () => {
  const args = buildDaemonSpawnArgs({ daemonPath: "/repo/agent-daemon-server.ts", workspaceId: "workspace-7" });
  assert.deepEqual(args, ["/repo/agent-daemon-server.ts", "--workspace", "workspace-7"]);
});

test("isDaemonProcessForWorkspace confirms a live process's argv names the expected workspace", () => {
  const commandLine = "node /repo/dist/agent-daemon-server.js --workspace workspace-7";
  assert.equal(isDaemonProcessForWorkspace(commandLine, "workspace-7"), true);
});

test("isDaemonProcessForWorkspace refuses a different workspace's argv, even with a matching prefix", () => {
  const commandLine = "node /repo/dist/agent-daemon-server.js --workspace workspace-70";
  // "workspace-70" contains "workspace-7" as a substring — the match must require the token's own
  // trailing boundary (the literal `--workspace ` prefix plus an exact value), not a loose `includes`
  // on the id alone, or a pid legitimately reused by a DIFFERENT, similarly-named workspace would be
  // misidentified as this one.
  assert.equal(isDaemonProcessForWorkspace(commandLine, "workspace-7"), false);
});

test("isDaemonProcessForWorkspace refuses argv with no --workspace token at all", () => {
  assert.equal(isDaemonProcessForWorkspace("node /repo/dist/agent-daemon-server.js", "workspace-7"), false);
});
