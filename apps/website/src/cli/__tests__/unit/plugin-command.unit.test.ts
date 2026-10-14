import { pluginHostBinding } from "#src/features/plugin-runtime/host-binding";
/** Owner-approved folder-install plan: command shape, explicit consent and byte-only authoring. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runPluginInstallCommand } from "../../commands/plugin/install.js";
import { runPluginIntegrityCommand } from "../../commands/plugin/integrity.js";
import { createProgram } from "../../program.js";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import { mapErrorToCliOutcome } from "../../errors.js";
import { PluginInstallError } from "@jini-ai/plugins/host/node";

test("plugin group declares install folder, site, yes, replace and integrity write", () => {
  const group = createProgram().commands.find((c) => c.name() === "plugin");
  assert.ok(group);
  const install = group.commands.find((c) => c.name() === "install");
  assert.ok(install);
  for (const flag of ["--site", "--yes", "--replace"]) assert.ok(install.options.some((o) => o.long === flag));
  assert.ok(group.commands.find((c) => c.name() === "integrity")?.options.some((o) => o.long === "--write"));
  assert.match(mapErrorToCliOutcome(new PluginInstallError("PLUGIN_CONSENT_REQUIRED", "review required")).stderrLine!, /PLUGIN_CONSENT_REQUIRED/);
});

for (const kind of ["cancel", "yes", "changed"] as const) {
  test(`CLI install ${kind}: real disk, no import, closes store`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "plugin-cli-")); t.after(() => rm(root, { recursive: true, force: true }));
    const sourceDir = path.join(root, "source"); const installDir = path.join(root, "plugins");
    await mkdir(path.join(sourceDir, "server"), { recursive: true });
    await writeFile(path.join(sourceDir, "server/index.mjs"), "throw new Error('must never run during install');");
    const manifestFile = path.join(sourceDir, "jini.plugin.json");
    await writeFile(path.join(sourceDir, "tovu.plugin.json"), JSON.stringify({ id: "cli-test", name: "CLI Test", version: "1.0.0", sdkRange: "*", tier: "tier-3", engine: 1, capabilities: [], hooks: [], fields: [], integrity: {} })); // legacy alias
    await runPluginIntegrityCommand({ dir: sourceDir, write: true }, { output: () => {} });
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    assert.match(manifest.integrity["server/index.mjs"], /^sha256-[a-f0-9]{64}$/);
    let closed = 0; let asked = 0; const messages: string[] = [];
    const repo = new InMemoryPluginActivationRepo();
    const task = runPluginInstallCommand({ dir: sourceDir, yes: kind === "yes" }, {
      open: async () => ({ deps: { ...pluginHostBinding, installDir, builtInIds: [], repo, conflicts: async () => [] }, close: async () => { closed++; } }),
      write: (message) => { messages.push(message); },
      confirm: async () => {
        asked++;
        if (kind === "changed") { manifest.name = "Changed after consent"; await writeFile(manifestFile, JSON.stringify(manifest)); return true; }
        return false;
      },
    });
    if (kind === "changed") await assert.rejects(task, { code: "PLUGIN_CHANGED_SINCE_PREVIEW" }); else await task;
    assert.equal(closed, 1); assert.equal(asked, kind === "yes" ? 0 : 1);
    assert.ok(messages[0]?.includes("full access to this computer"));
    assert.deepEqual(await readdir(installDir).catch(() => []), kind === "yes" ? ["cli-test"] : []);
    assert.deepEqual(await repo.listAll(), []);
  });
}

for (const filename of ["jini.plugin.json", "tovu.plugin.json"]) { // legacy alias
  test(`integrity reads ${filename} and writes only the canonical manifest`, async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), "plugin-integrity-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const original = JSON.stringify({ id: "integrity-test", integrity: {} });
    await writeFile(path.join(dir, filename), original);
    const code = "throw new Error('integrity must never import this');";
    await writeFile(path.join(dir, "index.mjs"), code);
    const output: string[] = [];
    await runPluginIntegrityCommand({ dir, write: true }, { output: (message) => { output.push(message); } });
    const expected = { "index.mjs": `sha256-${createHash("sha256").update(code).digest("hex")}` };
    assert.deepEqual(JSON.parse(output.join("")), expected);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, "jini.plugin.json"), "utf8")), { id: "integrity-test", integrity: expected });
    if (filename === "tovu.plugin.json") assert.equal(await readFile(path.join(dir, filename), "utf8"), original); // legacy alias
    else await assert.rejects(readFile(path.join(dir, "tovu.plugin.json")), { code: "ENOENT" }); // legacy alias
  });
}

test("integrity prefers the canonical manifest and never falls back from malformed canonical JSON", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "plugin-integrity-precedence-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const canonical = path.join(dir, "jini.plugin.json");
  const legacy = path.join(dir, "tovu.plugin.json"); // legacy alias
  const originalLegacy = JSON.stringify({ id: "legacy", integrity: {} });
  await writeFile(legacy, originalLegacy);
  await writeFile(canonical, JSON.stringify({ id: "canonical", integrity: {} }));
  await runPluginIntegrityCommand({ dir, write: true }, { output: () => {} });
  assert.deepEqual(JSON.parse(await readFile(canonical, "utf8")), { id: "canonical", integrity: {} });
  assert.equal(await readFile(legacy, "utf8"), originalLegacy);
  await writeFile(canonical, "{malformed");
  await assert.rejects(runPluginIntegrityCommand({ dir, write: true }, { output: () => {} }), SyntaxError);
  assert.equal(await readFile(canonical, "utf8"), "{malformed");
  assert.equal(await readFile(legacy, "utf8"), originalLegacy);
});
