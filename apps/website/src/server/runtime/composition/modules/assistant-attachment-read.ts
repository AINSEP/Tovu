import { createHash } from "node:crypto";
import type { ServerRoute } from "@jini-ai/core/contracts/server";
import {
  CHAT_ATTACHMENT_READ_PATH, createChatAttachmentReadRoute,
} from "@jini-ai/cms/admin-http/routes/assistant/get-chat-attachment";
import { parseRangeHeader } from "@jini-ai/http-kit/range";
import type { Express, Response as ExpressResponse } from "express";

import { readChatAttachmentForOwner, sniffContentType } from "#src/features/media/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { DISALLOWED_INLINE_CONTENT_TYPES, SVG_CONTENT_SECURITY_POLICY } from "#src/server/inbound/admin-http/routes/media/original";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { mountJiniRouteInPlace } from "../jini-routes.js";

/**
 * @file Host binding for the chat-attachment read route (`@jini-ai/cms`'s
 * `createChatAttachmentReadRoute`): the filesystem reader, the session principal, the media route's
 * response policy and the admin failure reply go in; the route is mounted as an Express GET method
 * route (`mountJiniRouteInPlace`, never an `app.use` dispatcher layer) at the position the assistant
 * module calls this, after its `/api/attachments` session gate. The security model is in the route's own
 * module doc; the authorization rule is in `features/media/read-chat-attachment.ts`.
 */

/** The same failure operation the hand-written route reported; it selects the user-facing 500 copy. */
const FAILURE_OPERATION = "routes/assistant/get-chat-attachment";

/**
 * The admin failure reply as a web `Response`. Built by `sendAdminFailure` itself over a recording
 * stand-in, so the envelope, redaction and tracker report stay the ones every admin route uses. The
 * stand-in names the method and registered path the Express route exposed as `req.method` /
 * `req.route.path`: they pick the failure copy, and a bridged route has no Express route object.
 * @complexity The shared redaction cost plus one JSON serialization.
 */
function adminFailureWebResponse({ error, request, locals }: { error: unknown; request: Request; locals: Record<string, unknown> }, _optional: Record<string, never> = {}): Response {
  let status = 500;
  let body: unknown;
  const recorder = {
    status(code: number) { status = code; return { json(value: unknown) { body = value; } }; },
    locals: locals as ExpressResponse["locals"],
    req: { method: request.method, route: { path: CHAT_ATTACHMENT_READ_PATH } },
  };
  sendAdminFailure({ res: recorder, error }, { operation: FAILURE_OPERATION, code: "INTERNAL_ERROR" });
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json; charset=utf-8", "content-length": String(Buffer.byteLength(text)) } });
}

/** Express's default (weak) entity tag for a finished body: hex length plus a truncated SHA-1. */
function weakEntityTag({ bytes }: { bytes: Uint8Array }, _optional: Record<string, never> = {}): string {
  return `W/"${bytes.byteLength.toString(16)}-${createHash("sha1").update(bytes).digest("base64").substring(0, 27)}"`;
}

/**
 * Express's `req.fresh` for a response that carries an ETag and never a Last-Modified: a GET/HEAD
 * with a matching `If-None-Match` and no `no-cache` request directive. An `If-Modified-Since` makes
 * it stale, because there is no Last-Modified to compare it with.
 */
function isFresh({ headers, etag }: { headers: Headers; etag: string }, _optional: Record<string, never> = {}): boolean {
  const noneMatch = headers.get("if-none-match");
  if (!noneMatch || headers.get("if-modified-since")) return false;
  if (/(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(headers.get("cache-control") ?? "")) return false;
  if (noneMatch === "*") return true;
  return noneMatch.split(/[ ,]+/).some((tag) => tag === etag || tag === `W/${etag}` || `W/${tag}` === etag);
}

/**
 * Keeps the two validators Express's `res.send` added to this route's answers before it was a Jini
 * route: an ETag on every finished body, and a 304 (no Content-Type/Length, no body) when a GET or
 * HEAD's `If-None-Match` matches a 2xx. Without this the bridge would answer the same bytes with one
 * header fewer and never 304.
 * @complexity O(n) in the body: it is buffered once to hash it (these bodies are already in memory).
 */
function withExpressValidators({ route }: { route: ServerRoute }, _optional: Record<string, never> = {}): ServerRoute {
  return { ...route, handler: async (args) => {
    const response = await route.handler(args);
    if (response.body === null) return response;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const headers = new Headers(response.headers);
    const etag = weakEntityTag({ bytes });
    headers.set("etag", etag);
    const method = args.request.method;
    const freshCandidate = (method === "GET" || method === "HEAD") && response.status >= 200 && response.status < 300;
    if (freshCandidate && isFresh({ headers: args.request.headers, etag })) {
      for (const name of ["content-type", "content-length", "transfer-encoding"]) headers.delete(name);
      return new Response(null, { status: 304, headers });
    }
    return new Response(bytes, { status: response.status, headers });
  } };
}

/** Mounts the authenticated attachment read route; the optional owner-scoped reader defaults to the
 * filesystem adapter. Unexpected failures return a private 500 envelope.
 * @complexity O(1) at registration; O(n) per request in the attachment bytes served.
 */
export function registerAdminChatAttachmentReadRoute(
  { app, deps }: { app: Express; deps: {
    readonly uploadDirectory: string;
    /** Owner-scoped reader boundary; defaults to the real filesystem implementation. */
    readonly readChatAttachmentForOwner?: typeof readChatAttachmentForOwner;
  } },
  _optional: Record<string, never> = {}
): void {
  const route = createChatAttachmentReadRoute({ deps: {
    readAttachment: (input) => (deps.readChatAttachmentForOwner ?? readChatAttachmentForOwner)({ uploadDirectory: deps.uploadDirectory }, input),
    // `getAuthedPrincipal` reads only `locals`; the bridge hands the Express `res.locals` through.
    ownerIdOf: ({ locals }) => getAuthedPrincipal({ locals } as Pick<ExpressResponse, "locals"> as ExpressResponse).id,
    sniffContentType,
    parseRangeHeader,
    disallowedInlineContentTypes: DISALLOWED_INLINE_CONTENT_TYPES,
    svgContentSecurityPolicy: SVG_CONTENT_SECURITY_POLICY,
    failureResponse: adminFailureWebResponse,
  } });
  // In place, as the hand-written `app.get` stood: the table keeps its `route get … [<anonymous>]` row,
  // and an OPTIONS is Express's own Allow answer for that row.
  mountJiniRouteInPlace({ app, route: withExpressValidators({ route }) }, { anonymous: true });
}
