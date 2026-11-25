import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EnvConfigError } from "@jini-ai/core/config/env-schema";
import { readTovuBootEnv } from "../env-schema.js";

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
