/** Owner-approved folder-install plan: command shape, explicit consent and byte-only authoring. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runPluginInstallCommand } from "../../commands/plugin/install.js";
import { runPluginIntegrityCommand } from "../../commands/plugin/integrity.js";
import { createProgram } from "../../program.js";
import { InMemoryPluginActivationRepo } from "../../../features/plugin-runtime/repo.memory.js";
import { mapErrorToCliOutcome } from "../../errors.js";
import { PluginInstallError } from "../../../features/plugin-runtime/install.js";

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
    const manifestFile = path.join(sourceDir, "tovu.plugin.json");
    await writeFile(manifestFile, JSON.stringify({ id: "cli-test", name: "CLI Test", version: "1.0.0", sdkRange: "*", tier: "tier-3", engine: 1, capabilities: [], hooks: [], fields: [], integrity: {} }));
    await runPluginIntegrityCommand({ dir: sourceDir, write: true }, { output: () => {} });
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    assert.match(manifest.integrity["server/index.mjs"], /^sha256-[a-f0-9]{64}$/);
    let closed = 0; let asked = 0; const messages: string[] = [];
    const repo = new InMemoryPluginActivationRepo();
    const task = runPluginInstallCommand({ dir: sourceDir, yes: kind === "yes" }, {
      open: async () => ({ deps: { installDir, builtInIds: [], repo }, close: async () => { closed++; } }),
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
