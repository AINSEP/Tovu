/**
 * @file Coverage for `root-key-boot-guard.ts` — the shell's boot-time root-key check.
 *
 * The defect being prevented is a DELAY, not a wrong value: before this guard the app booted
 * normally with no root key and said nothing until the first credentialed action failed, hours
 * later, with an opaque error. So the properties pinned here are mostly about WHEN and WHERE, not
 * about what a key is:
 *
 *  1. the check runs at install time (boot), not lazily on the first renderer request;
 *  2. what the renderer is shown is the BOOT snapshot, even if the environment changes after;
 *  3. a missing key produces a loud, actionable log AND is served to the UI — neither alone;
 *  4. a present key produces neither;
 *  5. nothing here ever throws, so a broken key cannot stop the app from starting;
 *  6. no key value reaches the log or the IPC payload.
 *
 * Every dependency is injected — no real `ipcMain`, no real `console`, no real filesystem.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { installRootKeyBootGuard } from "./root-key-boot-guard.ts";
import { ROOT_KEY_CHANNELS } from "./contracts/root-key.ts";
import type { RootKeyBootStatus } from "./root-key-status.ts";

const KEY_FILE = "/fake/home/.tovu/integrations-root-key.hex";

function missing(): RootKeyBootStatus {
  return { present: false, source: "none", keyFilePath: KEY_FILE, envVarName: "TOVU_INTEGRATIONS_ROOT_KEY" };
}

function corrupt(): RootKeyBootStatus {
  return {
    present: false,
    source: "file",
    invalid: true,
    reason: "too-short",
    keyFilePath: KEY_FILE,
    envVarName: "TOVU_INTEGRATIONS_ROOT_KEY",
  };
}

function healthy(): RootKeyBootStatus {
  return {
    present: true,
    source: "env",
    fingerprint: "0123456789ab",
    keyFilePath: KEY_FILE,
    envVarName: "TOVU_INTEGRATIONS_ROOT_KEY",
  };
}

/** A recording stand-in for the two things the guard touches. */
function harness(status: RootKeyBootStatus, options: { inspect?: () => RootKeyBootStatus } = {}) {
  const handlers = new Map<string, () => unknown>();
  const logged: string[] = [];
  let inspectCalls = 0;
  return {
    handlers,
    logged,
    inspectCalls: () => inspectCalls,
    deps: {
      ipcMain: {
        handle(channel: string, listener: () => unknown) {
          if (handlers.has(channel)) throw new Error(`duplicate handler for ${channel}`);
          handlers.set(channel, listener);
        },
      },
      inspect:
        options.inspect ??
        (() => {
          inspectCalls += 1;
          return status;
        }),
      log: (line: string) => logged.push(line),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 1 + 2 — at boot, and pinned to boot
// ---------------------------------------------------------------------------------------------

test("the check runs during install, before anything asks for it", () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  assert.equal(h.inspectCalls(), 1, "a lazily-checked key is the bug this guard exists to remove");
});

test("the renderer is served the BOOT snapshot, not a fresh read", async () => {
  let current = missing();
  const h = harness(missing(), { inspect: () => current });
  installRootKeyBootGuard(h.deps);

  // The operator sets a key in some other process AFTER boot. Site servers this shell already
  // spawned still inherited the empty environment, so the warning must not silently clear itself.
  current = healthy();

  const served = (await h.handlers.get(ROOT_KEY_CHANNELS.status)?.()) as RootKeyBootStatus;
  assert.equal(served.present, false);
});

test("installing does not check again per request", async () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  await h.handlers.get(ROOT_KEY_CHANNELS.status)?.();
  await h.handlers.get(ROOT_KEY_CHANNELS.status)?.();
  assert.equal(h.inspectCalls(), 1);
});

test("the status channel is registered under the contract's own name", () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  assert.deepEqual([...h.handlers.keys()], ["runner:root-key:status"]);
  assert.equal(ROOT_KEY_CHANNELS.status, "runner:root-key:status");
});

// ---------------------------------------------------------------------------------------------
// 3 + 4 — loud when missing, silent when fine, and BOTH surfaces every time
// ---------------------------------------------------------------------------------------------

test("a missing key is logged loudly at boot", () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  assert.notEqual(h.logged.length, 0, "a missing root key must not boot silently");
});

test("the log names the cause, the env var, the key file, and the launcher that fixes it", () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  const text = h.logged.join("\n");
  assert.match(text, /TOVU_INTEGRATIONS_ROOT_KEY/);
  assert.ok(text.includes(KEY_FILE), "the log must name where a key file would live");
  assert.match(text, /npm run desktop/, "the log must name the launcher that loads .env");
  assert.match(text, /repo root/i, "`npm run desktop` only works from the repo root — say so");
  assert.match(text, /root key/i);
});

test("a corrupt key says what is wrong with it, not just that one is missing", () => {
  const h = harness(corrupt());
  installRootKeyBootGuard(h.deps);
  const text = h.logged.join("\n");
  assert.match(text, /too-short|too short/i);
  assert.ok(text.includes(KEY_FILE));
});

test("a healthy key logs nothing at all", () => {
  const h = harness(healthy());
  installRootKeyBootGuard(h.deps);
  assert.deepEqual(h.logged, [], "a false alarm would train the operator to ignore the real one");
});

test("a healthy key is still served to the renderer, so the UI can stay quiet on purpose", async () => {
  const h = harness(healthy());
  installRootKeyBootGuard(h.deps);
  const served = (await h.handlers.get(ROOT_KEY_CHANNELS.status)?.()) as RootKeyBootStatus;
  assert.equal(served.present, true);
});

test("a missing key reaches BOTH surfaces — the log alone is what already failed", async () => {
  const h = harness(missing());
  installRootKeyBootGuard(h.deps);
  const served = (await h.handlers.get(ROOT_KEY_CHANNELS.status)?.()) as RootKeyBootStatus;
  assert.equal(served.present, false, "the renderer must be able to show this");
  assert.notEqual(h.logged.length, 0, "and the terminal must say it too");
});

// ---------------------------------------------------------------------------------------------
// 5 — never blocks the boot
// ---------------------------------------------------------------------------------------------

test("a check that throws is swallowed and reported, never propagated", () => {
  const h = harness(missing(), {
    inspect: () => {
      throw new Error("boom");
    },
  });
  const status = installRootKeyBootGuard(h.deps);
  assert.equal(status.present, false);
  assert.notEqual(h.logged.length, 0);
});

test("a log sink that throws cannot take the boot down with it", () => {
  const handlers = new Map<string, () => unknown>();
  const status = installRootKeyBootGuard({
    ipcMain: { handle: (c: string, l: () => unknown) => void handlers.set(c, l) },
    inspect: missing,
    log: () => {
      throw new Error("no stderr");
    },
  });
  assert.equal(status.present, false);
  assert.equal(handlers.has(ROOT_KEY_CHANNELS.status), true, "the UI surface must survive a dead log");
});

test("install returns the snapshot so a caller can act on it without a second read", () => {
  const h = harness(healthy());
  const status = installRootKeyBootGuard(h.deps);
  assert.equal(status.present, true);
  assert.equal(status.fingerprint, "0123456789ab");
});

// ---------------------------------------------------------------------------------------------
// 6 — the secret invariant
// ---------------------------------------------------------------------------------------------

test("a present key's log and payload carry a fingerprint at most, never a key", async () => {
  const h = harness(healthy());
  installRootKeyBootGuard(h.deps);
  const served = (await h.handlers.get(ROOT_KEY_CHANNELS.status)?.()) as RootKeyBootStatus;
  assert.equal(Object.hasOwn(served, "hex"), false);
  assert.equal(Object.hasOwn(served, "value"), false);
  assert.equal(h.logged.join("\n").includes("0123456789ab"), false, "boot logs nothing for a good key");
});
