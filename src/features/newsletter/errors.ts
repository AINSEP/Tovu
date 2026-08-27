/**
 * @file Typed domain errors for `newsletter` (SPEC-011 errors.spec.md §2).
 *
 * Purpose:
 * One class per error this module originates, mirroring the
 * `DefinitionNotFoundError`/`ForbiddenError` convention in `src/features/settings/errors.ts` and
 * `src/members/types.ts`'s error-class pattern. Route handlers map these 1:1 to the HTTP codes in
 * errors.spec.md §2 (see `src/server/routes/admin/newsletter/deps.ts`'s error-mapping helper).
 */

export class NewsletterCampaignNotFoundError extends Error {}
export class NewsletterListNotFoundError extends Error {}
export class NewsletterSubscriptionNotFoundError extends Error {}

/** errors.spec.md §3: `{ subscriberId: uuid }`. */
export class NewsletterSubscriberNotFoundError extends Error {
  constructor(
    message: string,
    public readonly subscriberId: string
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ field: string, reason: string }`. */
export class NewsletterValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly reason: string
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ currentStatus, attemptedAction }`. */
export class NewsletterCampaignNotEditableError extends Error {
  constructor(
    message: string,
    public readonly currentStatus: string,
    public readonly attemptedAction: string
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ listId: uuid }`. */
export class NewsletterDefaultListProtectedError extends Error {
  constructor(
    message: string,
    public readonly listId: string
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ entity, id, expectedVersion, actualVersion }` (EC-06 optimistic concurrency). */
export class NewsletterConflictError extends Error {
  constructor(
    message: string,
    public readonly entity: "campaign" | "list" | "subscription",
    public readonly id: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ unmetPreconditions: string[] }` — INV-05, always the FULL unmet set. */
export class NewsletterLaunchGateBlockedError extends Error {
  constructor(
    message: string,
    public readonly unmetPreconditions: readonly string[]
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ reason: 'expired'|'already_consumed'|'not_found' }`. */
export class NewsletterConfirmTokenInvalidError extends Error {
  constructor(
    message: string,
    public readonly reason: "expired" | "already_consumed" | "not_found"
  ) {
    super(message);
  }
}

/** errors.spec.md §3: `{ reason: 'consent_revision_mismatch'|'signature_invalid'|'expired'|'not_found' }` (INV-04). */
export class NewsletterUnsubscribeTokenInvalidError extends Error {
  constructor(
    message: string,
    public readonly reason: "consent_revision_mismatch" | "signature_invalid" | "expired" | "not_found"
  ) {
    super(message);
  }
}

/** Fail-closed authorization error — mirrors `settings/errors.ts`'s `ForbiddenError`. */
export class NewsletterForbiddenError extends Error {}
