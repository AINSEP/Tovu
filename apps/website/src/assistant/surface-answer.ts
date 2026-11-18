/**
 * @file The two Node-side steps around Jini's surface helpers, which answer with a web `Response`
 * and never touch the connection: the signal that cancels a restore when the browser leaves, and the
 * write of the finished (or still streaming) answer to the Express response.
 */
import type { Response as ExpressResponse } from "express";
import { sendWebResponse } from "@jini-ai/http-kit/node-bridge";

/**
 * Produces a surface answer with Jini's helpers and writes it to `res`. `produce` gets a signal that
 * aborts when the browser connection closes before the answer was fully written (a normal end has
 * `writableFinished` already true, so nothing aborts after a completed answer); the close listener
 * is removed when the answer is done. `produce` returns `undefined` when it did not handle the request:
 * nothing is written and this resolves `false`, so the caller can fall back.
 *
 * A JSON answer (the 202/403/409 bodies) goes out through Express's own `res.status().json()`, exactly as
 * before the helpers returned a `Response`; a streaming answer (a restored card, newline-delimited JSON)
 * is streamed as it is produced.
 */
export async function answerSurface(
  { res, produce }: { res: ExpressResponse; produce: (required: { signal: AbortSignal }) => Promise<Response | undefined> },
  _optional: Record<string, never> = {},
): Promise<boolean> {
  const gone = new AbortController();
  const onClose = (): void => { if (!res.writableFinished) gone.abort(); };
  res.on("close", onClose);
  try {
    const response = await produce({ signal: gone.signal });
    if (response === undefined) return false;
    if (response.headers.get("content-type")?.startsWith("application/json")) res.status(response.status).json(await response.json());
    else await sendWebResponse({ response, res });
    return true;
  } finally {
    res.off("close", onClose);
  }
}
