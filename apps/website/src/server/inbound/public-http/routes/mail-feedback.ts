import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { MailFeedbackRoute } from "#src/features/mail/index";

/**
 * @file Mounts `POST /hooks/mail/:providerId` (provider bounce/complaint webhooks; unauthenticated,
 * the provider's signature is the credential). Must be registered BEFORE the app-level public JSON
 * parser: once body-parser has read a request a later raw parser is a no-op, and the signature is
 * over the exact bytes. Any content type is read raw, capped at the route's own body limit.
 */
export const MAIL_FEEDBACK_PATH = "/hooks/mail/:providerId";

/** Responds to the raw parser's own refusals (oversized, aborted) the way the ingest would. */
function rawBody(route: MailFeedbackRoute) {
  const parse = express.raw({ type: () => true, limit: route.maxBodyBytes });
  return (req: Request, res: Response, next: NextFunction): void => {
    parse(req, res, (error?: unknown) => {
      if (error === undefined) {
        next();
        return;
      }
      const tooLarge = (error as { type?: unknown }).type === "entity.too.large";
      res.status(tooLarge ? 413 : 400).json({ ok: false, error: tooLarge ? "body too large" : "unreadable body" });
    });
  };
}

/** @example registerMailFeedbackRoute({ app, route: createMailFeedbackRoute(deps) }) */
export function registerMailFeedbackRoute({ app, route }: { app: Express; route: MailFeedbackRoute }, _optional: Record<string, never> = {}): void {
  app.post(MAIL_FEEDBACK_PATH, rawBody(route), async (req: Request<{ providerId: string }>, res: Response) => {
    try {
      // No body at all leaves `req.body` as `{}`; an empty buffer is what the signature saw.
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await route.handle({ providerId: req.params.providerId, rawBody: new Uint8Array(body), headers: req.headers });
      res.status(result.status).json(result.body);
    } catch {
      // Never echo internals to an unauthenticated caller; the provider retries a 5xx.
      res.status(500).json({ ok: false, error: "feedback could not be recorded" });
    }
  });
}
