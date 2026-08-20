import type { Response } from "express";

import type { AuthorizeFn } from "@jini-ai/cms/core";
import type { PrincipalRecord } from "@jini-ai/cms/identity";
import { getAuthedPrincipal } from "../../middleware/dev-auth.js";
import {
  NewsletterCampaignNotEditableError,
  NewsletterCampaignNotFoundError,
  NewsletterConflictError,
  NewsletterDefaultListProtectedError,
  NewsletterForbiddenError,
  NewsletterLaunchGateBlockedError,
  NewsletterListNotFoundError,
  NewsletterSubscriberNotFoundError,
  NewsletterSubscriptionNotFoundError,
  NewsletterValidationError,
} from "#src/newsletter/index";

/**
 * @file Response DTOs + typed-error -> HTTP mapping for the admin `newsletter` HTTP surface
 * (SPEC-011, ADR-PIPE-011). Mirrors `server/http/admin/widgets.ts`'s split: HTTP-facing
 * serialization + error mapping only — no newsletter business logic lives here (that stays in
 * `newsletter/*.ts`).
 *
 * Unlike `widgets`, none of Newsletter's domain functions call `authorize()`/throw
 * `NewsletterForbiddenError` themselves (api.spec.md's Purpose section: "principal resolved from
 * the authenticated dev-session ... permission checked directly via `deps.authorize()` — not a
 * Bearer-JWT profile"). Every admin route therefore calls `requireNewsletterPermissionOrRespond`
 * as its own first line, mirroring `routes/admin/menus/create.ts`'s inline `authorize()`+403
 * pattern (the same convention `http/admin/widgets.ts`'s doc comment cites for its own handful of
 * no-domain-wrapper routes).
 */

export type NewsletterEntityType = "newsletter_campaign" | "newsletter_list" | "newsletter_subscription";

/**
 * Checks `permission` via `authorize()` and writes a 403 `{error, code: "FORBIDDEN", details}`
 * response (matching every other admin route's error envelope in this repo) if denied. Returns
 * the authed principal on success, or `null` after already writing the 403 — callers `return` on
 * `null` without writing anything further.
 */
export async function requireNewsletterPermissionOrRespond(
  authorize: AuthorizeFn,
  workspaceId: string,
  permission: string,
  entityType: NewsletterEntityType,
  res: Response
): Promise<PrincipalRecord | null> {
  const principal = getAuthedPrincipal(res);
  const authResult = await authorize({ principalId: principal.id, permission, workspaceId, entityType });
  if (!authResult.allowed) {
    res.status(403).json({
      error: `principal '${principal.id}' is not authorized for '${permission}' (${authResult.reason})`,
      code: "FORBIDDEN",
      details: { permission, reason: authResult.reason },
    });
    return null;
  }
  return principal;
}

export interface NewsletterErrorResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Ordered `errorClass -> mapper` table backing `newsletterErrorToResponse`. Order matters only in
 * that every listed class must be checked before the unconditional 500 fallback — the classes
 * themselves are disjoint (none is a subclass of another here), so relative order among them is
 * not significant.
 */
const NEWSLETTER_ERROR_MAPPERS: ReadonlyArray<
  readonly [abstract new (...args: never[]) => Error, (err: never) => NewsletterErrorResponse]
> = [
  [
    NewsletterValidationError,
    (err: NewsletterValidationError) => ({
      status: 400,
      body: { error: err.message, code: "NEWSLETTER_VALIDATION_ERROR", details: { field: err.field, reason: err.reason } },
    }),
  ],
  [
    NewsletterSubscriberNotFoundError,
    (err: NewsletterSubscriberNotFoundError) => ({
      status: 400,
      body: { error: err.message, code: "NEWSLETTER_SUBSCRIBER_NOT_FOUND", details: { subscriberId: err.subscriberId } },
    }),
  ],
  [
    NewsletterCampaignNotEditableError,
    (err: NewsletterCampaignNotEditableError) => ({
      status: 409,
      body: {
        error: err.message,
        code: "NEWSLETTER_CAMPAIGN_NOT_EDITABLE",
        details: { currentStatus: err.currentStatus, attemptedAction: err.attemptedAction },
      },
    }),
  ],
  [
    NewsletterDefaultListProtectedError,
    (err: NewsletterDefaultListProtectedError) => ({
      status: 409,
      body: { error: err.message, code: "NEWSLETTER_DEFAULT_LIST_PROTECTED", details: { listId: err.listId } },
    }),
  ],
  [
    NewsletterConflictError,
    (err: NewsletterConflictError) => ({
      status: 409,
      body: {
        error: err.message,
        code: "NEWSLETTER_CONFLICT",
        details: { entity: err.entity, id: err.id, expectedVersion: err.expectedVersion, actualVersion: err.actualVersion },
      },
    }),
  ],
  [
    NewsletterLaunchGateBlockedError,
    (err: NewsletterLaunchGateBlockedError) => ({
      status: 409,
      body: { error: err.message, code: "NEWSLETTER_LAUNCH_GATE_BLOCKED", details: { unmetPreconditions: err.unmetPreconditions } },
    }),
  ],
  [
    NewsletterCampaignNotFoundError,
    (err: NewsletterCampaignNotFoundError) => ({ status: 404, body: { error: err.message, code: "NEWSLETTER_CAMPAIGN_NOT_FOUND" } }),
  ],
  [
    NewsletterListNotFoundError,
    (err: NewsletterListNotFoundError) => ({ status: 404, body: { error: err.message, code: "NEWSLETTER_LIST_NOT_FOUND" } }),
  ],
  [
    NewsletterSubscriptionNotFoundError,
    (err: NewsletterSubscriptionNotFoundError) => ({ status: 404, body: { error: err.message, code: "NEWSLETTER_SUBSCRIPTION_NOT_FOUND" } }),
  ],
  [NewsletterForbiddenError, (err: NewsletterForbiddenError) => ({ status: 403, body: { error: err.message, code: "FORBIDDEN" } })],
];

/**
 * Pure typed-error -> `{status, body}` mapping, applied uniformly across every admin route
 * (errors.spec.md §2 is the canonical code -> HTTP-status registry; api.spec.md §6's per-endpoint
 * tables are a representative, non-exhaustive subset of which of these codes each endpoint's
 * underlying chokepoint can actually raise — e.g. `CREATE_CAMPAIGN`/`SCHEDULE_CAMPAIGN` can both
 * surface `NEWSLETTER_LIST_NOT_FOUND` via `campaign-write-service.ts`'s `requireEditableListId`
 * even though that endpoint's own api.spec.md row doesn't separately enumerate it).
 */
export function newsletterErrorToResponse(err: unknown): NewsletterErrorResponse {
  for (const [ErrorClass, mapper] of NEWSLETTER_ERROR_MAPPERS) {
    if (err instanceof ErrorClass) return mapper(err as never);
  }
  return { status: 500, body: { error: "internal error", code: "INTERNAL_ERROR" } };
}

/** Maps every typed `newsletter` domain error to its HTTP response; falls through to a generic 500. */
export function mapNewsletterErrorToResponse(err: unknown, res: Response): void {
  const { status, body } = newsletterErrorToResponse(err);
  res.status(status).json(body);
}

/** `{ data: T }` envelope — api.spec.md §5's `CampaignResponse`/`NewsletterListResponse`/etc. shape. */
export function toDataResponse<T>(data: T): { data: T } {
  return { data };
}
