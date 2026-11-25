import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { EventType, PROTOCOL_VERSION } from "@ag-ui/core";
import { EventSchemas } from "@ag-ui/core/schemas";
import { EventEncoder } from "@ag-ui/encoder";

/**
 * @file AG-UI 1.0 conformance for the assistant chat route (`assistant-ag-ui.ts`). The wire golden
 * pins that route's live bytes exactly, so every frame in it must be a valid AG-UI 1.0 event, each
 * scenario must open with one RUN_STARTED and end with exactly one terminal, and the 1.0 encoder the
 * route uses must still frame events the way the golden records them.
 */

const GOLDEN = fileURLToPath(new URL("./goldens/assistant-ag-ui-wire.golden.json", import.meta.url));
const TERMINALS = new Set<string>([EventType.RUN_FINISHED, EventType.RUN_ERROR]);

function framesOf(body: string): unknown[] {
  return body.split("\n\n").filter((frame) => frame.startsWith("data: ")).map((frame) => JSON.parse(frame.slice("data: ".length)) as unknown);
}

test("every recorded assistant AG-UI frame is a valid AG-UI 1.0 event with one start and one terminal", () => {
  assert.equal(PROTOCOL_VERSION, "1.0");
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, { body: string }>;
  assert.ok(Object.keys(golden).length > 0);
  for (const [name, { body }] of Object.entries(golden)) {
    const events = framesOf(body);
    for (const event of events) {
      const parsed = EventSchemas.safeParse(event);
      assert.ok(parsed.success, `"${name}": ${JSON.stringify(event)} is not an AG-UI 1.0 event`);
    }
    const types = events.map((event) => (event as { type: string }).type);
    assert.equal(types[0], EventType.RUN_STARTED, `"${name}" opens with RUN_STARTED`);
    assert.equal(types.filter((type) => TERMINALS.has(type)).length, 1, `"${name}" ends exactly once`);
    assert.ok(TERMINALS.has(types.at(-1)!), `"${name}" ends on its terminal`);
  }
});

test("the AG-UI 1.0 encoder frames an event as the golden records it", () => {
  const event = { type: EventType.RUN_STARTED, threadId: "thread-golden", runId: "run-golden" } as const;
  assert.equal(new EventEncoder().encodeSSE(event), `data: ${JSON.stringify(event)}\n\n`);
});
