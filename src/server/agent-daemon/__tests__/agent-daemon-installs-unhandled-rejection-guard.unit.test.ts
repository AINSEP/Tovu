import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @file Wiring proof that `agent-daemon-server.ts` — a separate OS process from Tovu's main server,
 * with NO restart supervisor (`index.ts`'s own `spawnAgentDaemon()`: "there is no retry path today
 * (this function is called exactly once per process boot)") — installs the same process-wide
 * `unhandledRejection` guard `index.ts`'s `main()` installs for the main process
 * (`server/boot/process-error-guards.ts`, 2026-08-16).
 *
 * Closing `commit-site.ts`'s unguarded `resolveDefaultForSourceControl` call fixes today's one known
 * crash path reachable from this process (`source_control_execute_commit`, wired in
 * `tool-registrations.ts`), but this process has no lint rule or type check that would catch the NEXT
 * unguarded decrypt/async call in a future tool-registration handler — the same "fleet-wide half"
 * reasoning `process-error-guards.ts`'s own header already gives for why the MAIN process needed this
 * guard, unqualified by which route caused the incident it was written for. Unlike the main process,
 * a daemon crash here has no restart path at all: `spawnAgentDaemon()` is called exactly once per
 * `index.ts` boot and its own `child.on("exit")` handler only logs and records the failure via
 * `recordAssistantDaemonFailure()` — it never respawns. So an unguarded rejection here does not
 * degrade one request to a 500; it silently ends the assistant for every workspace until an operator
 * notices "the assistant will be unavailable" and restarts the WHOLE Tovu process by hand.
 *
 * Reads the SOURCE rather than importing the module: `agent-daemon-server.ts` is a flat top-level
 * script (opens a real SQLite connection, boots MCP federation, starts listening) as a side effect of
 * being loaded at all — see `assistant/__tests__/integration/daemon-boots.integration.test.ts` for the
 * real spawn-and-listen proof of that file's own boot path. Re-importing it here just to check one
 * call site would pay that same full boot cost (a real SQLite connection, a bound port) for a fact a
 * source read answers directly and far more cheaply: is the call actually present, unconditional, and
 * wired before this process starts doing real work. The runtime BEHAVIOR of
 * `installUnhandledRejectionGuard` itself — that installing it really does keep a process alive
 * through a genuine unhandled rejection, proven via a real child-process crash/survive comparison — is
 * already covered end-to-end by `server/boot/__tests__/process-error-guards.unit.test.ts`; this file's
 * only job is confirming THIS entry point actually calls it, the same division of labor
 * `daemon-boots.integration.test.ts` already uses for its own, different wiring question (an import
 * cycle, not a missing call).
 */

const DAEMON_ENTRY_SOURCE = readFileSync(path.join(import.meta.dirname, "../agent-daemon-server.ts"), "utf8");

test("agent-daemon-server.ts imports installUnhandledRejectionGuard from the shared process-error-guards module", () => {
  assert.match(
    DAEMON_ENTRY_SOURCE,
    /import\s*\{[^}]*installUnhandledRejectionGuard[^}]*\}\s*from\s*["'][^"']*process-error-guards(\.js)?["']/,
    "agent-daemon-server.ts must import installUnhandledRejectionGuard from process-error-guards.ts, mirroring index.ts's own main()"
  );
});

test("agent-daemon-server.ts calls installUnhandledRejectionGuard() unconditionally at module load, before this process's own first real I/O", () => {
  const callIndex = DAEMON_ENTRY_SOURCE.search(/^\s*installUnhandledRejectionGuard\(\);?\s*$/m);
  assert.notEqual(
    callIndex,
    -1,
    "installUnhandledRejectionGuard() must be called at module top level (not merely imported, and not nested inside a conditional/function that may never run)"
  );

  // "Before any heavier boot work" — same placement rationale index.ts's own main() comment gives for
  // its identical call ("before any boot step below has a chance to reject unguarded"). Opening this
  // process's own SQLite connection (`createSqliteRouteDepsForWorkspace`/`createRouteDeps`) is the
  // first real I/O this file performs.
  const routeDepsIndex = DAEMON_ENTRY_SOURCE.indexOf("createSqliteRouteDepsForWorkspace(process.env.TOVU_WORKSPACE)");
  assert.ok(routeDepsIndex > -1, "this test's own anchor (the routeDeps line) must still exist verbatim — update the anchor if that line's shape changes");
  assert.ok(routeDepsIndex > callIndex, "the guard must be installed before this process's first real I/O (opening its own SQLite connection), not after");
});
