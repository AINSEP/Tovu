import assert from "node:assert/strict";
import test from "node:test";

import { createStderrTail, describeChildExit, keepStderrTail, resolveStdioChildCwd, spawnMcpStdioChannel } from "../mcp-federation/adapter.stdio.js";

/**
 * @file A stdio MCP server that dies at startup must say WHY in its close reason.
 *
 * 2026-09-29: the dev roster's `namecom` row (`npx -y namecom-mcp@latest`) exited with code 1 on
 * every daemon boot. npm printed the cause (`EUNSUPPORTEDPROTOCOL` — see the cwd tests below) to
 * stderr; the adapter discarded stderr, so the admissions report carried only "child process exited
 * (code=1, signal=null)" and the admin told the owner to restart — which re-ran the same failure. The reason
 * reaches the admin UI, so the child's own env values (the row's unsealed credentials) must never
 * appear in it.
 */

test("describeChildExit: appends what the child last printed, whitespace-collapsed", () => {
  assert.equal(
    describeChildExit(1, null, "\nError: Invalid NAME_API_URL provided: https://api.dev.name.com\n\n  Please use one of the supported endpoints\n", []),
    "child process exited (code=1, signal=null): Error: Invalid NAME_API_URL provided: https://api.dev.name.com Please use one of the supported endpoints",
  );
});

test("describeChildExit: a silent child keeps the exact pre-existing reason", () => {
  assert.equal(describeChildExit(1, null, "  \n", []), "child process exited (code=1, signal=null)");
  assert.equal(describeChildExit(null, "SIGTERM", "", ["secret-value"]), "child process exited (code=null, signal=SIGTERM)");
});

test("describeChildExit: redacts every env value the child was spawned with, wherever it appears", () => {
  const reason = describeChildExit(1, null, "auth failed for user leona with token tok_live_abc123 (tok_live_abc123)", [
    "leona",
    "tok_live_abc123",
  ]);
  assert.equal(reason, "child process exited (code=1, signal=null): auth failed for user [redacted] with token [redacted] ([redacted])");
});

test("describeChildExit: does not shred the message over a value too short to be a credential", () => {
  assert.equal(describeChildExit(1, null, "port 1 is in use", ["1"]), "child process exited (code=1, signal=null): port 1 is in use");
});

test("keepStderrTail: keeps only the most recent output, so a chatty server cannot grow the reason unbounded", () => {
  let tail = "";
  for (let index = 0; index < 1_000; index += 1) tail = keepStderrTail(tail, `line ${index}\n`);
  assert.equal(tail.length, 600);
  assert.ok(tail.endsWith("line 999\n"));
});

test("spawnMcpStdioChannel: a real child that dies at startup closes with its stderr, secrets redacted", async () => {
  const channel = spawnMcpStdioChannel({
    command: process.execPath,
    args: [
      "-e",
      "console.error('Error: Invalid NAME_API_URL provided: ' + process.env.NAME_API_URL + ' token=' + process.env.NAME_TOKEN); process.exit(1);",
    ],
    env: { NAME_API_URL: "https://api.dev.name.com", NAME_TOKEN: "abcd-secret-token-9999" },
    launchEnv: {},
  });

  const reason = await new Promise<string>((resolve) => channel.onClose(resolve));

  assert.match(reason, /^child process exited \(code=1, signal=null\): Error: Invalid NAME_API_URL provided: \[redacted\] token=\[redacted\]$/);
  assert.ok(!reason.includes("abcd-secret-token-9999"));
});

test("spawnMcpStdioChannel: send after the child exited throws instead of writing into a dead pipe", async () => {
  const channel = spawnMcpStdioChannel({ command: process.execPath, args: ["-e", "process.exit(3)"], env: {}, launchEnv: {} });

  await new Promise<string>((resolve) => channel.onClose(resolve));

  assert.throws(() => channel.send("{}"), /cannot write to a closed stdio channel/);
});

// The failure the stderr tail above uncovered: `npx` run in the daemon's cwd (this repo's root) read
// the local project tree and died with EUNSUPPORTEDPROTOCOL on a linked package's `workspace:*`.
test("resolveStdioChildCwd: a package runner with no configured cwd runs in the neutral directory, not the daemon's", () => {
  const launch = { command: "npx", args: ["-y", "namecom-mcp@latest"], env: {}, launchEnv: {} };
  assert.equal(resolveStdioChildCwd(launch, "/neutral"), "/neutral");
  assert.equal(resolveStdioChildCwd({ ...launch, command: "/usr/local/bin/npx" }, "/neutral"), "/neutral");
  assert.equal(resolveStdioChildCwd({ ...launch, command: "C:/Program Files/nodejs/npx.cmd" }, "/neutral"), "/neutral");
});

test("resolveStdioChildCwd: an explicit cwd always wins, even for a package runner", () => {
  assert.equal(resolveStdioChildCwd({ command: "npx", args: [], cwd: "/srv/project", env: {}, launchEnv: {} }, "/neutral"), "/srv/project");
});

test("resolveStdioChildCwd: every other command keeps inheriting the daemon's cwd, exactly as before", () => {
  assert.equal(resolveStdioChildCwd({ command: "./bin/server", args: [], env: {}, launchEnv: {} }, "/neutral"), undefined);
  assert.equal(resolveStdioChildCwd({ command: process.execPath, args: ["server.js"], env: {}, launchEnv: {} }, "/neutral"), undefined);
  assert.equal(resolveStdioChildCwd({ command: "uvx", args: ["some-server"], env: {}, launchEnv: {} }, "/neutral"), undefined);
});

// Codex review 2026-09-29 run1 #2: the tail was cut to its last 600 characters BEFORE redaction, so
// a child printing a token followed by ~600 characters of diagnostics left the tail starting midway
// through the token — a fragment no exact-value replacement can match, served to the admin UI.
test("spawnMcpStdioChannel: a token cut by the tail limit is still redacted, not left as a fragment", async () => {
  const token = "tok_0123456789abcdef";
  const channel = spawnMcpStdioChannel({
    command: process.execPath,
    args: ["-e", "process.stderr.write('token=' + process.env.TOKEN + ' ' + 'x'.repeat(595)); process.exit(1);"],
    env: { TOKEN: token },
    launchEnv: {},
  });

  const reason = await new Promise<string>((resolve) => channel.onClose(resolve));

  for (let start = 0; start + 4 <= token.length; start += 1) {
    assert.ok(!reason.includes(token.slice(start)), `reason leaks "${token.slice(start)}": ${reason}`);
  }
});

test("createStderrTail: a token split across chunks and cut by the limit leaves no fragment behind", () => {
  const token = "tok_0123456789abcdef";
  const tail = createStderrTail([token]);
  tail.append("token=tok_01234");
  tail.append(`56789abcdef ${"x".repeat(595)}`);
  const text = tail.text();
  assert.equal(text.length, 600);
  for (let start = 0; start + 4 <= token.length; start += 1) assert.ok(!text.includes(token.slice(start)), text);
});

test("createStderrTail: a token still arriving when the child exits is redacted too", () => {
  const tail = createStderrTail(["tok_0123456789abcdef"]);
  tail.append("auth failed: tok_0123456789abcdef");
  assert.equal(tail.text(), "auth failed: [redacted]");
  const partial = createStderrTail(["tok_0123456789abcdef"]);
  partial.append("auth failed: tok_0123456789");
  assert.equal(partial.text(), "auth failed: tok_0123456789");
});
