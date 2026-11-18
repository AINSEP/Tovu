/**
 * @file The Express face of Jini's tool-execution caller check. The daemon's own tool routes run that check
 * as a gate on a route list; this site also keeps four Express routes of its own private to the same caller
 * (component catalog, plugin preflight, retained-state RPC, desktop capability hand-off). They call the same
 * decision, so there is one owner of the sequence (configured secret, loopback peer, bearer) and the copies
 * cannot drift. The peer is the connection's own address, never a forwarded header.
 */
import { toolExecutionCallerRefusal } from "@jini-ai/daemon/http";
import type { RequestHandler, Router } from "express";
import { nodeTimingSafeEqual } from "../jini-routes.js";

/** An Express app or `Router`, as far as the internal routes need it. */
export type InternalRouteTarget = Pick<Router, "get" | "post" | "use">;

/**
 * Gate for one Express route: answers the decision's refusal as `{ error }` JSON, otherwise calls `next()`.
 * Mount it before any body parser, so an unauthenticated caller's body is never read.
 * @param required.env - Where the secret is read from.
 * @param optional.tokenEnvVar - The env var that holds the secret (the daemon's default when left out).
 * @complexity O(1) per request.
 */
export function requireToolExecutionCallerExpress(
  { env }: { env: Readonly<Record<string, string | undefined>> },
  { tokenEnvVar }: { tokenEnvVar?: string } = {},
): RequestHandler {
  return (req, res, next) => {
    const refusal = toolExecutionCallerRefusal(
      { authorization: req.get("authorization"), peerAddress: req.socket?.remoteAddress, env, timingSafeEqual: nodeTimingSafeEqual },
      tokenEnvVar === undefined ? {} : { tokenEnvVar },
    );
    if (refusal === null) { next(); return; }
    res.status(refusal.status).json({ error: refusal.error });
  };
}
