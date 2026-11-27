import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnvConfigError } from "@jini-ai/core/config/env-schema";
import { declaredTovuEnvNames, readTovuBootEnv } from "../env-schema.js";

const collectWarnings = () => {
  const messages: string[] = [];
  return { messages, warn: ({ message }: { message: string }) => { messages.push(message); } };
};

describe("readTovuBootEnv", () => {
  it("a bad PORT stops boot before a listener or database is opened", () => {
    // The boot entries call this before any listener, store or child is opened, so a throw here
    // is what keeps a bad PORT from ever reaching one; it must never quietly fall back to 3000.
    for (const raw of ["abc", "0", "65536", "80.5", " "]) {
      const { warn } = collectWarnings();
      assert.throws(() => readTovuBootEnv({ env: { PORT: raw }, scope: "website", warn }), (error: unknown) => {
        assert.ok(error instanceof EnvConfigError);
        assert.match(error.message, /^PORT: /);
        if (raw.trim() !== "") assert.ok(!error.message.includes(raw), "the error must name the variable, never echo its value");
        return true;
      });
    }
    const { warn } = collectWarnings();
    assert.equal(readTovuBootEnv({ env: { PORT: "8080" }, scope: "website", warn }).PORT, 8080);
    assert.equal(readTovuBootEnv({ env: {}, scope: "website", warn }).PORT, undefined, "an unset PORT leaves the entry's own default in charge");
  });

  it("fixed-port validation preserves the daemon zero sentinel", () => {
    const { warn } = collectWarnings();
    assert.equal(readTovuBootEnv({ env: { JINI_AGENT_DAEMON_PORT: "0" }, scope: "daemon", warn }).JINI_AGENT_DAEMON_PORT, 0);
    assert.equal(readTovuBootEnv({ env: { JINI_AGENT_DAEMON_PORT: "4319" }, scope: "daemon", warn }).JINI_AGENT_DAEMON_PORT, 4319);
    assert.equal(readTovuBootEnv({ env: {}, scope: "daemon", warn }).JINI_AGENT_DAEMON_PORT, undefined);
    assert.throws(() => readTovuBootEnv({ env: { JINI_AGENT_DAEMON_PORT: "70000" }, scope: "daemon", warn }), EnvConfigError);
    assert.throws(() => readTovuBootEnv({ env: { JINI_AGENT_DAEMON_PORT: "-1" }, scope: "daemon", warn }), EnvConfigError);
    // The website listener has no allocation sentinel: a supplied fixed port is 1..65535 only.
    assert.throws(() => readTovuBootEnv({ env: { PORT: "0" }, scope: "website", warn }), EnvConfigError);
  });

  it("an old alias warns once without logging its value and canonical wins", () => {
    // No same-scope old name is verified at the boot entries today, so the alias table is injected.
    const aliases = { website: [{ canonical: "TOVU_DB", legacy: "TEST_ONLY_OLD_DB" }] };
    const oldOnly = collectWarnings();
    const fromOld = readTovuBootEnv({ env: { TEST_ONLY_OLD_DB: "memory-secret-ish" }, scope: "website", warn: oldOnly.warn }, { aliases });
    assert.equal(fromOld.TOVU_DB, "memory-secret-ish");
    assert.equal(oldOnly.messages.length, 1);
    assert.match(oldOnly.messages[0] ?? "", /TEST_ONLY_OLD_DB/);
    assert.match(oldOnly.messages[0] ?? "", /TOVU_DB/);
    assert.ok(!oldOnly.messages[0]?.includes("memory-secret-ish"), "the warning names the variable, never its value");

    const both = collectWarnings();
    const fromBoth = readTovuBootEnv({ env: { TOVU_DB: "memory", TEST_ONLY_OLD_DB: "file" }, scope: "website", warn: both.warn }, { aliases });
    assert.equal(fromBoth.TOVU_DB, "memory");
    assert.equal(both.messages.length, 1);
    assert.ok(!both.messages[0]?.includes("file\"") && !both.messages[0]?.includes(": file"));

    const neither = collectWarnings();
    readTovuBootEnv({ env: { TOVU_DB: "memory" }, scope: "website", warn: neither.warn }, { aliases });
    assert.equal(neither.messages.length, 0);
  });
});

it("the boot inventory exposes distinct website, desktop and daemon listener variables", () => {
  const names = declaredTovuEnvNames();
  assert.deepEqual(Object.fromEntries(Object.entries(names).map(([scope, vars]) => [scope, [...vars].sort()])), {
    website: ["PORT", "TOVU_CHAT_DB", "TOVU_CONTENT_DB", "TOVU_DB", "TOVU_HOST", "TOVU_PLUGINS_DIR", "TOVU_RUNNING_APP", "TOVU_START_AUTO_PORT"],
    desktop: ["TOVU_DESKTOP_CLI_MODE", "TOVU_DESKTOP_PORT", "TOVU_DESKTOP_SELFTEST", "TOVU_DESKTOP_SITE_DIR", "TOVU_DESKTOP_SITE_DIRS", "TOVU_DESKTOP_UI", "TOVU_DESKTOP_URL", "TOVU_DESKTOP_USER_DATA_DIR"],
    daemon: ["JINI_AGENT_DAEMON_PORT", "JINI_ALLOWED_ORIGINS", "JINI_BIND_HOST", "JINI_WEB_PORT", "TOVU_AGENT_DAEMON_REGISTRY_PATH", "TOVU_AGENT_DAEMON_STANDALONE", "TOVU_SITE_LISTENER_ORIGIN"],
  });
  const { warn, messages } = collectWarnings();
  const env = { PORT: "invalid for website", TOVU_DESKTOP_PORT: " 4302 ", JINI_AGENT_DAEMON_PORT: "0" };
  assert.equal(readTovuBootEnv({ env, scope: "desktop", warn }).TOVU_DESKTOP_PORT, 4302);
  assert.throws(() => readTovuBootEnv({ env: { ...env, TOVU_DESKTOP_PORT: "0" }, scope: "desktop", warn }),
    { name: "EnvConfigError", message: "TOVU_DESKTOP_PORT: must be a whole number from 1 to 65535 when set (the first desktop site's port)." });
  assert.deepEqual(messages, []);
});
