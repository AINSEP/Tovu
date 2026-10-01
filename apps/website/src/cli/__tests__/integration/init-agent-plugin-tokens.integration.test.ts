import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { ValidationError } from "#src/platform/site-dir/errors";
import { readNewSiteTokensFromStdin } from "../../commands/agent-plugin-tokens.js";
import { readSiteDir } from "#src/platform/site-dir/read-site-dir";
import { runInitCommand } from "../../commands/init.js";

/**
 * @file `tovu init --agent-plugin-tokens-stdin` (2026-09-29): the desktop app's "Create website"
 * path for the optional "Connect services" tokens. Same rules as the admin's create route.
 *
 * Outcome Matrix:
 *   stdin not JSON / wrong shape         -> ValidationError, no site
 *   a token the vendor rejects           -> ValidationError (plain message), no site, no seal
 *   no token typed ({} / blanks)          -> site created exactly as before, nothing sealed, no token line
 *   an accepted token                    -> site created, sealed with the NEW site's id, "saved" line
 *   sealing fails after the create        -> site kept, "failed" line, no throw
 *   Postgres sealed from stdin + tokens   -> ValidationError (one stdin cannot carry both)
 */

let parent: string;
let stdout: string[];
const realWrite = process.stdout.write.bind(process.stdout);

before(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "init-agent-plugin-tokens-"));
});

after(() => {
  process.stdout.write = realWrite;
  fs.rmSync(parent, { recursive: true, force: true });
});

function captureStdout(): void {
  stdout = [];
  process.stdout.write = ((chunk: string) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
}

function restoreStdout(): string {
  process.stdout.write = realWrite;
  return stdout.join("");
}

test("stdin that is not a JSON object of plugin ids to strings is refused", async () => {
  await assert.rejects(readNewSiteTokensFromStdin(async () => "sbp_plain"), (err: unknown) => err instanceof ValidationError && /expects a JSON object/.test(err.message));
  await assert.rejects(readNewSiteTokensFromStdin(async () => "[1]"), (err: unknown) => err instanceof ValidationError && /must map plugin ids/.test(err.message));
  assert.deepEqual(await readNewSiteTokensFromStdin(async () => '{"supabase":"  "}'), {});
});

test("a rejected token creates no site and seals nothing", async () => {
  const dir = path.join(parent, "rejected");
  const sealed: unknown[] = [];
  await assert.rejects(
    runInitCommand({
      dir,
      agentPluginTokensStdin: true,
      readAgentPluginTokens: async () => '{"supabase":"sbp_bad"}',
      checkAgentPluginToken: async () => "invalid",
      sealAgentPluginTokens: async (input) => void sealed.push(input),
    }),
    (err: unknown) => err instanceof ValidationError && /That Supabase access token didn't work\..*No site was created\./.test(err.message),
  );
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(sealed, []);
});

test("no token typed: the site is created as before, nothing is checked or sealed, no token line", async () => {
  const dir = path.join(parent, "empty");
  const sealed: unknown[] = [];
  const checked: unknown[] = [];
  captureStdout();
  try {
    await runInitCommand({
      dir,
      agentPluginTokensStdin: true,
      readAgentPluginTokens: async () => '{"supabase":""}',
      checkAgentPluginToken: async (input) => (checked.push(input), "ok"),
      sealAgentPluginTokens: async (input) => void sealed.push(input),
    });
  } finally {
    const out = restoreStdout();
    assert.match(out, /created site '/);
    assert.doesNotMatch(out, /agent-plugin-tokens:/);
  }
  assert.ok(fs.existsSync(path.join(dir, ".site-meta.json")));
  assert.deepEqual(checked, []);
  assert.deepEqual(sealed, []);
});

test("an accepted token is sealed with the new site's own id and reported as saved", async () => {
  const dir = path.join(parent, "accepted");
  const sealed: { siteDir: string; siteKeyId: string; tokens: Readonly<Record<string, string>> }[] = [];
  captureStdout();
  let out = "";
  try {
    await runInitCommand({
      dir,
      agentPluginTokensStdin: true,
      readAgentPluginTokens: async () => '{"supabase":" sbp_good "}',
      checkAgentPluginToken: async () => "ok",
      sealAgentPluginTokens: async (input) => void sealed.push(input),
    });
  } finally {
    out = restoreStdout();
  }
  const meta = JSON.parse(fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8")) as { siteId?: string };
  assert.equal(sealed.length, 1);
  assert.equal(sealed[0]!.siteKeyId, meta.siteId);
  assert.deepEqual(sealed[0]!.tokens, { supabase: "sbp_good" });
  assert.match(out, /^agent-plugin-tokens: saved supabase$/m);
  assert.ok(!out.includes("sbp_good"), "stdout must never carry a token");
});

test("a seal failure after the create keeps the site and reports failed without the token", async () => {
  const dir = path.join(parent, "seal-failed");
  let sealCalls = 0;
  let out = "";
  captureStdout();
  try {
    await runInitCommand({
      dir,
      agentPluginTokensStdin: true,
      readAgentPluginTokens: async () => '{"supabase":"sbp_secret"}',
      checkAgentPluginToken: async () => "ok",
      sealAgentPluginTokens: async () => {
        sealCalls += 1;
        throw new Error("keychain locked sbp_secret");
      },
    });
  } finally {
    out = restoreStdout();
  }
  assert.equal(sealCalls, 1);
  assert.ok(fs.existsSync(path.join(dir, ".site-meta.json")));
  assert.equal(readSiteDir({ dir }).config.name, "seal-failed");
  assert.match(out, /^created site '/m);
  assert.match(out, /^agent-plugin-tokens: failed supabase$/m);
  assert.doesNotMatch(out, /sbp_secret|keychain locked/);
});

test("a Postgres connection string read from stdin cannot share stdin with tokens", async () => {
  await assert.rejects(
    runInitCommand({ dir: path.join(parent, "pg"), storage: "postgres", agentPluginTokensStdin: true }),
    (err: unknown) => err instanceof ValidationError && /cannot share stdin/.test(err.message),
  );
});
