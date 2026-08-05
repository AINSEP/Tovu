import assert from "node:assert/strict";
import test from "node:test";

import { attachGlueContentLifecycle } from "../../attachment-points/content-lifecycle";
import type { GlueFieldDecl } from "../../ports";

/**
 * @file `attachGlueContentLifecycle()` — SPEC-048 REQ-5; ADR-057 Decision 2/4.
 *
 * Requirement-to-test map:
 * - "delegates to the host port unchanged, no containment of its own" -> the forwarding + throw-
 *   propagation tests (Decision 4: this category stays fail-closed).
 */

const fields: readonly GlueFieldDecl[] = [{ path: "count", type: "integer" }];
const filter = async () => ({ count: 1 });

test("forwards moduleId, filter, and declaredFields to hostPort.attachContentLifecycleFilter() unchanged", () => {
  const calls: unknown[][] = [];
  const hostPort = {
    attachContentLifecycleFilter: (...args: unknown[]) => {
      calls.push(args);
    },
  };

  attachGlueContentLifecycle({ moduleId: "site-glue-example", filter, declaredFields: fields, hostPort });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["site-glue-example", filter, fields]);
});

test("ADR-057 Decision 4: this category stays fail-closed — a throw from the host port propagates, never caught here", () => {
  const hostPort = {
    attachContentLifecycleFilter: () => {
      throw new Error("host port refused this attachment");
    },
  };

  assert.throws(
    () => attachGlueContentLifecycle({ moduleId: "m", filter, declaredFields: fields, hostPort }),
    /host port refused this attachment/
  );
});
