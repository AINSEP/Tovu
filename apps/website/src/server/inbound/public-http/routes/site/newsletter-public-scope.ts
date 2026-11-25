import { AsyncLocalStorage } from "node:async_hooks";
import type { Express, Request, RequestHandler, Response } from "express";

/**
 * @file The Express request/response pair of the public newsletter token route being answered, for the two
 * host hooks a spec cannot express: visitor analytics read the whole Express request (consent cookie,
 * provenance headers, client address), and the incident tracker lives on `res.locals`. The same
 * request-scope idea `memberSignInApp` uses for the member sign-in hooks.
 */

const scope = new AsyncLocalStorage<{ req: Request; res: Response }>();

/** The request scope the mounted handler runs in.
 * @throws When a hook runs outside that scope — a wiring bug, refused rather than attributed to no visitor.
 * @complexity O(1).
 */
export function currentNewsletterRequest(_optional: Record<string, never> = {}): { req: Request; res: Response } {
  const store = scope.getStore();
  if (!store) throw new Error("newsletter public route hook ran outside its request scope");
  return store;
}

/** The app view a public newsletter spec is mounted on: each handler registered through it runs inside this
 * request's scope and is registered as `forwardRejection`, the name the hand-written `asyncRoute` handler
 * carried in the route-table pin.
 * @returns An `app` whose `get`/`post` still make ONE `app[method](path, handler)` registration each.
 * @complexity O(1) setup; O(1) per request.
 */
export function newsletterPublicApp({ app }: { app: Express }, _optional: Record<string, never> = {}): Express {
  const view: Express = Object.create(app);
  for (const method of ["get", "post"] as const) {
    (view as unknown as Record<string, unknown>)[method] = (path: string, handler: RequestHandler) => {
      const forwardRejection: RequestHandler = (req, res, next) => scope.run({ req, res }, () => handler(req, res, next));
      return app[method](path, Object.defineProperty(forwardRejection, "name", { value: "forwardRejection" }));
    };
  }
  return view;
}
