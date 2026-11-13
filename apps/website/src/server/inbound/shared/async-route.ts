import type { NextFunction, Request, RequestHandler, Response } from "express";

/** An async Express route or middleware body. Its returned value is ignored, as Express ignores it. */
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** What `asyncRoute` returns: the Express handler, plus the original async handler under `handler`. */
export type AsyncRouteRequestHandler = RequestHandler & { readonly handler: AsyncRouteHandler };

/**
 * Makes a rejected async route or middleware reach the app's error middleware instead of leaving
 * the request open. Express 4 drops the promise an async handler returns, so a failed await
 * before (or outside) the handler's own `try` used to hang the browser until it timed out, while
 * the process guard only logged the rejection. This forwards the rejection to `next(error)`,
 * which is exactly what Express 5 does natively, so moving to Express 5 later makes this a no-op.
 *
 * After `next(error)`: admin API paths get `captureRouteError`'s plain-words failure with incident
 * details; public paths get Express's default 500 page. A stream that already sent its headers
 * (SSE) is closed by Express's final handler and the error is logged; the client's EventSource
 * reconnects as it would after any dropped connection.
 *
 * The original handler stays reachable as `.handler` so tests that pull a route out of Express's
 * router stack and call it directly (`extractRouteHandler`, `lastRouteHandler`) can still await
 * the real work; the wrapper itself returns before the handler finishes.
 * @complexity O(1) per request on top of the wrapped handler.
 * @example app.get(path, asyncRoute({ handler: async (req, res) => { res.json(await load(req)); } }));
 */
export function asyncRoute({ handler }: { handler: AsyncRouteHandler }, _optional: Record<string, never> = {}): AsyncRouteRequestHandler {
  const forwardRejection: RequestHandler = (req, res, next) => {
    handler(req, res, next).catch((error: unknown) => {
      // `next(undefined)` would mean "carry on" and fall through to the next route; a rejection
      // with no value is still a failure.
      next(error ?? new Error("The request handler stopped without saying why."));
    });
  };
  return Object.assign(forwardRejection, { handler });
}
