import { bundledAgentPluginsDir } from "#src/server/runtime/composition/site-paths";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  bundledAgentPluginsRoot,
  defaultNewSiteAgentPluginTokenCheck,
  readNewSiteAgentPluginTokensFromStdin,
  runTokenSignInPluginsCommand,
  storeNewSiteAgentPluginTokens,
} from "../../commands/agent-plugin-tokens.js";
import { listNewSiteAgentPluginTokenSignInPlugins } from "#src/features/agent-plugins/new-site-agent-plugin-tokens";

/**
 * @file The `agent-plugin-tokens` CLI helpers that the other suites only reach through injected
 * fakes: the bundled-plugin root, the stdin reader, the default token check and the sign-in list.
 */

test("the CLI and server share the bundled plugin source root", () => {
  assert.equal(bundledAgentPluginsRoot(), bundledAgentPluginsDir());
});

test("the default token check refuses a plugin the bundled root does not provide, without probing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-token-check-"));
  try {
    const check = defaultNewSiteAgentPluginTokenCheck({}, { sourceRoot: root });
    assert.equal(await check({ pluginId: "not-bundled", token: "tok" }), "unsupported");
    assert.equal(await defaultNewSiteAgentPluginTokenCheck({})({ pluginId: "not-a-bundled-plugin-id", token: "tok" }), "unsupported");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("token-sign-in prints the sign-in plugin list as one JSON line", async () => {
  const out: string[] = [];
  await runTokenSignInPluginsCommand({}, { sourceRoot: bundledAgentPluginsRoot(), output: ({ message }, _optional = {}) => out.push(message) });
  assert.deepEqual(out, [`${JSON.stringify({ plugins: await listNewSiteAgentPluginTokenSignInPlugins({ bundledSourceRoot: bundledAgentPluginsRoot() }) })}\n`]);
});

test("token-sign-in defaults to the bundled root and stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runTokenSignInPluginsCommand({});
  t.mock.restoreAll();
  const expected = `${JSON.stringify({ plugins: await listNewSiteAgentPluginTokenSignInPlugins({ bundledSourceRoot: bundledAgentPluginsRoot() }) })}\n`;
  assert.equal(written.filter((chunk) => chunk === expected).length, 1, "the list is written to stdout exactly once");
});

test("malformed token JSON is refused without quoting the input", async () => {
  const read = async () => '{"supabase":"fixture-token-value"';
  await assert.rejects(readNewSiteAgentPluginTokensFromStdin({}, { read }), {
    name: "ValidationError",
    message: "init: --agent-plugin-tokens-stdin expects a JSON object on stdin",
  });
});

test("a failed seal reports only plugin IDs and does not report success or retry", async () => {
  const tokens = { supabase: "fixture-value-one", resend: "fixture-value-two" };
  const lines: string[] = [];
  const calls: unknown[] = [];
  await storeNewSiteAgentPluginTokens({ site: { dir: "/fixture/created-site", siteId: "site-key-7" }, tokens }, {
    seal: async input => { calls.push(input); throw new Error("seal failed with fixture-value-one"); },
    write: line => { lines.push(line); },
  });
  assert.deepEqual(calls, [{ siteDir: "/fixture/created-site", siteKeyId: "site-key-7", tokens }]);
  assert.deepEqual(lines, ["agent-plugin-tokens: failed supabase,resend\n"]);
});
