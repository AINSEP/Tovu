import type { Express, NextFunction, Request, Response } from "express";

import type { SiteStatusPort } from "../../../../features/database/boot/reconcile-interrupted-migration.js";

/**
 * @file ADR-041/043/044/045 re-audit (2026-07-16, TM-adr041-043-044-045-audit-001, round-2
 * external audit, codex finding `R2-F2-BLOCK-NOT-ENFORCED`) — closes the residual half of
 * Finding 2. `bootstrap.ts`'s `database-migration-reconciliation` module (Finding 2's round-2 fix)
 * correctly DETECTS a crash-interrupted migration and flips `siteStatusRepo` to
 * `BLOCKED_PENDING_RECOVERY`, but detection alone does not satisfy ADR-041 §3's "blocking normal
 * site open until resolved" — nothing previously consumed that status to actually refuse a
 * request. `index.ts` only gates `app.listen()` on `bootResult.ok`, and the reconciliation module
 * treats a detected interruption as a successful `prepare()` (correctly — see below), so the
 * socket opened to full normal traffic regardless of `siteStatus`. This middleware is the missing
 * enforcement point.
 *
 * Scope of the block, per ADR-041 §3's own language ("routes to Recovery, blocking normal site
 * open") and its `PENDING_MIGRATION` precedent ("admin reachable, public serving refused"): while
 * `siteStatus === "BLOCKED_PENDING_RECOVERY"`, every request is refused EXCEPT the allowlisted
 * paths below, which stay reachable so an operator can authenticate and use Recovery to actually
 * resolve the interruption. This deliberately does NOT abort boot / refuse to `listen()` (the
 * external auditor's alternative suggestion) — the ADR's own text requires Recovery to remain
 * reachable, and process-level abort would lock operators out of the only path to fix it.
 *
 * Disclosed, accepted-risk gap (external audit, codex finding `R3-F2-CORS-PRECEDES-GATE`,
 * explicitly classified non-blocking): `applyDevCors` is mounted before this gate in `app.ts` and
 * terminates every `OPTIONS` preflight with a bare 204 before this middleware runs, so preflight
 * requests are never gated. This has no invariant impact — `OPTIONS` never reaches a real handler
 * or mutates state; the actual method that follows a preflight (`GET`/`POST`/etc.) DOES pass
 * through this gate normally. Not fixed here: reordering risks stripping CORS headers off this
 * gate's own 503 responses, which would make them an opaque failure to a cross-origin admin SPA.
 */
const ALWAYS_ALLOWED_EXACT_PATHS = new Set(["/healthz", "/readyz", "/admin"]);

const ALWAYS_ALLOWED_PREFIXES = [
  "/api/admin/v1/auth/", // login/logout/me
  "/api/admin/v1/recovery/", // the entire Recovery API surface
  "/admin/", // built admin SPA assets/sub-routes. Trailing slash is load-bearing: it must NOT
  // match a public slug like /admin-news or /administrator (round-3 fix, codex finding
  // R3-F1-ADMIN-PREFIX-PUBLIC-BYPASS — the original bare "/admin" prefix was not
  // path-segment bounded and let such slugs bypass the block via the site's GET /:slug catch-all).
];

function isAlwaysAllowed(path: string): boolean {
  if (ALWAYS_ALLOWED_EXACT_PATHS.has(path)) return true;
  return ALWAYS_ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function applySiteServingGate(app: Express, deps: { siteStatusRepo: SiteStatusPort; workspaceId: string }): void {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    if (isAlwaysAllowed(req.path)) {
      next();
      return;
    }

    const status = await deps.siteStatusRepo.get(deps.workspaceId);
    if (status !== "BLOCKED_PENDING_RECOVERY") {
      next();
      return;
    }

    res.status(503).json({
      error: "this site is blocked pending recovery from an interrupted migration — see /api/admin/v1/recovery/status",
      code: "SITE_BLOCKED_PENDING_RECOVERY",
    });
  });
}
