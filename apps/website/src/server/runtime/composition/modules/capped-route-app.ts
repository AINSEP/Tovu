import type { Express, RequestHandler } from "express";

/**
 * @file `app` as a capped write spec sees it (K1): each verb registration carries a body-size cap in
 * front of the mounted handler, in the SAME route registration as before.
 */

/**
 * `app` as the write specs see it: each verb registration carries the content-entry body cap in front of
 * its handler, in the SAME route registration as before (so the route-table pin keeps its two-handler rows).
 * The cap stays an Express binding rather than the specs' `maxBodyBytes`: the kit answers its own 413
 * envelope, while this admin client has always read `{ error: "Content too large to save.", code:
 * "PAYLOAD_TOO_LARGE" }`, and the cap runs before the workspace check exactly as the hand-written route's did.
 * `mountJsonRoute` only ever calls `app[spec.method](path, handler)`, which is all this implements.
 */
export function cappedApp({ app, limit }: { app: Express; limit: RequestHandler }, _optional: Record<string, never> = {}): Express {
  const withCap = (verb: "post" | "put" | "patch") => (path: string, handler: RequestHandler) => app[verb](path, limit, handler);
  return { post: withCap("post"), put: withCap("put"), patch: withCap("patch") } as unknown as Express;
}
