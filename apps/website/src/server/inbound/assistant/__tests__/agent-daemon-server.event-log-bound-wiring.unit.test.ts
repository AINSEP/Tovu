import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Wiring proof that `agent-daemon-server.ts` frees a run's in-memory events when the run
 * lifecycle evicts the run's record (memory cause 2, 2026-10-21). The bound itself is proven in
 * `@jini-ai/daemon`'s `run-lifecycle-event-drop.test.ts` and `event-log-retention.test.ts`. This
 * file reads the SOURCE because importing the script boots the whole daemon (see
 * `agent-daemon-server.outbox-enqueue-only-wiring.unit.test.ts` for the same reasoning).
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

/** Code lines only: the file's comments mention these factories in prose. */
const CODE_LINES = DAEMON_ENTRY_SOURCE.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));

test("agent-daemon-server.ts creates its run lifecycle with dropEventsOnEviction", () => {
  assert.ok(
    CODE_LINES.some((line) => /^\s*const lifecycle\s*=\s*createRunLifecycle\(\{\s*eventLog\s*\},\s*\{\s*dropEventsOnEviction:\s*true\s*\}\);/.test(line)),
    "the daemon's lifecycle must drop a run's events when it evicts the run",
  );
});

test("agent-daemon-server.ts keeps the event log on its bounded defaults", () => {
  assert.ok(
    CODE_LINES.some((line) => /^\s*const eventLog\s*=\s*createInMemoryEventLog\(\{\}\);/.test(line)),
    "passing terminalRetentionMs: null or maxRuns: null would unbound the log again",
  );
});
