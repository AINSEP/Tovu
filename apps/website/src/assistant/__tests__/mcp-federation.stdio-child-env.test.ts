import assert from "node:assert/strict";
import test from "node:test";

import { buildMcpChildEnv } from "../mcp-federation/adapter.stdio.js";

/**
 * @file Tests for `buildMcpChildEnv`, the pure half of `spawnMcpStdioChannel`: exactly which
 * environment a federated MCP child process receives.
 *
 * The contract has one fixed part and two win32-only additions. On every platform the child gets
 * the explicit allowlist plus its connection's own `env`, and nothing else from the parent — most of
 * all never `TOVU_AGENT_DAEMON_TOKEN`. On win32 only, the child also gets the handful of
 * non-secret variables Windows programs need to start at all, and — when the child is this very
 * process's own executable — the `ELECTRON_RUN_AS_NODE` mode this process itself runs in.
 */

const ELECTRON_EXE = "C:\\Program Files\\Tovu\\Tovu.exe";

/** A parent environment carrying every variable any branch reads, plus two that must never leak. */
function parentEnv(): NodeJS.ProcessEnv {
  return {
    PATH: "/usr/bin",
    HOME: "/home/op",
    TMPDIR: "/tmp",
    TOVU_AGENT_DAEMON_TOKEN: "daemon-secret",
    HTTPS_PROXY: "http://user:pass@proxy",
    ELECTRON_RUN_AS_NODE: "1",
    SystemRoot: "C:\\Windows",
    windir: "C:\\Windows",
    ComSpec: "C:\\Windows\\system32\\cmd.exe",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    USERPROFILE: "C:\\Users\\Op",
    APPDATA: "C:\\Users\\Op\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\Op\\AppData\\Local",
    TEMP: "C:\\Users\\Op\\AppData\\Local\\Temp",
    TMP: "C:\\Users\\Op\\AppData\\Local\\Temp",
  };
}

test("on POSIX the child env is exactly PATH/HOME/TMPDIR plus the connection env, nothing else", () => {
  for (const platform of ["darwin", "linux"] as const) {
    const env = buildMcpChildEnv({
      command: ELECTRON_EXE,
      specEnv: { API_KEY: "k" },
      platform,
      parentEnv: parentEnv(),
      execPath: ELECTRON_EXE,
    });
    assert.deepEqual(env, { PATH: "/usr/bin", HOME: "/home/op", TMPDIR: "/tmp", API_KEY: "k" }, platform);
  }
});

test("on win32 the child also inherits the non-secret variables Windows programs need to start", () => {
  const env = buildMcpChildEnv({
    command: "C:\\tools\\server.exe",
    specEnv: {},
    platform: "win32",
    parentEnv: parentEnv(),
    execPath: ELECTRON_EXE,
  });
  assert.deepEqual(env, {
    PATH: "/usr/bin",
    HOME: "/home/op",
    TMPDIR: "/tmp",
    SystemRoot: "C:\\Windows",
    windir: "C:\\Windows",
    ComSpec: "C:\\Windows\\system32\\cmd.exe",
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    USERPROFILE: "C:\\Users\\Op",
    APPDATA: "C:\\Users\\Op\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\Op\\AppData\\Local",
    TEMP: "C:\\Users\\Op\\AppData\\Local\\Temp",
    TMP: "C:\\Users\\Op\\AppData\\Local\\Temp",
  });
  // A child that is NOT this executable never receives this process's Electron run mode.
  assert.equal(Object.hasOwn(env, "ELECTRON_RUN_AS_NODE"), false);
  assert.equal(Object.hasOwn(env, "TOVU_AGENT_DAEMON_TOKEN"), false);
  assert.equal(Object.hasOwn(env, "HTTPS_PROXY"), false);
});

test("on win32 a child that is this process's own executable runs in the same ELECTRON_RUN_AS_NODE mode", () => {
  const env = buildMcpChildEnv({
    // Different case and a redundant segment: Windows paths compare case-insensitively.
    command: "c:\\program files\\tovu\\.\\TOVU.EXE",
    specEnv: {},
    platform: "win32",
    parentEnv: parentEnv(),
    execPath: ELECTRON_EXE,
  });
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(Object.hasOwn(env, "TOVU_AGENT_DAEMON_TOKEN"), false);
});

test("on win32 the run mode is not invented when this process does not itself run as node", () => {
  const parent = parentEnv();
  delete parent.ELECTRON_RUN_AS_NODE;
  const env = buildMcpChildEnv({ command: ELECTRON_EXE, specEnv: {}, platform: "win32", parentEnv: parent, execPath: ELECTRON_EXE });
  assert.equal(Object.hasOwn(env, "ELECTRON_RUN_AS_NODE"), false);
});

test("the connection's own env overrides an inherited variable of the same name", () => {
  const env = buildMcpChildEnv({
    command: "C:\\tools\\server.exe",
    specEnv: { TEMP: "D:\\scratch" },
    platform: "win32",
    parentEnv: parentEnv(),
    execPath: ELECTRON_EXE,
  });
  assert.equal(env.TEMP, "D:\\scratch");
});

test("empty or absent parent values are not inherited", () => {
  const env = buildMcpChildEnv({
    command: "C:\\tools\\server.exe",
    specEnv: {},
    platform: "win32",
    parentEnv: { PATH: "", SystemRoot: "C:\\Windows" },
    execPath: ELECTRON_EXE,
  });
  assert.deepEqual(env, { SystemRoot: "C:\\Windows" });
});
