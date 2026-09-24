import express, { type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response } from "express";

/**
 * @file The app's JSON body parsers and their size limits.
 *
 * One blanket `express.json({ limit: "75mb" })` used to run ahead of every route, so any anonymous
 * caller could make a public route (form submit, members sign-in, the analytics beacon) buffer and
 * parse up to 75 MB before a single check ran. Limits are now split by who is calling:
 *
 * - {@link parsePublicJsonBody} runs ahead of every route at {@link PUBLIC_JSON_BODY_LIMIT}, but
 *   leaves session-gated paths ({@link isAuthenticatedBodyPath}) unparsed.
 * - {@link parseAuthenticatedJsonBody} runs INSIDE `requireAdminSession`, after the caller has
 *   authenticated, at {@link AUTHENTICATED_JSON_BODY_LIMIT} — or {@link LARGE_UPLOAD_JSON_BODY_LIMIT}
 *   for the few routes that carry base64 file bytes.
 *
 * `body-parser` marks a request once it has parsed it, so whichever parser runs first wins and a
 * later one is a no-op — which is why the public parser must skip gated paths rather than parse
 * them small.
 */

/** Largest legitimate public body: the site assistant's chat turn plus its bounded history
 *  (13 turns x 2000 chars, up to 4 UTF-8 bytes each, ~104 KB). Form posts are far smaller. */
export const PUBLIC_JSON_BODY_LIMIT = "128kb";

/** The admin API's ceiling for an authenticated caller — the app-wide limit before uploads needed more. */
export const AUTHENTICATED_JSON_BODY_LIMIT = "15mb";

/** Covers `TOVU_MAX_UPLOAD_BYTES` (50 MiB) once base64 inflates it ~1.33x, plus headroom. */
export const LARGE_UPLOAD_JSON_BODY_LIMIT = "75mb";

/** Every mount prefix of `requireAdminSession` (`modules/core.ts`, `assistant*.ts`). A prefix here
 *  that has no gate would leave its routes with no parsed body at all. */
const AUTHENTICATED_PATH_PREFIXES = [
  "/api/admin",
  "/api/assistant/chats",
  "/api/runs",
  "/api/agents",
  "/api/tools",
  "/api/frontend-sessions",
  "/api/attachments",
];

/** `registerAuthRoutes` registers login/logout/boot-session under `/api/admin` BEFORE the gate. */
const UNGATED_ADMIN_AUTH_PREFIX = "/api/admin/v1/auth/";

/** Routes whose JSON carries base64 file bytes: media upload, publish-content blob put, bundle create. */
const LARGE_UPLOAD_ROUTES: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: "POST", pattern: /^\/api\/admin\/v1\/workspaces\/[^/]+\/media\/?$/ },
  { method: "PUT", pattern: /^\/api\/admin\/v1\/workspaces\/[^/]+\/publish-content\/blobs\/[^/]+\/?$/ },
  { method: "POST", pattern: /^\/api\/admin\/v1\/workspaces\/[^/]+\/publish-content\/bundles\/?$/ },
];

/**
 * Whether a request path is behind `requireAdminSession`, so its body waits for the gate.
 * Lower-cased because Express routing is case-insensitive: `/API/ADMIN/...` still reaches the gate.
 *
 * @complexity O(prefixes).
 */
export function isAuthenticatedBodyPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.startsWith(UNGATED_ADMIN_AUTH_PREFIX)) return false;
  return AUTHENTICATED_PATH_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
}

/**
 * The JSON limit for an already-authenticated request.
 *
 * @complexity O(large routes).
 */
export function jsonBodyLimitForAuthenticatedRequest(method: string, path: string): string {
  const lower = path.toLowerCase();
  const isLarge = LARGE_UPLOAD_ROUTES.some((route) => route.method === method.toUpperCase() && route.pattern.test(lower));
  return isLarge ? LARGE_UPLOAD_JSON_BODY_LIMIT : AUTHENTICATED_JSON_BODY_LIMIT;
}

const publicParser = express.json({ limit: PUBLIC_JSON_BODY_LIMIT });
const authenticatedParser = express.json({ limit: AUTHENTICATED_JSON_BODY_LIMIT });
const largeUploadParser = express.json({ limit: LARGE_UPLOAD_JSON_BODY_LIMIT });

/** App-level parser for every route; session-gated paths are left for {@link parseAuthenticatedJsonBody}. */
export const parsePublicJsonBody: RequestHandler = (req, res, next) => {
  if (isAuthenticatedBodyPath(req.path)) {
    next();
    return;
  }
  publicParser(req, res, next);
};

/** Called by `requireAdminSession` once the caller is authenticated. `req.baseUrl + req.path` is
 *  the full path whichever prefix the gate is mounted under. */
export function parseAuthenticatedJsonBody(req: Request, res: Response, next: NextFunction): void {
  const limit = jsonBodyLimitForAuthenticatedRequest(req.method, `${req.baseUrl}${req.path}`);
  const parser = limit === LARGE_UPLOAD_JSON_BODY_LIMIT ? largeUploadParser : authenticatedParser;
  parser(req, res, next);
}

/**
 * Error handler: answers body-parser's "entity too large" with a JSON 413 instead of Express's
 * default HTML page (which includes a stack trace outside production). Anything else passes on.
 */
export const respondToOversizedBody: ErrorRequestHandler = (err, _req, res, next) => {
  const type = (err as { type?: unknown } | null)?.type;
  if (type !== "entity.too.large" || res.headersSent) {
    next(err);
    return;
  }
  res.status(413).json({ error: "Request body is too large.", code: "PAYLOAD_TOO_LARGE" });
};
