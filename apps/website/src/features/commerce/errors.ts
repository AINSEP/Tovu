/**
 * @file Typed domain errors for `commerce`. Mirrors the `features/forms/errors.ts` /
 * `PostConflictError`-style convention already used throughout this codebase — one class per
 * error this module originates.
 */

/** The referenced product does not exist (or is not visible) in this workspace. */
export class CommerceProductNotFoundError extends Error {}

/** The referenced price does not exist in this workspace, or is not `status: "active"`. */
export class CommercePriceNotFoundError extends Error {}

/** The referenced order does not exist in this workspace. */
export class CommerceOrderNotFoundError extends Error {}

/** Checkout input failed validation before any row was written. */
export class CommerceCheckoutValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Array<{ field: string; reason: string }> = []
  ) {
    super(message);
  }
}
