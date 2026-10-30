import assert from "node:assert/strict";
import test from "node:test";
import { dirname } from "node:path";
import { getAgentDef } from "@jini-ai/agent-runtime";
import { planAgentInstall, verifyJsonAgentInstall, type AgentSlug } from "@jini-ai/mcp";
import { ensureJsonAgentInstall, type JsonAgentInstallFilesystem } from "../ensure-json-agent-install.js";
import { captureDaemonRun } from "./helpers/daemon-source.js";

const launch = { command: "node", args: ["/bridge/serve.js"], env: {} };
const ctx = { home: "/home/daemon-test", platform: "linux" as const, serverName: "jini" };

/** In-memory filesystem: exclusive temporary writes, rename publication and restrictive umask. */
function fakeFilesystem(
  { agentId = "antigravity", text, mode = 0o640 }: { agentId?: AgentSlug; text?: string; mode?: number },
  { writeError, renameError, readError }: { writeError?: Error; renameError?: Error; readError?: Error } = {},
) {
  const plan = planAgentInstall({ slug: agentId, spec: launch, ctx });
  assert.equal(plan.kind, "json");
  if (plan.kind !== "json") throw new Error("Expected JSON installer");
  const files = new Map<string, { text: string; mode: number }>();
  if (text !== undefined) files.set(plan.configPath, { text, mode });
  const writes: { path: string; contents: string; mode: number }[] = [];
  const operations: string[] = [];
  const missing = () => Object.assign(new Error("missing"), { code: "ENOENT" });
  const fs: JsonAgentInstallFilesystem = {
    readFile: async ({ path }) => {
      operations.push(`read:${path}`);
      if (readError) throw readError;
      const file = files.get(path);
      if (!file) throw missing();
      return file.text;
    },
    stat: async ({ path }) => {
      const file = files.get(path);
      if (!file) throw missing();
      return { mode: file.mode };
    },
    mkdir: async ({ path }) => { operations.push(`mkdir:${path}`); },
    writeFile: async (input) => {
      writes.push(input);
      if (writeError) throw writeError;
      if (files.has(input.path)) throw Object.assign(new Error("exists"), { code: "EEXIST" });
      files.set(input.path, { text: input.contents, mode: input.mode & ~0o027 });
    },
    chmod: async ({ path, mode }) => {
      const file = files.get(path);
      assert.ok(file);
      file.mode = mode;
    },
    rename: async ({ from, to }) => {
      if (renameError) throw renameError;
      const file = files.get(from);
      assert.ok(file);
      assert.equal(dirname(from), dirname(to));
      files.set(to, file);
      files.delete(from);
      operations.push(`rename:${to}`);
    },
    remove: async ({ path }) => { files.delete(path); },
  };
  return { fs, files, writes, operations, configPath: plan.configPath };
}

/** Exercise the actual daemon continuation with the real recovery helper and only fake fs I/O. */
function launchRun(
  { fs, agentId = "antigravity" }: { fs: JsonAgentInstallFilesystem; agentId?: AgentSlug },
  _optional = {},
) {
  return captureDaemonRun({ prompt: "Hello" }, {
    request: { agentId },
    bindings: {
      bridgeInjection: launch,
      process: { env: {}, platform: ctx.platform, cwd: () => "/site" },
      // A second def using the same delivery contract proves recovery is independent of CLI id.
      getAgentDef: () => ({ ...getAgentDef({ id: "antigravity" }), id: agentId, externalMcpInjection: "env-passthrough" }),
      ensureJsonAgentInstall: (required: Parameters<typeof ensureJsonAgentInstall>[0]) => ensureJsonAgentInstall(required, fs),
      // Keep the pre-fix verification seam real: missing entries must fail before recovery exists.
      verifyJsonAgentInstall,
      readFile: (path: string) => fs.readFile({ path }),
    },
  });
}

for (const agentId of ["antigravity", "cursor"] as const) {
  test(`${agentId}: missing config is installed atomically and the run proceeds after verification`, async () => {
    const fixture = fakeFilesystem({ agentId });
    const input = await launchRun({ fs: fixture.fs, agentId });
    assert.equal(input.agentId, agentId);
    const installed = fixture.files.get(fixture.configPath);
    assert.ok(installed);
    assert.deepEqual(JSON.parse(installed.text).mcpServers.jini.command, launch.command);
    assert.deepEqual(JSON.parse(installed.text).mcpServers.jini.args, launch.args);
    assert.equal(installed.mode, 0o600);
    assert.equal(fixture.files.size, 1);
    assert.equal(fixture.writes.length, 1);
    assert.notEqual(fixture.writes[0]!.path, fixture.configPath);
    assert.ok(fixture.operations.includes(`mkdir:${dirname(fixture.configPath)}`));
    assert.deepEqual(fixture.operations.slice(-2), [`rename:${fixture.configPath}`, `read:${fixture.configPath}`]);
  });
}

test("repair preserves other servers, unrelated settings and existing file permissions", async () => {
  const existing = { mcpServers: { other: { command: "other-bridge", env: { PRIVATE: "keep" } } }, theme: "dark" };
  const fixture = fakeFilesystem({ text: JSON.stringify(existing), mode: 0o660 });
  await launchRun({ fs: fixture.fs });
  const installed = fixture.files.get(fixture.configPath)!;
  const parsed = JSON.parse(installed.text);
  assert.deepEqual(parsed.mcpServers.other, existing.mcpServers.other);
  assert.equal(parsed.theme, existing.theme);
  assert.equal(parsed.mcpServers.jini.command, launch.command);
  assert.equal(installed.mode, 0o660);
});

test("write failure fails the run without manual commands or config values", async () => {
  const text = JSON.stringify({ mcpServers: { other: { command: "keep" } } });
  const fixture = fakeFilesystem({ text }, { writeError: new Error('private-value: Run "mcp install antigravity"') });
  await assert.rejects(launchRun({ fs: fixture.fs }), (error: Error) => {
    assert.match(error.message, /could not.*tools/i);
    assert.doesNotMatch(error.message, /mcp install|private-value/);
    return true;
  });
  assert.equal(fixture.files.get(fixture.configPath)!.text, text);
  assert.equal(fixture.files.size, 1);
});

test("an already valid entry proceeds without rewriting config", async () => {
  const text = JSON.stringify({ mcpServers: { jini: launch } });
  const fixture = fakeFilesystem({ text });
  await launchRun({ fs: fixture.fs });
  assert.equal(fixture.writes.length, 0);
  assert.equal(fixture.files.get(fixture.configPath)!.text, text);
});

test("a disabled or stale entry is repaired while retaining other servers", async () => {
  const fixture = fakeFilesystem({ text: JSON.stringify({ mcpServers: {
    other: { command: "keep" }, jini: { command: "obsolete", disabled: true, env: { JINI_DAEMON_TOKEN: "obsolete" } },
  } }) });
  await launchRun({ fs: fixture.fs });
  assert.deepEqual(JSON.parse(fixture.files.get(fixture.configPath)!.text).mcpServers, {
    other: { command: "keep" }, jini: { command: launch.command, args: launch.args },
  });
});

test("the static Electron switch is safe to persist", async () => {
  const fixture = fakeFilesystem({});
  await ensureJsonAgentInstall({ agentId: "antigravity", spec: { ...launch, env: { ELECTRON_RUN_AS_NODE: "1" } }, ctx }, fixture.fs);
  assert.deepEqual(JSON.parse(fixture.files.get(fixture.configPath)!.text).mcpServers.jini.env, { ELECTRON_RUN_AS_NODE: "1" });
});

for (const key of ["JINI_RUN_ID", "JINI_DAEMON_URL", "JINI_DAEMON_TOKEN", "JINI_MESSAGE_RELAY_NONCE", "SECRET"]) {
  test(`planned ${key} values are refused before any config write`, async () => {
    const fixture = fakeFilesystem({});
    await assert.rejects(ensureJsonAgentInstall({ agentId: "antigravity", spec: { ...launch, env: { [key]: "per-run-private" } }, ctx }, fixture.fs),
      (error: Error) => {
        assert.doesNotMatch(error.message, /per-run-private|mcp install/);
        return true;
      });
    assert.equal(fixture.writes.length, 0);
  });
}

test("invalid existing JSON is left untouched", async () => {
  const fixture = fakeFilesystem({ text: "{invalid-private-json" });
  await assert.rejects(launchRun({ fs: fixture.fs }), /could not.*tools/i);
  assert.equal(fixture.files.get(fixture.configPath)!.text, "{invalid-private-json");
  assert.equal(fixture.writes.length, 0);
});

test("read permission failure is not treated as a missing config", async () => {
  const fixture = fakeFilesystem({}, { readError: Object.assign(new Error("denied"), { code: "EACCES" }) });
  await assert.rejects(launchRun({ fs: fixture.fs }), /could not.*tools/i);
  assert.equal(fixture.writes.length, 0);
});

test("failed atomic rename preserves the original file and removes the temporary file", async () => {
  const text = JSON.stringify({ mcpServers: { other: { command: "keep" } } });
  const fixture = fakeFilesystem({ text }, { renameError: new Error("rename failed") });
  await assert.rejects(launchRun({ fs: fixture.fs }), /could not.*tools/i);
  assert.equal(fixture.files.size, 1);
  assert.equal(fixture.files.get(fixture.configPath)!.text, text);
});

test("a repair that cannot be verified still fails before executor dispatch", async () => {
  const fixture = fakeFilesystem({});
  await assert.rejects(launchRun({ fs: { ...fixture.fs, rename: async () => {} } }), /could not.*tools/i);
});
