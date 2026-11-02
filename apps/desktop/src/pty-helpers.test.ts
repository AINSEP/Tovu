import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { packagedPtyHelperFailures } from "./pty-helpers.ts";

/** A packaged resources dir whose unpacked node-pty carries `helpers` (relative path -> mode). */
function resourcesWith(root: string, helpers: Record<string, number>): string {
  const pty = path.join(root, "app.asar.unpacked", "node_modules", "node-pty");
  for (const [rel, mode] of Object.entries(helpers)) {
    fs.mkdirSync(path.join(pty, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(pty, rel), "helper");
    fs.chmodSync(path.join(pty, rel), mode);
  }
  return root;
}

test("packaged spawn-helpers lacking execute bits are named with their mode; executable ones pass", { skip: process.platform === "win32" }, t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pty-helpers-"));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const mac = resourcesWith(path.join(scratch, "Tovu.app", "Contents", "Resources"), {
    "prebuilds/darwin-arm64/spawn-helper": 0o644,
    "prebuilds/darwin-x64/spawn-helper": 0o755,
    "prebuilds/win32-x64/pty.node": 0o644,
  });
  const helper = path.join(mac, "app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper");
  assert.deepEqual(packagedPtyHelperFailures([mac]), [`${helper} (mode 644)`]);
  fs.chmodSync(helper, 0o755);
  assert.deepEqual(packagedPtyHelperFailures([mac]), []);
});

test("a mac bundle with no spawn-helper fails; a non-mac resources dir with none passes", t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "pty-helpers-"));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const mac = path.join(scratch, "Tovu.app", "Contents", "Resources");
  const win = resourcesWith(path.join(scratch, "win-unpacked", "resources"), { "prebuilds/win32-x64/pty.node": 0o644 });
  assert.deepEqual(packagedPtyHelperFailures([mac, win]), [`no node-pty spawn-helper under ${path.join(mac, "app.asar.unpacked", "node_modules", "node-pty")}`]);
});
