import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runDeployConfigCommand } from "../../../../../apps/website/src/cli/commands/deploy-config.ts";

/**
 * @file Moved from core (`apps/website/src/cli/__tests__/unit/deploy-config-command.unit.test.ts`)
 * into the Fly plugin: `tovu deploy config --target fly` in-process over the real bundled plugins.
 * Core's CLI tests now run against a neutral `example-host` fixture generator; these pin Fly's own
 * output and its region refusal through the CLI.
 */

function capture() {
  const out = []; const err = [];
  return { out, err, ports: { env: {}, stdout: (m) => { out.push(m); }, stderr: (m) => { err.push(m); } } };
}

test("renders the fly config to stdout and its operator notes to stderr", async () => {
  const io = capture();
  await runDeployConfigCommand({ target: "fly", region: "ams" }, io.ports);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0], /ams/);
  assert.ok(io.err.every((line) => line.startsWith("tovu deploy config: ")));
});

test("--out writes the rendered fly.toml and reports where", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-out-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const io = capture();
  const outPath = path.join(dir, "fly.toml");
  await runDeployConfigCommand({ target: "fly", region: "ams", out: outPath }, io.ports);
  const written = await readFile(outPath, "utf8");
  assert.ok(written.length > 0);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0], new RegExp(`^tovu deploy config: wrote \\S+ \\(fly\\) to ${outPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n$`));
});

test("without --region the generator receives an empty region and fly refuses to assume one", async () => {
  const io = capture();
  await assert.rejects(runDeployConfigCommand({ target: "fly" }, io.ports), { name: "ValidationError", message: /--region is required for --target fly/ });
  assert.deepEqual(io.out, []);
});
