import assert from "node:assert/strict";
import test from "node:test";

import { startOwnParentWatchdog, type ParentWatchdogEvent } from "@jini-ai/sidecar";
import { formatParentWatchdogEvent } from "../parent-watchdog-report.js";

/**
 * @file Pins the exact lines and streams the entry's parent watchdog has always written. The text
 * and severities below were recorded from the pre-move watchdog's own tests (`[index]` tag, status
 * note on `log`, every self-termination or rejected setting on `error`) before the watchdog started
 * reporting structured events, so a wording or stream change here is a visible behaviour change.
 */

const cases: readonly { name: string; event: ParentWatchdogEvent; stream: "log" | "error"; line: string }[] = [
  { name: "disabled", event: { kind: "disabled", disableEnvName: "TOVU_DISABLE_PARENT_WATCHDOG" }, stream: "log",
    line: "[index] TOVU_DISABLE_PARENT_WATCHDOG=1 — parent watchdog disabled" },
  { name: "parent gone at boot", event: { kind: "parent-gone-at-boot", parentPid: 42 }, stream: "error",
    line: "[index] parent process 42 was already gone before this process finished booting — self-terminating" },
  { name: "reparented", event: { kind: "parent-reparented", parentPid: 42, currentPid: 1 }, stream: "error",
    line: "[index] parent process 42 is gone (reparented to 1) — self-terminating" },
  { name: "invalid supervisor pid", event: { kind: "invalid-supervisor-pid", envName: "TOVU_DEV_SUPERVISOR_PID", raw: "abc" }, stream: "error",
    line: '[index] TOVU_DEV_SUPERVISOR_PID="abc" is not a valid pid — that check is disabled' },
  { name: "supervisor gone", event: { kind: "supervisor-gone", supervisorPid: 777 }, stream: "error",
    line: "[index] dev supervisor process 777 is gone — self-terminating" },
];

for (const { name, event, stream, line } of cases) {
  test(`formats the ${name} event as the established ${stream} line`, () => {
    assert.deepEqual(formatParentWatchdogEvent({ event }), { stream, line });
  });
}

test("the real watchdog's reparent event renders the established line end to end", () => {
  const lines: { stream: string; line: string }[] = [];
  let ppid = 42;
  let poll: () => void = () => {};
  startOwnParentWatchdog({
    env: {}, envNames: { disable: "TOVU_DISABLE_PARENT_WATCHDOG", devSupervisorPid: "TOVU_DEV_SUPERVISOR_PID" },
    ppid: () => ppid, signalZero: () => {}, exit: () => {},
    report: (event) => { lines.push(formatParentWatchdogEvent({ event })); },
    setInterval: (callback) => { poll = callback; },
  });
  ppid = 1;
  poll();
  assert.deepEqual(lines, [{ stream: "error", line: "[index] parent process 42 is gone (reparented to 1) — self-terminating" }]);
});
