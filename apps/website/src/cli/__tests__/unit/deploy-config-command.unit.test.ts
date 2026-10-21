import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { deployConfigTargetOptionHelp, runDeployConfigCommand } from "../../commands/deploy-config.js";

/**
 * @file `tovu deploy config` in-process over the real bundled hosting plugins (and a throwaway
 * plugin root for refusals), with stdout/stderr/env injected instead of read from the process.
 */

function capture() {
  const out: string[] = []; const err: string[] = [];
  return { out, err, ports: { env: {}, stdout: (m: string) => { out.push(m); }, stderr: (m: string) => { err.push(m); } } };
}

test("renders the fly config to stdout and its operator notes to stderr", async () => {
  const io = capture();
  await runDeployConfigCommand({ target: "fly", region: "ams" }, io.ports);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0]!, /ams/);
  assert.ok(io.err.every((line) => line.startsWith("tovu deploy config: ")));
});

test("--out writes the rendered file and reports where", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-out-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const io = capture();
  const outPath = path.join(dir, "fly.toml");
  await runDeployConfigCommand({ target: "fly", region: "ams", out: outPath }, io.ports);
  const written = await readFile(outPath, "utf8");
  assert.ok(written.length > 0);
  assert.equal(io.out.length, 1);
  assert.match(io.out[0]!, new RegExp(`^tovu deploy config: wrote \\S+ \\(fly\\) to ${outPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n$`));
});

test("without --region the generator receives an empty region and fly refuses to assume one", async () => {
  const io = capture();
  await assert.rejects(runDeployConfigCommand({ target: "fly" }, io.ports), { name: "ValidationError", message: /--region is required for --target fly/ });
  assert.deepEqual(io.out, []);
});

test("a missing or unknown --target is refused with the loaded ids", async () => {
  const io = capture();
  await assert.rejects(runDeployConfigCommand({}, io.ports), { name: "ValidationError", message: '--target must be one of: fly, railway, render (got "")' });
  await assert.rejects(runDeployConfigCommand({ target: "heroku" }, io.ports), { name: "ValidationError", message: /\(got "heroku"\)$/ });
  assert.deepEqual(io.out, []);
});

test("a refused generator is explained on stderr before the target is rejected", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-refusal-")); t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "broken"));
  await writeFile(path.join(root, "broken", "plugin.json"), JSON.stringify({ name: "broken", version: "1.0.0" }));
  await writeFile(path.join(root, "broken", "tovu-deploy-configs.json"), JSON.stringify({ schemaVersion: 1, generators: [{ id: "broken", label: "Broken", module: "gen.mjs" }] }));
  await writeFile(path.join(root, "broken", "gen.mjs"), "export const notRender = 1;\n");
  const io = capture();
  await assert.rejects(runDeployConfigCommand({ target: "broken" }, { ...io.ports, env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: root } }), { name: "ValidationError" });
  assert.equal(io.err.length, 1);
  assert.match(io.err[0]!, /^tovu deploy config: deploy config 'broken' from 'broken' was not loaded: /);
});

test("--target help degrades to the generic text when the plugin root cannot be read", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "tovu-deploy-config-help-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const notADirectory = path.join(dir, "file");
  await writeFile(notADirectory, "x");
  assert.equal(deployConfigTargetOptionHelp({ env: { TOVU_BUNDLED_AGENT_PLUGINS_DIR: notADirectory } }), "deploy platform id declared by bundled plugins");
});

test("by default the rendered config goes to stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  const errors: string[] = [];
  t.mock.method(process.stderr, "write", (chunk: string) => { errors.push(chunk); return true; });
  try {
    await runDeployConfigCommand({ target: "fly", region: "ams" });
  } finally { t.mock.restoreAll(); }
  assert.ok(written.some((chunk) => chunk.includes("ams")));
});
