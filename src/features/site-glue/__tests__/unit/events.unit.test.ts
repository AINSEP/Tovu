import assert from "node:assert/strict";
import test from "node:test";

import { subscribeGlueEvent } from "../../attachment-points/events.js";

/**
 * @file `subscribeGlueEvent()` — SPEC-048 REQ-5/REQ-8; ADR-057 Decision 2/4.
 *
 * Requirement-to-test map:
 * - "delegates to the host port unchanged, no containment of its own" -> the forwarding + throw-
 *   propagation tests (REQ-8: no new mechanism needed for this category).
 */

const handler = async (_payload: unknown) => {};

test("forwards moduleId, eventName, and handler to hostPort.subscribeEvent() unchanged", () => {
  const calls: unknown[][] = [];
  const hostPort = {
    subscribeEvent: (...args: unknown[]) => {
      calls.push(args);
    },
  };

  subscribeGlueEvent({ moduleId: "site-glue-example", eventName: "content.entry.published", handler, hostPort });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["site-glue-example", "content.entry.published", handler]);
});

test("propagates whatever hostPort.subscribeEvent() itself throws, rather than swallowing it", () => {
  const hostPort = {
    subscribeEvent: () => {
      throw new Error("host port refused this subscription");
    },
  };

  assert.throws(
    () => subscribeGlueEvent({ moduleId: "m", eventName: "some.event", handler, hostPort }),
    /host port refused this subscription/
  );
});
