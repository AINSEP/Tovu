import { SiteShareRefusal } from "./share-policy.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The owner's expiry choices besides the default, Never (owner defaults 2026-11-22, Q4). */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;

/**
 * The `expiresAt` a new share records for the owner's choice; `null` (Never) is the default.
 * @throws {SiteShareRefusal} INVALID_INPUT for any other number of days.
 */
export function shareExpiresAt(required: { days: number | null; now: number }, _optional: Record<string, never> = {}): string | null {
  if (required.days === null) return null;
  if (!(SHARE_EXPIRY_DAYS as readonly number[]).includes(required.days)) {
    throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "A share link can expire after 7, 30 or 90 days, or never." });
  }
  return new Date(required.now + required.days * DAY_MS).toISOString();
}

/**
 * True once a share's own stated expiry has passed. A row without the field never expires (every
 * row made before ST-12a, and every peer-uploaded row). A value that does not parse counts as
 * expired, so a damaged row can only stop a public link, never extend one.
 */
export function isShareExpired(required: { row: { readonly expiresAt?: string | null }; now: number }, _optional: Record<string, never> = {}): boolean {
  const { expiresAt } = required.row;
  if (expiresAt === undefined || expiresAt === null) return false;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || required.now >= at;
}
