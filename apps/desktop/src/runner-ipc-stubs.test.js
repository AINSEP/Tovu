/**
 * @file Coverage for `runner-ipc-stubs.js`.
 *
 * Two jobs. The behavioural one: prove every stub REJECTS rather than resolving — a stub that
 * quietly returned `[]` or `null` would render as real, correct, empty state, which is the exact
 * failure mode this module exists to prevent.
 *
 * The drift one: `runner-ipc-stubs.js` inlines its channel literals because it is CommonJS
 * main-process code and the contracts are TypeScript (see that file's header). This test parses
 * `src/contracts/*.ts` for the real `RUNNER_*_CHANNELS` object literals and compares both
 * directions, so renaming a channel in a contract, or adding a new verb to one, fails here instead
 * of at runtime inside Electron.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { registerRunnerIpcStubs, notPortedError, RUNNER_STUB_CHANNELS, RUNNER_MAIN_NOT_PORTED } from "./runner-ipc-stubs.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACTS_DIR = path.join(__dirname, "contracts");

/**
 * Channels declared by `src/contracts/*.ts`, minus the two push-only ones.
 *
 * Reads the `'runner:...'` string literals straight out of the contract sources rather than
 * importing them: these are `.ts` files with no compiled output guaranteed to exist at test time.
 * The match is anchored on the `runner:` prefix the whole IPC surface shares, so a channel added
 * to any contract file is picked up with no change here.
 */
function declaredChannels() {
  const found = new Set();
  for (const entry of fs.readdirSync(CONTRACTS_DIR)) {
    if (!entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(CONTRACTS_DIR, entry), "utf8");
    for (const match of source.matchAll(/'(runner:[a-z-]+(?::[a-z-]+)+)'/g)) found.add(match[1]);
  }
  // Main->renderer sends, not `invoke` targets: there is no handler to register for either, so
  // `runner-ipc-stubs.js` deliberately omits them.
  found.delete("runner:chat:event");
  found.delete("runner:chat:navigate");
  return found;
}

/**
 * Channels the Projects screen needs for real, given real handlers in `project-ipc.js` (registered
 * in `main.js` before `registerRunnerIpcStubs` runs) — see `RUNNER_PROJECT_CHANNELS`'s own doc.
 * Declared by the contracts, on purpose absent from `RUNNER_STUB_CHANNELS`: a real handler and a
 * stub for the same channel is a duplicate `ipcMain.handle` registration, which Electron itself
 * refuses. `stop` stays stubbed — no control in the per-project bar calls it yet — so it is NOT in
 * this list.
 */
const IMPLEMENTED_CHANNELS = new Set([
  "runner:projects:list",
  "runner:projects:create",
  "runner:projects:delete",
  "runner:projects:open-external",
  "runner:projects:start",
  "runner:projects:rescan",
  "runner:projects:add-site",
]);

test("the contract sources really do declare channels (the parse is not silently matching nothing)", () => {
  assert.ok(declaredChannels().size >= 20, `expected 20+ parsed channels, got ${declaredChannels().size}`);
});

test("every channel the contracts declare has a stub or a real handler", () => {
  const missing = [...declaredChannels()].filter(
    (channel) => !RUNNER_STUB_CHANNELS.includes(channel) && !IMPLEMENTED_CHANNELS.has(channel),
  );
  assert.deepEqual(missing, []);
});

test("every stubbed channel is declared by a contract", () => {
  const declared = declaredChannels();
  const orphaned = RUNNER_STUB_CHANNELS.filter((channel) => !declared.has(channel));
  assert.deepEqual(orphaned, []);
});

test("no channel is both stubbed and implemented for real", () => {
  const both = RUNNER_STUB_CHANNELS.filter((channel) => IMPLEMENTED_CHANNELS.has(channel));
  assert.deepEqual(both, []);
});

test("the two push-only channels are NOT stubbed", () => {
  assert.equal(RUNNER_STUB_CHANNELS.includes("runner:chat:event"), false);
  assert.equal(RUNNER_STUB_CHANNELS.includes("runner:chat:navigate"), false);
});

test("registerRunnerIpcStubs registers one handler per channel", () => {
  const registered = new Map();
  const returned = registerRunnerIpcStubs({ ipcMain: { handle: (c, l) => registered.set(c, l) } });

  assert.deepEqual([...registered.keys()], [...RUNNER_STUB_CHANNELS]);
  assert.deepEqual(returned, RUNNER_STUB_CHANNELS);
});

test("every registered handler throws rather than returning any value", () => {
  const registered = new Map();
  registerRunnerIpcStubs({ ipcMain: { handle: (c, l) => registered.set(c, l) } });

  for (const [channel, handler] of registered) {
    assert.throws(handler, (error) => {
      assert.equal(error.code, RUNNER_MAIN_NOT_PORTED);
      assert.equal(error.channel, channel);
      assert.match(error.message, new RegExp(`^${RUNNER_MAIN_NOT_PORTED}: ${channel} has no main-process implementation yet\\.`));
      return true;
    }, `handler for ${channel} did not throw`);
  }
});

test("notPortedError names the channel it was built for, not a shared one", () => {
  assert.notEqual(
    notPortedError("runner:projects:list").message,
    notPortedError("runner:projects:stop").message,
  );
});
