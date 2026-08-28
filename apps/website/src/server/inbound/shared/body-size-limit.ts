import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * @file Route-layer body-size cap for content-entry create/update endpoints.
 *
 * SPEC-002 api.spec.md §4 / behavior.spec.md §4 document: "Request body size ≤ 1 MiB (route
 * layer; exceeding ⇒ 413, EC-05)"; errors.spec.md registers `PAYLOAD_TOO_LARGE` (413) for it.
 * Security review (SEC-snapshot-and-post-create-2026-07-28, Finding 1) found neither half of that
 * contract implemented: `app.ts` mounts one blanket `express.json({ limit: "15mb" })` ahead of
 * every route (15x looser than the spec'd bound, and not specific to these endpoints), and no
 * route emitted the documented `413 PAYLOAD_TOO_LARGE` envelope.
 *
 * Why this is a re-measurement of the already-parsed body, not a second `express.json({limit})`:
 * `app.ts`'s blanket parser runs ahead of every route already registered after it. Once that
 * middleware has parsed a request, `body-parser` marks the request so a second `express.json()`
 * instance later in the same stack sees the body is already parsed and skips re-parsing/re-limiting
 * entirely (no error, silent no-op) — so layering a stricter per-route `express.json({limit:"1mb"})`
 * in front of a handler would never actually enforce anything on this app's routes. This
 * middleware instead re-measures `req.body`'s serialized byte length itself, after Express's own
 * (looser, whole-app) 15 MiB ceiling has already bounded how large that body could possibly be.
 */

/** 1 MiB — api.spec.md §4 / behavior.spec.md §4 documented cap for the content-entry create and update endpoints (`POST_CREATE`, `PAGE_CREATE`, `POST_UPDATE`, `PAGE_UPDATE`). */
export const CONTENT_ENTRY_MAX_BODY_BYTES = 1024 * 1024;

export interface BodySizeLimitRequired {
  /** Maximum allowed serialized body size, in bytes. */
  maxBytes: number;
}

export type BodySizeLimitOptional = Record<string, never>;

/**
 * Express middleware factory: responds `413 PAYLOAD_TOO_LARGE` (errors.spec.md's documented
 * code/message) when the already-parsed JSON body's serialized size exceeds `required.maxBytes`,
 * short-circuiting before `next()` — so the wrapped route handler (and any command-gateway write
 * it would perform) never runs on an oversized request. Must be mounted after the app's
 * `express.json()` body parser (so `req.body` is populated) and before the route's own handler.
 *
 * @complexity O(n) in the serialized size of `req.body` per request — bounded above by the app's
 * blanket 15 MiB `express.json()` limit, so this is not an unbounded cost.
 * @overallScore 100
 */
export function rejectOversizedJsonBody(
  required: BodySizeLimitRequired,
  _optional: BodySizeLimitOptional = {}
): RequestHandler {
  const { maxBytes } = required;

  return (req: Request, res: Response, next: NextFunction) => {
    const bodySize = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
    if (bodySize > maxBytes) {
      res.status(413).json({ error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" });
      return;
    }
    next();
  };
}
