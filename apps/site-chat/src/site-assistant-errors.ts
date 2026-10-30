/**
 * @file Visitor-facing wording for a failed "Ask this site" turn. Both widget builds (React
 * `ChatPane` and the Pure JS vanilla widget) render whatever `Error.message` the transport hands to
 * `RunHandlers.onError` — React as the failed reply's `run_terminal` notice under the assistant
 * message, vanilla in its `role="alert"` error row — so phrasing it once here covers both.
 */

/** Reported when the stream settles with neither text nor a page action — the visitor would
 *  otherwise see an empty reply and no hint that anything went wrong. */
export const NO_REPLY_REASON = "the assistant sent no reply";

/** `fetch` rejects with a bare `TypeError` on a network failure; its message is browser-specific
 *  ("Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."). */
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror/i;

/**
 * Wraps any failure as "Couldn't get an answer: <reason>. Try again.", keeping the server's own
 * reason (the JSON `error` body or SSE `error` frame) visible rather than a generic "failed".
 *
 * @param input.error - Whatever the transport caught or was told; non-Errors are stringified.
 * @returns A new `Error` carrying the visitor-facing message.
 * @complexity O(n) in the reason's length.
 */
export function visitorFacingError({ error }: { error: unknown }, _options = {}): Error {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  let end = raw.trimEnd().length;
  while (end > 0 && /[.!\s]/.test(raw[end - 1])) end -= 1;
  const reason = error instanceof TypeError && NETWORK_FAILURE.test(raw)
    ? "couldn't reach the site"
    : raw.slice(0, end).trimStart() || "something went wrong";
  return new Error(`Couldn't get an answer: ${reason}. Try again.`);
}
