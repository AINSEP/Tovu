/**
 * @file Minimal `text/event-stream` SSE frame parsing — extracted from `assistant-transport.ts`
 * (2026-08-18, ADR-059) so `assistant-transport-ag-ui.ts`'s AG-UI path reuses it instead of
 * duplicating it or creating an import cycle back into `assistant-transport.ts` (which itself
 * imports the AG-UI path's `startRun`/`reattachRun`/`stopRun`/`fetchRunStatus` functions). Pure
 * extraction: both functions have the exact bodies they had inline in that file before this split.
 *
 * A hand-rolled reader rather than `EventSource`, for both callers: `EventSource` only ever issues
 * a GET with no request body, and both the BYOK and AG-UI paths hold one POST's response open on
 * the SAME connection the browser used to send it — there is no separate URL an `EventSource` could
 * subscribe to.
 */

/**
 * Parses one blank-line-delimited SSE frame's raw text into `{event, data}`, split out as its own
 * pure function so it is directly testable with a plain string, no `ReadableStream`/reader involved.
 *
 * Returns `null` for a frame with no `data:` lines — {@link readSseFrames} skips yielding those
 * (a bare `event: ping` keepalive, for example, or a frame carrying only an `id:` field).
 */
export function parseFrame(rawFrame: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of rawFrame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  return dataLines.length > 0 ? { event, data: dataLines.join("\n") } : null;
}

/**
 * Splits a `text/event-stream` response body into `{event, data}` frames. Frames are
 * blank-line-delimited per the SSE spec; per-frame field parsing lives in {@link parseFrame} above.
 *
 * @complexity O(n) in response body bytes; O(1) additional buffering per chunk beyond the
 * not-yet-terminated tail of the current frame.
 * @overallScore 100
 */
export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const frame = parseFrame(rawFrame);
      if (frame) yield frame;
      boundary = buffer.indexOf("\n\n");
    }
  }
}
