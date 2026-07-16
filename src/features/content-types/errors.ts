/**
 * @file SPEC-020 — typed error surface for the `content-types` package.
 *
 * Purpose:
 * Every rejection this package's write-service/lifecycle/cleanup/index-provisioning modules
 * produce is one of these classes, never a bare `Error`/string, so callers (routes, agent tools,
 * tests) can branch on `instanceof` or on `.name` without parsing a message.
 *
 * `class X extends Error {}` does NOT give an instance a `.name` of `"X"` on this runtime unless
 * the constructor sets `this.name` explicitly (confirmed empirically in Session 2 of this
 * workstream) — every class below sets it.
 *
 * Architectural role:
 * `features/content-types` domain logic. No dependencies.
 */

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** CIC U-002-B1 guard 1 — `key`/field-name grammar gate `^[a-z][a-z0-9_]{0,63}$` (U-001-B2). */
export class InvalidKeyGrammarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKeyGrammarError";
  }
}

/** CIC U-002-B1 guard 2 — `key` is one of the permanently reserved legacy `posts` keys. */
export class ReservedContentTypeKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReservedContentTypeKeyError";
  }
}

/** CIC U-002-B1 guard 3 — a field name fails the identifier grammar gate. */
export class InvalidFieldNameGrammarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFieldNameGrammarError";
  }
}

/** CIC U-001-B1 / U-002-B1 guard 4 — a field `kind` is not one of the closed 5-entry enum. */
export class InvalidFieldKindError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFieldKindError";
  }
}

/** CIC U-002-B1 guard 5 — more than the per-type cap of `queryable` fields were submitted. */
export class QueryableFieldCapExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryableFieldCapExceededError";
  }
}

/** CIC U-004-B1 — `expectedVersion` did not match the current row's version (OCC conflict). */
export class VersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VersionConflictError";
  }
}

export class ContentTypeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CONTENT_TYPE_NOT_FOUND";
  }
}

/** A generic validation rejection carrying a stable machine-readable `details.reason`. */
export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR" as const;
  readonly details: { reason: string };

  constructor(message: string, reason: string) {
    super(message);
    this.name = "VALIDATION_ERROR";
    this.details = { reason };
  }
}

/** REQ-09..12 lifecycle state-machine guard rejection (INV-06 terminal-tombstone, EC-09 deprecate-first). */
export class ContentTypeLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentTypeLifecycleError";
  }
}

/** REQ-20 `planCleanup` eligibility-gate rejection; `reason` is one of a closed, ordered set. */
export class CleanupNotEligibleError extends Error {
  readonly reason: string;

  constructor(reason: string, message?: string) {
    super(message ?? `cleanup is not eligible: ${reason}`);
    this.name = "CleanupNotEligibleError";
    this.reason = reason;
  }
}
