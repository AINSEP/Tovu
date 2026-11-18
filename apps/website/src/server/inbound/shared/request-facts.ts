import type { Request } from "express";
import type { FrontendHookInput } from "@jini-ai/daemon/http";
import { nodeRequestHeaders } from "@jini-ai/http-kit/node-bridge";
import { TOVU_REQUEST_FACTS, type TovuRequestFacts } from "#src/contracts/core/request-facts";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveProtocol } from "#src/server/inbound/public-http/routes/oauth/public-origin";

/**
 * @file Express half of the request facts (see `contracts/core/request-facts.ts`). It sits beside
 * `trust-proxy.ts` because the answers depend on the trust-proxy setting of the app whose layer is running.
 */

/**
 * The facts of one Express request. The existing functions are called unchanged, so every answer is
 * the one the hooks computed before the facts existed.
 * @complexity O(1) time and space; no I/O.
 */
export function captureRequestFacts({ req }: { readonly req: Request }, _optional: Record<string, never> = {}): TovuRequestFacts {
  return { clientAddress: resolveClientIp(req), servingProtocol: resolveProtocol(req), secure: req.secure, query: req.query };
}

/**
 * `locals` with the facts added. The key is written last, so nothing earlier in `res.locals` can stand in for it.
 * @param optional.base - The locals to extend (default none).
 */
export function requestFactsLocals({ req }: { readonly req: Request }, { base = {} }: { readonly base?: Readonly<Record<string, unknown>> } = {}): Record<string, unknown> {
  return { ...base, [TOVU_REQUEST_FACTS]: captureRequestFacts({ req }) };
}

/**
 * What Jini's frontend hooks take, for a Tovu Express route that calls one itself: the method and headers
 * as the bridge would hand them (the principal header the auth layer above wrote included), and the facts.
 * @complexity O(headers) time and space.
 */
export function requestHookInput({ req }: { readonly req: Request }, _optional: Record<string, never> = {}): FrontendHookInput {
  return { request: { method: req.method, headers: nodeRequestHeaders({ incoming: req }) }, locals: requestFactsLocals({ req }) };
}
