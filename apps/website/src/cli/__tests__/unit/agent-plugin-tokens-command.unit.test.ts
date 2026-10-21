import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  bundledAgentPluginsRoot,
  defaultNewSiteAgentPluginTokenCheck,
  readAllStdin,
  runTokenSignInPluginsCommand,
} from "../../commands/agent-plugin-tokens.js";
import { bundledAgentPluginsSourceRoot, listNewSiteAgentPluginTokenSignInPlugins } from "#src/features/agent-plugins/new-site-agent-plugin-tokens";

/**
 * @file The `agent-plugin-tokens` CLI helpers that the other suites only reach through injected
 * fakes: the bundled-plugin root, the stdin reader, the default token check and the sign-in list.
 */

test("the bundled plugin root is the feature's source root", () => {
  assert.equal(bundledAgentPluginsRoot(), bundledAgentPluginsSourceRoot());
});

test("readAllStdin returns every chunk of the stream as one UTF-8 string", async () => {
  const input = new PassThrough();
  const reading = readAllStdin({ input });
  input.write('{"supa');
  input.end(Buffer.from('base":"tok-é"}'));
  assert.equal(await reading, '{"supabase":"tok-é"}');
});

test("the default token check refuses a plugin the bundled root does not provide, without probing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-token-check-"));
  try {
    const check = defaultNewSiteAgentPluginTokenCheck(root);
    assert.equal(await check({ pluginId: "not-bundled", token: "tok" }), "unsupported");
    assert.equal(await defaultNewSiteAgentPluginTokenCheck()({ pluginId: "not-a-bundled-plugin-id", token: "tok" }), "unsupported");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("token-sign-in prints the sign-in plugin list as one JSON line", async () => {
  const out: string[] = [];
  await runTokenSignInPluginsCommand(bundledAgentPluginsRoot(), { output: (message) => out.push(message) });
  assert.deepEqual(out, [`${JSON.stringify({ plugins: await listNewSiteAgentPluginTokenSignInPlugins(bundledAgentPluginsRoot()) })}\n`]);
});

test("token-sign-in defaults to the bundled root and stdout", async (t) => {
  const written: string[] = [];
  t.mock.method(process.stdout, "write", (chunk: string) => { written.push(chunk); return true; });
  await runTokenSignInPluginsCommand();
  t.mock.restoreAll();
  const expected = `${JSON.stringify({ plugins: await listNewSiteAgentPluginTokenSignInPlugins(bundledAgentPluginsRoot()) })}\n`;
  assert.equal(written.filter((chunk) => chunk === expected).length, 1, "the list is written to stdout exactly once");
});
