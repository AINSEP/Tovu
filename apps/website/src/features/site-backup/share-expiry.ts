import {
  isShareExpiryChoice as jiniIsShareExpiryChoice, requireOwnFolder as jiniRequireOwnFolder, shareExpiresAt as jiniShareExpiresAt,
  type ShareExpiryCopy, type ShareExpiryDestination, type ShareExpiryHost,
} from "@jini-ai/devops/backup/site/share-expiry";
import { isOwnShareFolder } from "./share-own-folder.js";

/** @file Binds Jini's share-link expiry hooks to this host's day choices, own-folder provider and plain words (P11 ST-12a/b). */

export { isShareExpired, type ShareExpiryCopy } from "@jini-ai/devops/backup/site/share-expiry";

/** This server's own share folder provider id: the only destination whose links can expire. */
export const SHARE_OWN_FOLDER_PROVIDER = "tovu-server";

/** The owner's expiry choices besides the default, Never (owner defaults 2026-11-22, Q4). */
export const SHARE_EXPIRY_DAYS = [7, 30, 90] as const;
export type ShareExpiryDays = (typeof SHARE_EXPIRY_DAYS)[number];

export const SHARE_EXPIRY_COPY: ShareExpiryCopy = {
  choices: "A share link can expire after 7, 30 or 90 days, or never.",
  notHostedHere: "Only links this server hosts in its own share folder can expire. Choose Never for this export.",
  remote: ({ provider }) => `Links stored with ${provider} can't expire yet. Choose Never, or turn off that storage for this export.`,
};

/** The expiry host policy injected into Jini's share backend and service. */
export const SHARE_EXPIRY_HOST: ShareExpiryHost = {
  choices: SHARE_EXPIRY_DAYS,
  copy: SHARE_EXPIRY_COPY,
  expiredMessage: ({ row }) => `This link expired${row.expiresAt ? ` on ${row.expiresAt.slice(0, 10)}` : ""} and its file was removed.`,
};

/** True for 7, 30 or 90 (the choices besides Never). */
export function isShareExpiryChoice(required: { days: unknown }, _optional: Record<string, never> = {}): required is { days: ShareExpiryDays } {
  return jiniIsShareExpiryChoice({ days: required.days, choices: SHARE_EXPIRY_DAYS });
}

/** Refuses an expiry unless the destination is affirmatively this server's own share folder. */
export function requireOwnFolder(required: { destination: ShareExpiryDestination | undefined; copy?: ShareExpiryCopy }, _optional: Record<string, never> = {}): void {
  jiniRequireOwnFolder({ destination: required.destination, copy: required.copy ?? SHARE_EXPIRY_COPY, ownFolderProvider: SHARE_OWN_FOLDER_PROVIDER, isOwnFolder: isOwnShareFolder });
}

/** The `expiresAt` a new share records for the owner's choice; `null` (Never) is the default. */
export function shareExpiresAt(required: { days: number | null; now: number; destination: ShareExpiryDestination | undefined }, _optional: Record<string, never> = {}): string | null {
  return jiniShareExpiresAt({ ...required, expiry: SHARE_EXPIRY_HOST, ownFolderProvider: SHARE_OWN_FOLDER_PROVIDER, isOwnFolder: isOwnShareFolder });
}
