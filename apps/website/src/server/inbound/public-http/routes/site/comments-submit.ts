import { createHash } from "node:crypto";

import type { Express, Request } from "express";

import type { CommentIngressPolicy, CommentSubmission } from "#src/features/comments/index";

/**
 * @file ADR-031 §4 (SPEC-033) — the public, unauthenticated comment submission route. The ONLY
 * route a hostile visitor can reach into the Comments plugin; everything downstream of this file
 * is `CommentIngressPolicy` (rate-limit, honeypot, sanitize, spam-classify — see `comments/ingress.ts`).
 *
 * `authorIpHash` is computed HERE, at the HTTP boundary, from the raw request IP — the raw IP
 * itself is never passed into `ingressContext` or stored (mirrors `analytics/ingest.ts`'s
 * discard-raw-IP-at-the-boundary discipline). `ANALYTICS_ROOT_KEY_SEED`-style dev-only-insecure
 * fallback salt, same disclosed pattern as `registerAnalyticsIngestRoute`'s wiring.
 */
export interface CommentsSubmitDeps {
  ingressPolicy: CommentIngressPolicy;
  workspaceId: string;
}

function hashClientIp(req: Request, salt: string): string {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex");
}

/** The per-request signal bag (honeypot value, IP hash) — split out of `buildCommentSubmission` so
 * that function's own field count stays clear of the complexity ceiling. @complexity O(1). */
function buildIngressContext(req: Request, salt: string, body: Record<string, unknown>) {
  return {
    authorIpHash: hashClientIp(req, salt),
    honeypotValue: typeof body.website === "string" ? body.website : "", // conventional honeypot field name
  };
}

/**
 * Normalizes the untyped request body into a `CommentSubmission`. Every field below defaults or
 * clamps independently (undefined-means-empty for required strings, falsy-means-null for optional
 * ones) — same behavior as before this was a named function, just no longer inline in the handler.
 *
 * @complexity O(1).
 */
function buildCommentSubmission(req: Request, body: Record<string, unknown>, deps: CommentsSubmitDeps): CommentSubmission {
  const salt = process.env.COMMENTS_IP_SALT ?? "dev-only-insecure-salt";

  return {
    workspaceId: deps.workspaceId,
    entryId: String(body.entryId ?? ""),
    parentId: body.parentId ? String(body.parentId) : null,
    authorName: String(body.authorName ?? "").slice(0, 200),
    authorEmail: body.authorEmail ? String(body.authorEmail).slice(0, 320) : null,
    authorUrl: body.authorUrl ? String(body.authorUrl).slice(0, 2000) : null,
    bodyRaw: String(body.body ?? ""),
    authorPrincipalId: null, // v1: anonymous-only public route; member-attributed submission is a named deferral
    ingressContext: buildIngressContext(req, salt, body),
  };
}

export function registerCommentsSubmitRoute(app: Express, deps: CommentsSubmitDeps): void {
  app.post("/api/site/comments", async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await deps.ingressPolicy.submit(buildCommentSubmission(req, body, deps));

      if (!result.ok) {
        // No oracle: every rejection reason maps to the SAME generic 422, distinguishable only in
        // the response body's `reason` for legitimate client-side form UX, never a status-code tell.
        res.status(422).json({ error: "comment was not accepted", reason: result.reason });
        return;
      }

      res.status(201).json({ id: result.comment.id, status: result.comment.status });
    } catch (err) {
      // Public, unauthenticated route (this file's own header) — any visitor's malformed or
      // hostile submission must still get a fast, honest response, never a hang; an unguarded
      // failure here is reachable by anyone, not just an authenticated admin.
      console.error("[site/comments-submit] unexpected error", err);
      res.status(500).json({ error: "internal error", code: "INTERNAL_ERROR" });
    }
  });
}
