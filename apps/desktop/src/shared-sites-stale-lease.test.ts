import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createNodeDurableJsonPorts } from "@jini-ai/platform/fs";
import { attachRunningSite, createSitesWorkspace } from "./shared-sites.ts";

test("opening a site after its previous app died recovers an invalid lease without asking for repair", t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-stale-lease-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "site"); fs.mkdirSync(dir);
  const native = createNodeDurableJsonPorts({});
  const workspace = createSitesWorkspace({}, { env: {}, homeDir: root, appDataDir: path.join(root, "profile"), sourceRoots: [],
    ports: { ...native, process: { pid: process.pid, isAlive: ({ pid }) => pid === process.pid } },
  });
  fs.writeFileSync(path.join(dir, ".tovu-running.json"), JSON.stringify({
    pid: process.pid + 100000, port: -1, scheme: "file", app: "Web", started: "2026-11-02T00:00:00Z", token: "dead-owner",
  }));
  assert.equal(attachRunningSite({ workspace, dir }), null);
  const claim = workspace.claim({ path: dir, app: "Desktop", port: 3456 });
  assert.equal(claim.acquired, true);
  workspace.running({ path: dir }).release({ token: claim.record.token });
});

test("an invalid live address never instructs the user to repair a lease", () => {
  const workspace = { running: () => ({ read: () => ({ scheme: "file", port: -1, pid: process.pid, app: "Web", token: "live" }) }) } as unknown as Parameters<typeof attachRunningSite>[0]["workspace"];
  assert.throws(() => attachRunningSite({ workspace, dir: "/fixture" }), {
    message: "Invalid running site address. Waiting for the owning app to publish a valid address.",
  });
});
