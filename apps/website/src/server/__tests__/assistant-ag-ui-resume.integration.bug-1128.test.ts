import assert from "node:assert/strict";
import test from "node:test";
import { tapSseCursor } from "../runtime/composition/modules/assistant-ag-ui-approval-segment.js";

test("BUG T-B03: the last of two adjacent SSE id fields is the resume cursor", async () => {
  const bytes = new TextEncoder().encode('id: 1\nid: 2\ndata: {}\n\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes);
    controller.close();
  } });
  const tapped = tapSseCursor({ reader: stream.getReader() });
  try {
    assert.deepEqual(await tapped.reader.read(), { done: false, value: bytes });
    assert.equal(tapped.cursor(), "2");
  } finally {
    tapped.reader.releaseLock();
  }
});
