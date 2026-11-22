import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, chmod, symlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { planAgentInstall, type AgentSlug } from "@jini-ai/mcp";
import { installOwnedJsonAgent } from "@jini-ai/mcp";
import { nodeAtomicWriter, nodeFileLock } from "@jini-ai/node-adapters/fs";

async function fixture(t: test.TestContext, agentId: AgentSlug = "antigravity") {
  const home = await mkdtemp(join(tmpdir(), "tovu-owned-mcp-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const required = { agentId, allowed: true, files: { fileLock: nodeFileLock, writer: nodeAtomicWriter }, spec: { command: "node", args: ["/bridge/serve.js"], env: {} as Record<string,string> },
    ctx: { home, platform: "linux" as const, serverName: "jini" } };
  const plan = planAgentInstall({ ...required, slug: agentId });
  if (plan.kind !== "json") throw new Error("Expected JSON installer");
  const configPath = plan.configPath;
  async function existing(text: string) { await mkdir(dirname(configPath), { recursive: true }); await writeFile(configPath, text, { mode: 0o640 }); await chmod(configPath, 0o640); }
  return { required, file: configPath, existing };
}
for (const agentId of ["antigravity", "cursor"] as const) {
  test(`${agentId}: missing config is installed only after explicit consent`, async t => {
    const { required, file } = await fixture(t, agentId);
    await assert.rejects(installOwnedJsonAgent({ ...required, allowed: false }), /Allow/);
    assert.deepEqual(await readdir(required.ctx.home), []);
    await installOwnedJsonAgent(required);
    assert.equal(JSON.parse(await readFile(file, "utf8")).mcpServers.jini.command, "node");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  });
}
test("approved repair preserves other servers, unrelated settings, file mode and backup", async t => {
  const f = await fixture(t);
  const original = JSON.stringify({ mcpServers: { other: { command: "keep" } }, theme: "dark" }); await f.existing(original);
  await installOwnedJsonAgent(f.required);
  const installed = JSON.parse(await readFile(f.file, "utf8"));
  assert.deepEqual(installed.mcpServers.other, { command: "keep" }); assert.equal(installed.theme, "dark");
  assert.equal((await stat(f.file)).mode & 0o777, 0o640);
  assert.equal(await readFile(`${f.file}.jini-backup`, "utf8"), original);
});
test("an already valid entry requires consent and is not rewritten", async t => {
  const f = await fixture(t); const original = JSON.stringify({ mcpServers: { jini: { command: f.required.spec.command, args: f.required.spec.args } } }); await f.existing(original);
  await assert.rejects(installOwnedJsonAgent({ ...f.required, allowed: false }), /Allow/);
  await installOwnedJsonAgent(f.required); assert.equal(await readFile(f.file,"utf8"), original);
});
test("foreign stale or disabled jini entry is retained rather than overwritten", async t => {
  const f = await fixture(t); const original = JSON.stringify({ mcpServers: { jini: { command: "foreign", disabled: true } } }); await f.existing(original);
  await assert.rejects(installOwnedJsonAgent(f.required), /already has an MCP server named "jini" that this app did not add/);
  assert.equal(await readFile(f.file, "utf8"), original);
});
test("a jini entry an older install wrote (old node_modules path) is replaced after a backup", async t => {
  const f = await fixture(t);
  const original = JSON.stringify({ mcpServers: { other: { command: "keep" }, jini: { command: "/Applications/Old.app/Contents/MacOS/Old",
    args: ["/Users/u/old/app/node_modules/@jini-ai/mcp/dist/bin/serve.js"], env: { ELECTRON_RUN_AS_NODE: "1" } } } });
  await f.existing(original);
  await installOwnedJsonAgent(f.required);
  assert.deepEqual(JSON.parse(await readFile(f.file, "utf8")).mcpServers, { other: { command: "keep" }, jini: { command: "node", args: ["/bridge/serve.js"] } });
  assert.equal(await readFile(`${f.file}.jini-backup`, "utf8"), original);
});
test("the static Electron switch is safe to persist after Allow", async t => {
  const f = await fixture(t); f.required.spec.env = { ELECTRON_RUN_AS_NODE: "1" };
  await installOwnedJsonAgent(f.required);
  assert.deepEqual(JSON.parse(await readFile(f.file, "utf8")).mcpServers.jini.env, f.required.spec.env);
});
for (const key of ["JINI_RUN_ID", "JINI_DAEMON_URL", "JINI_DAEMON_TOKEN", "JINI_MESSAGE_RELAY_NONCE", "SECRET"]) {
  test(`planned ${key} values are refused before any config write`, async t => {
    const f = await fixture(t); f.required.spec.env = { [key]: "per-run-private" };
    await assert.rejects(installOwnedJsonAgent(f.required), error => { assert.doesNotMatch(String(error), /per-run-private/); return true; });
    assert.deepEqual(await readdir(f.required.ctx.home), []);
  });
}
test("invalid JSON is left untouched", async t => {
  const f = await fixture(t); await f.existing("{invalid");
  await assert.rejects(installOwnedJsonAgent(f.required), /not valid JSON/);
  assert.equal(await readFile(f.file,"utf8"), "{invalid");
});
test("symlink config is refused and target remains unchanged", async t => {
  const f = await fixture(t); await mkdir(dirname(f.file), { recursive: true });
  const target = join(f.required.ctx.home, "target"); await writeFile(target, "{}"); await symlink(target, f.file);
  await assert.rejects(installOwnedJsonAgent(f.required), /symlink/); assert.equal(await readFile(target,"utf8"), "{}");
});
