import { SiteShareRefusal } from "@jini-ai/devops/backup/site/share-refusal";
import { isOwnShareFolder } from "./share-own-folder.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The owner's expiry choices besides the default, Never (owner defaults 2026-11-22, Q4). */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;
export type ShareExpiryDays = (typeof SHARE_EXPIRY_DAYS)[number];

/** The plain-words refusals for an expiry choice; Tovu owns the wording, callers inject it. */
export interface ShareExpiryCopy {
  readonly choices: string;
  readonly notHostedHere: string;
  remote(required: { provider: string }): string;
}

export const SHARE_EXPIRY_COPY: ShareExpiryCopy = {
  choices: "A share link can expire after 7, 30 or 90 days, or never.",
  notHostedHere: "Only links this server hosts in its own share folder can expire. Choose Never for this export.",
  remote: ({ provider }) => `Links stored with ${provider} can't expire yet. Choose Never, or turn off that storage for this export.`,
};

/** True for 7, 30 or 90 (the choices besides Never). */
export function isShareExpiryChoice(required: { days: unknown }, _optional: Record<string, never> = {}): required is { days: ShareExpiryDays } {
  return (SHARE_EXPIRY_DAYS as readonly unknown[]).includes(required.days);
}

/**
 * The `expiresAt` a new share records for the owner's choice; `null` (Never) is the default and is
 * accepted for any destination. A date is accepted only for affirmative own-folder hosting: only this
 * server's token route checks `expiresAt`, so a remote provider (or no recorded destination) would
 * keep serving past the stated date — ST-12b can only remove a copy it affirmatively owns.
 * @throws {SiteShareRefusal} INVALID_INPUT for any other number of days, or a destination not affirmed as own folder.
 */
export function shareExpiresAt(required: { days: number | null; now: number; destination: { provider: string; binding?: string } | undefined; copy: ShareExpiryCopy }, _optional: Record<string, never> = {}): string | null {
  const { days, destination, copy } = required;
  if (days === null) return null;
  if (!isShareExpiryChoice({ days })) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: copy.choices });
  requireOwnFolder({ destination, copy });
  return new Date(required.now + days * DAY_MS).toISOString();
}

/** Refuses an expiry unless the destination is affirmatively this server's own share folder. */
export function requireOwnFolder(required: { destination: { provider: string; binding?: string } | undefined; copy: ShareExpiryCopy }, _optional: Record<string, never> = {}): void {
  const { destination, copy } = required;
  if (!destination) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: copy.notHostedHere });
  if (isOwnShareFolder({ storage: destination })) return;
  const message = destination.provider === "tovu-server" ? copy.notHostedHere : copy.remote({ provider: destination.provider });
  throw new SiteShareRefusal({ code: "INVALID_INPUT", message });
}

/**
 * True once a share's own stated expiry has passed. Why absent metadata is neither provenance nor
 * expiry: rows made before ST-12a and every peer-uploaded row (`url: null`, no `storage`) simply lack
 * the field, so a missing `expiresAt` says nothing about who made the link or whether it should stop —
 * it never expires (owner rule (c): live share links never break). A persisted value that does not
 * parse counts as expired for SERVING only, so a damaged row can stop a public link but never extend
 * one; it is not evidence that the ZIP may be removed (ST-12b decides that on its own proof).
 */
export function isShareExpired(required: { row: { readonly expiresAt?: string | null }; now: number }, _optional: Record<string, never> = {}): boolean {
  const { expiresAt } = required.row;
  if (expiresAt === undefined || expiresAt === null) return false;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || required.now >= at;
}
