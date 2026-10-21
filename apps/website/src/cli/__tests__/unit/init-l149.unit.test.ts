import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInitCommand, type RunInitCommandInput } from "../../commands/init.js";

for (const flag of ["createInputStdin", "agentPluginTokensStdin"] as const) {
  test(`init refuses shared Postgres stdin for ${flag} before reading`, async () => {
    await assert.rejects(runInitCommand({ dir: "/unused", storage: "postgres", [flag]: true,
      readCreateInput: async () => assert.fail("must not read"), readAgentPluginTokens: async () => assert.fail("must not read"),
    }), { name: "ValidationError", message: `init: ${flag === "createInputStdin" ? "--create-input-stdin" : "--agent-plugin-tokens-stdin"} cannot share stdin with a Postgres connection string; use --storage-env` });
  });
}
for (const mode of ["none", "tokens", "envelope", "empty-envelope"] as const) {
  test(`init ${mode} checks before creation and seals after success output`, async t => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-l149-init-"));
    t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
    const dir = path.join(parent, "site");
    const stdout: string[] = [];
    // why: under `node --test` the runner reports to its parent over this same stdout as serialized
    // Buffer frames; swallowing them dropped sibling results and polluted `stdout`. The CLI writes strings.
    const writeThrough = process.stdout.write.bind(process.stdout) as (chunk: unknown) => boolean;
    t.mock.method(process.stdout, "write", (chunk: unknown) => typeof chunk === "string" ? (stdout.push(chunk), true) : writeThrough(chunk));
    let checked = 0, sealed = 0;
    const token = "fixture-token";
    const input: RunInitCommandInput = { dir, name: "Pinned name",
      checkAgentPluginToken: async ({ token: actual }) => {
        assert.equal(actual, token); assert.equal(fs.existsSync(dir), false); checked++; return "ok";
      },
      sealAgentPluginTokens: async ({ siteDir, tokens }) => {
        assert.equal(siteDir, dir); assert.deepEqual(tokens, { supabase: token });
        assert.deepEqual(stdout, [`created site 'Pinned name' at ${dir}\n`, `next: tovu serve ${dir}\n`]); sealed++;
      },
    };
    if (mode === "tokens") { input.agentPluginTokensStdin = true; input.readAgentPluginTokens = async () => JSON.stringify({ supabase: token }); }
    if (mode === "envelope" || mode === "empty-envelope") {
      input.createInputStdin = true;
      input.readCreateInput = async () => JSON.stringify(mode === "envelope" ? { adminPassword: "chosen-password", agentPluginTokens: { supabase: token } } : {});
    }
    await runInitCommand(input);
    const expected = mode === "tokens" || mode === "envelope" ? 1 : 0;
    assert.equal(checked, expected); assert.equal(sealed, expected);
    assert.equal(fs.existsSync(path.join(dir, "config.json")), true);
    assert.deepEqual(stdout, [`created site 'Pinned name' at ${dir}\n`, `next: tovu serve ${dir}\n`, ...(expected ? ["agent-plugin-tokens: saved supabase\n"] : [])]);
  });
}
