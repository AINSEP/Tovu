import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Wiring proof that `agent-daemon-server.ts` builds its `RouteDeps` through
 * `createAgentDaemonRouteDeps`, the composition whose outbox is enqueue-only (2026-09-14).
 *
 * The behavior itself (a daemon drain claims nothing, and the serving process delivers the rows) is
 * proven against the real factories in
 * `server/__tests__/integration/agent-daemon-outbox-event-loss.integration.test.ts`. This file only
 * pins that the daemon entry point actually uses that composition. It reads the SOURCE because
 * importing the script boots the whole daemon (see
 * `agent-daemon-installs-unhandled-rejection-guard.unit.test.ts` for the same reasoning).
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

/** Code lines only: the file's doc comments name the bypassing factories in prose. */
const CODE_LINES = DAEMON_ENTRY_SOURCE.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

test("agent-daemon-server.ts builds routeDeps with createAgentDaemonRouteDeps", () => {
  assert.match(
    DAEMON_ENTRY_SOURCE,
    /import\s*\{[^}]*\bcreateAgentDaemonRouteDeps\b[^}]*\}\s*from\s*["'][^"']*agent-daemon-deps(\.js)?["']/,
  );
  assert.ok(
    CODE_LINES.some((line) => /^\s*const routeDeps\s*=\s*createAgentDaemonRouteDeps\(/.test(line)),
    "the daemon's module-level routeDeps must come from createAgentDaemonRouteDeps",
  );
});

test("agent-daemon-server.ts never calls a RouteDeps factory directly, which would bypass the enqueue-only outbox", () => {
  const bypasses = CODE_LINES.filter((line) => /\b(createSqliteRouteDepsForWorkspace|createSqliteRouteDeps|createRouteDeps)\(/.test(line));
  assert.deepEqual(bypasses, []);
});

test("agent-daemon-server.ts starts no outbox drain of its own", () => {
  const drains = CODE_LINES.filter((line) => /\b(startOutboxDrainer|processOutbox|createServingApp)\(/.test(line));
  assert.deepEqual(drains, []);
});
