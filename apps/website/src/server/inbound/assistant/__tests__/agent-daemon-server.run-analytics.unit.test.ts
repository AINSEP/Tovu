import assert from "node:assert/strict";
import test from "node:test";
import { createNoopTracker, type Tracker } from "@jini-ai/diagnostics/observability";
import { captureDaemonRun } from "./helpers/daemon-source.js";

// Run the actual onStarted callback without booting the daemon entry script.
for (const status of [undefined, "succeeded", "failed", "canceled"] as const) {
  test(`standalone daemon finish analytics ${status ?? "omits an absent outcome"}`, async () => {
    const captures: Parameters<Tracker["capture"]>[] = [];
    await captureDaemonRun({ prompt: "standalone" }, {
      lifecycle: {
        waitForTerminal: () => new Promise(() => {}),
        stream: async ({ onEvent }: { onEvent: (event: { kind: "end"; payload: { status?: typeof status } }) => void }) => {
          onEvent({ kind: "end", payload: status === undefined ? {} : { status } });
        },
      },
      bindings: { routeDeps: {
        tracker: { ...createNoopTracker({}), capture: (...args: Parameters<Tracker["capture"]>) => { captures.push(args); } },
      } },
    });
    const finished = captures.filter(([event]) => event.name === "assistant_run_finished");
    assert.equal(finished.length, 1);
    assert.deepEqual(finished[0], [
      { name: "assistant_run_finished", userId: "daemon-test-principal" },
      { properties: { chatSurface: "daemon", logicalRunId: "daemon-test-run", eventId: "assistant-finish:daemon-test-run",
        ...(status === undefined ? {} : { outcome: status }) } },
    ]);
  });
}
