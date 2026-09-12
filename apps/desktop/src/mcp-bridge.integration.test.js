/**
 * @file End-to-end coverage for `bin/mcp-bridge.mjs` against a REAL child process over real pipes.
 *
 * The unit tests cover the protocol and the tools; none of them can catch the failures that only
 * exist once there is a process:
 *
 * - **stdout purity.** One stray byte — a banner, a `console.log`, a warning Node prints — and the
 *   client's newline framing desynchronizes for the rest of the connection. Asserted by parsing
 *   EVERY line of stdout, not just looking for the expected ones.
 * - **argv plumbing.** The userData directory reaches the bridge only through `--user-data-dir`
 *   (the daemon replaces the environment), so a mistake here makes every tool operate on the wrong
 *   registry — or on the operator's real one.
 * - **The handshake in order,** including that `notifications/initialized` produces no line at all.
 * - **Framing.** Two messages written in one chunk must be handled as two.
 *
 * The child is Node running the script directly, which is what the generated `/bin/sh` launcher
 * ends up doing (`sites-mcp-registration.js`) once `ELECTRON_RUN_AS_NODE` has made Electron's
 * binary behave as Node. The launcher itself is covered by its own unit tests; spawning a real
 * Electron here would test Electron, not this.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SITE_ORIGIN, sitesFilePath, readTrackedSites, trackSite } from "./tracked-sites.js";

const BRIDGE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "mcp-bridge.mjs");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-bridge-"));
}

function siteFixture(name = "site") {
  const dir = path.join(tempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: `id-${name}` }));
  return dir;
}

/**
 * Run the bridge, write `lines` to its stdin, and return everything it produced.
 *
 * Writes all input then closes stdin, so the child exits on its own and the test cannot hang on a
 * server waiting for more work. The bridge answers in arrival order (it serializes), so the replies
 * line up with the requests that have ids.
 */
function driveBridge(argv, lines, { env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BRIDGE_PATH, ...argv], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));

    for (const line of lines) child.stdin.write(`${line}\n`);
    child.stdin.end();
  });
}

/** Every stdout line parsed as JSON. Throws — loudly, naming the offender — on anything that is not
 *  a JSON object, which is the stdout-purity assertion. */
function parseProtocolLines(stdout) {
  return stdout
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return assert.fail(`stdout carried a non-protocol line: ${JSON.stringify(line)}`);
      }
    });
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "tovu", version: "1" } },
});
const INITIALIZED = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

test("the bridge completes the handshake and lists its tools over real pipes", async () => {
  const userDataDir = tempDir();

  const { code, stdout, stderr } = await driveBridge(
    ["--user-data-dir", userDataDir],
    [INITIALIZE, INITIALIZED, JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })],
  );

  assert.equal(code, 0, `exited ${code}: ${stderr}`);
  const messages = parseProtocolLines(stdout);
  // TWO responses, not three: the notification is not answered. This is the assertion that catches
  // a reply to `notifications/initialized`, which would wedge a real client's correlation table.
  assert.equal(messages.length, 2, `expected 2 responses, got ${messages.length}`);
  assert.deepEqual(
    messages.map((message) => message.id),
    [1, 2],
  );
  assert.equal(messages[0].result.protocolVersion, "2025-06-18");
  assert.ok(messages[1].result.tools.some((tool) => tool.name === "add_site_pointer"));
});

test("the bridge writes NOTHING but protocol to stdout", async () => {
  const userDataDir = tempDir();

  const { stdout } = await driveBridge(
    ["--user-data-dir", userDataDir],
    [INITIALIZE, INITIALIZED, "{not json at all}", JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" })],
  );

  // `parseProtocolLines` fails on any non-JSON line, so this covers banners, stray logs, and the
  // diagnostic for the malformed line above — which must go to stderr, never here.
  const messages = parseProtocolLines(stdout);
  assert.deepEqual(
    messages.map((message) => message.id),
    [1, 9],
  );
});

test("a malformed line is reported on stderr and does not end the server", async () => {
  const userDataDir = tempDir();

  const { code, stdout, stderr } = await driveBridge(
    ["--user-data-dir", userDataDir],
    ["}}} not json", JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" })],
  );

  assert.equal(code, 0);
  assert.match(stderr, /not valid JSON/);
  // The request AFTER the bad line is still answered. Exiting on a parse failure would take down
  // every working tool on behalf of one broken message.
  assert.equal(parseProtocolLines(stdout)[0].id, 3);
});

test("two messages arriving in ONE write are handled as two", async () => {
  const userDataDir = tempDir();

  const { stdout } = await driveBridge(["--user-data-dir", userDataDir], [
    `${INITIALIZE}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}`,
  ]);

  // Pipes coalesce writes, so a reader that assumed one chunk is one message would answer the first
  // and lose the second — intermittently, and only under load.
  assert.deepEqual(
    parseProtocolLines(stdout).map((message) => message.id),
    [1, 2],
  );
});

test("the bridge reads the registry named by --user-data-dir, not the real one", async () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture("scoped-site");
  trackSite(sitesFilePath(userDataDir), siteDir, SITE_ORIGIN.adopted);

  const { stdout } = await driveBridge(
    ["--user-data-dir", userDataDir],
    [INITIALIZE, INITIALIZED, JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_sites", arguments: {} } })],
  );

  const [, listed] = parseProtocolLines(stdout);
  assert.equal(listed.result.structuredContent.count, 1);
  assert.equal(listed.result.structuredContent.sites[0].siteDir, siteDir);
});

test("add_site_pointer through the real bridge writes the row the app will read", async () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture("added-via-bridge");

  const { stdout } = await driveBridge(
    ["--user-data-dir", userDataDir],
    [INITIALIZE, INITIALIZED, JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add_site_pointer", arguments: { siteDir } } })],
  );

  const [, added] = parseProtocolLines(stdout);
  assert.equal(added.result.isError, undefined);
  // Read back through `tracked-sites.js` itself — the same reader the Projects screen uses — so
  // this proves the row is consumable, not merely that the tool claimed success.
  const rows = readTrackedSites(sitesFilePath(userDataDir));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].siteDir, siteDir);
  assert.equal(rows[0].origin, SITE_ORIGIN.adopted);
});

test("add_site_pointer through the real bridge REFUSES an empty folder and initializes nothing", async () => {
  const userDataDir = tempDir();
  const empty = path.join(tempDir(), "fresh");
  fs.mkdirSync(empty);

  const { stdout } = await driveBridge(
    ["--user-data-dir", userDataDir],
    [INITIALIZE, INITIALIZED, JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "add_site_pointer", arguments: { siteDir: empty } } })],
  );

  const [, refused] = parseProtocolLines(stdout);
  assert.equal(refused.result.isError, true);
  assert.equal(refused.result.structuredContent.code, "SITE_DIR_EMPTY");
  // The whole point, proven at the outermost layer: no site was created in the operator's folder.
  assert.deepEqual(fs.readdirSync(empty), []);
  assert.deepEqual(readTrackedSites(sitesFilePath(userDataDir)), []);
});

test("the bridge refuses to start without a userData directory", async () => {
  // No argv flag AND no env var — and notably the spawn above passes only PATH/HOME/TMPDIR, which
  // is exactly what the daemon leaves in an MCP child's environment. Defaulting to the real
  // `~/Library/Application Support/tovu-desktop` here would mean a bridge nobody configured
  // quietly editing the operator's live Projects list.
  const { code, stdout, stderr } = await driveBridge([], [INITIALIZE]);

  assert.equal(code, 1);
  assert.equal(stdout, "");
  assert.match(stderr, /--user-data-dir <path> is required/);
});

test("the bridge refuses a userData directory that does not exist", async () => {
  const missing = path.join(tempDir(), "no-such-dir");

  const { code, stderr } = await driveBridge(["--user-data-dir", missing], [INITIALIZE]);

  assert.equal(code, 1);
  assert.match(stderr, /does not exist/);
});

test("the bridge accepts the userData directory from the shell's existing env override", async () => {
  const userDataDir = tempDir();

  const { code, stdout } = await driveBridge([], [INITIALIZE], { env: { TOVU_DESKTOP_USER_DATA_DIR: userDataDir } });

  assert.equal(code, 0);
  assert.equal(parseProtocolLines(stdout)[0].id, 1);
});
