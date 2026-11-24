import type { MediaOriginalReply } from "@jini-ai/cms/media";
import type { Response } from "express";

/**
 * @file The one Express writer for the framework-neutral `{ status, headers, body }` that
 * `@jini-ai/cms/media`'s original-bytes decisions return. Every media byte-serving route (admin
 * original preview, public `/m/:id/original`, chat-attachment read) decides through that module and
 * writes through here, so headers and body bytes can never diverge between them.
 */

/**
 * Writes `reply` verbatim: status, each header in order, then the body (`end()` when there is none, so a
 * 416 carries no body; `send()` otherwise, which keeps Express's own weak ETag + If-None-Match 304 handling).
 * @complexity O(h) in the header count, plus the body copy.
 */
export function writeMediaOriginalReply({ res, reply }: { res: Response; reply: MediaOriginalReply }, _optional = {}): void {
  res.status(reply.status);
  for (const [name, value] of reply.headers) res.set(name, value);
  if (reply.body === null) {
    res.end();
    return;
  }
  res.send(Buffer.from(reply.body));
}

/** A trashed asset is `410 no-store` — mirrors the public rendition route's gone mapping. @complexity O(1). */
export function sendMediaOriginalTrashed({ res }: { res: Response }, _optional = {}): void {
  res.status(410).set("Cache-Control", "no-store").end();
}
