import { describe, expect, test } from "vitest";

import { parseFrame, readSseFrames } from "../sse-frames";

/**
 * @file Direct unit coverage for `sse-frames.ts` — extracted (2026-08-18, ADR-059) so both the BYOK
 * and AG-UI transports share one SSE parser. `assistant-transport.ag-ui.unit.test.ts` exercises this
 * module only through frames shaped like the AG-UI wire format (`data: <json>\n\n`, no `event:`
 * field), which never reaches `parseFrame`'s `event:`-line branch or its no-`data:` `null` return —
 * both real for the OTHER caller (`assistant-transport.ts`'s BYOK path, whose frames do carry an
 * `event:` field and whose keepalives carry no `data:` at all). Tested directly here instead.
 */

function chunkStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]));
        i += 1;
      } else {
        controller.close();
      }
    },
  });
}

describe("parseFrame", () => {
  test("an explicit event: line overrides the default 'message' event", () => {
    expect(parseFrame("event: custom\ndata: hello")).toEqual({ event: "custom", data: "hello" });
  });

  test("no event: line defaults to 'message'", () => {
    expect(parseFrame("data: hello")).toEqual({ event: "message", data: "hello" });
  });

  test("multiple data: lines join with a newline", () => {
    expect(parseFrame("data: line1\ndata: line2")).toEqual({ event: "message", data: "line1\nline2" });
  });

  test("a frame with no data: lines at all (e.g. a bare id-only keepalive) returns null", () => {
    expect(parseFrame("id: 5")).toBeNull();
    expect(parseFrame("")).toBeNull();
  });
});

describe("readSseFrames", () => {
  test("yields frames carrying an explicit event: field", async () => {
    const stream = chunkStream(["event: custom\ndata: {\"a\":1}\n\n"]);
    const frames = [];
    for await (const frame of readSseFrames(stream)) frames.push(frame);
    expect(frames).toEqual([{ event: "custom", data: '{"a":1}' }]);
  });

  test("a keepalive frame with no data: lines is silently skipped, not yielded", async () => {
    const stream = chunkStream(["id: 1\n\n", "data: real\n\n"]);
    const frames = [];
    for await (const frame of readSseFrames(stream)) frames.push(frame);
    expect(frames).toEqual([{ event: "message", data: "real" }]);
  });

  test("a frame split across multiple stream chunks is reassembled before parsing", async () => {
    const stream = chunkStream(["data: pa", "rt1\n\n"]);
    const frames = [];
    for await (const frame of readSseFrames(stream)) frames.push(frame);
    expect(frames).toEqual([{ event: "message", data: "part1" }]);
  });
});
