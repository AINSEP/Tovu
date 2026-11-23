import { adminFailureResponse, type AdminFailurePorts } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";

import type { AuthorizeFn } from "@jini-ai/core/contracts/events";
import type { PrincipalRecord } from "@jini-ai/user-management";
import { authorizeDirectOrRespond } from "#src/server/inbound/admin-http/authorize-guard";
import { getAuthedPrincipal } from "../dev-auth.js";
import { newsletterErrorResponse } from "#src/features/newsletter/http-error-responses";

/**
 * @file Response DTOs + typed-error -> HTTP mapping for the admin `newsletter` HTTP surface
 * (SPEC-011, ADR-PIPE-011). Mirrors `apps/website/src/server/inbound/admin-http/http/widgets.ts`'s split: HTTP-facing
 * serialization + error mapping only — no newsletter business logic lives here (that stays in
 * `newsletter/*.ts`).
 *
 * Unlike `widgets`, none of Newsletter's domain functions call `authorize()`/throw
 * `NewsletterForbiddenError` themselves (api.spec.md's Purpose section: "principal resolved from
 * the authenticated dev-session ... permission checked directly via `deps.authorize()` — not a
 * Bearer-JWT profile"). Every admin route therefore calls `requireNewsletterPermissionOrRespond`
 * as its own first line, mirroring `apps/website/src/server/inbound/admin-http/routes/menus/create.ts`'s inline `authorize()`+403
 * pattern (the same convention `apps/website/src/server/inbound/admin-http/http/widgets.ts`'s doc comment cites for its own handful of
 * no-domain-wrapper routes).
 */

export type NewsletterEntityType = "newsletter_campaign" | "newsletter_list" | "newsletter_subscription";

/**
 * Checks `permission` via `authorize()` and writes a 403 `{error, code: "FORBIDDEN", details}`
 * response (matching every other admin route's error envelope in this repo) if denied. Returns
 * the authed principal on success, or `null` after already writing the 403 — callers `return` on
 * `null` without writing anything further.
 */
export async function requireNewsletterPermissionOrRespond({ authorize, workspaceId, permission, entityType, res }: { authorize: AuthorizeFn; workspaceId: string; permission: string; entityType: NewsletterEntityType; res: Response }, _optional = {}): Promise<PrincipalRecord | null> {
  const principal = getAuthedPrincipal(res);
  const params = { principalId: principal.id, permission, workspaceId, entityType };
  return (await authorizeDirectOrRespond({ res, authorize, params })) ? principal : null;
}

export interface NewsletterErrorResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Pure typed-error -> `{status, body}` mapping, applied uniformly across every admin route
 * (errors.spec.md §2 is the canonical code -> HTTP-status registry; api.spec.md §6's per-endpoint
 * tables are a representative, non-exhaustive subset of which of these codes each endpoint's
 * underlying chokepoint can actually raise — e.g. `CREATE_CAMPAIGN`/`SCHEDULE_CAMPAIGN` can both
 * surface `NEWSLETTER_LIST_NOT_FOUND` via `campaign-write-service.ts`'s `requireEditableListId`
 * even though that endpoint's own api.spec.md row doesn't separately enumerate it).
 */
export function newsletterErrorToResponse({ err }: { err: unknown }, options: AdminFailurePorts = {}): NewsletterErrorResponse {
  // The class table itself lives with the error classes (`features/newsletter/http-error-responses.ts`),
  // shared with the Jini route specs that receive it injected; this hand-written path adds the 500.
  return newsletterErrorResponse({ err }) ?? adminFailureResponse({ error: err, tracker: options.tracker }, { operation: "http/newsletter" });
}

/** Maps every typed `newsletter` domain error to its HTTP response; falls through to a generic 500. */
export function mapNewsletterErrorToResponse({ err, res }: { err: unknown; res: Response }, _optional = {}): void {
  const { status, body } = newsletterErrorToResponse({ err }, { tracker: res.locals?.adminFailureTracker });
  res.status(status).json(body);
}

/** `{ data: T }` envelope — api.spec.md §5's `CampaignResponse`/`NewsletterListResponse`/etc. shape. */
export function toDataResponse<T>({ data }: { data: T }, _optional: Record<string, never> = {}): { data: T } {
  return { data };
}
