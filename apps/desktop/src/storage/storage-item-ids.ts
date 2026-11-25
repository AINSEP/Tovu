/**
 * @file P11 ST-18a.T — main-issued opaque Storage item IDs and action-bound confirmations.
 *
 * Why: the renderer is untrusted for authority. It only ever holds an opaque ID that is valid for
 * the sender that listed it, for one item kind, until it expires; and a confirmation that is bound
 * to one ID and one action and is spent on first use. A renderer-supplied path, partition name or
 * "confirmed" boolean is never authority.
 */

export interface StorageItemIdsRequired {
  readonly randomId: () => string;
  readonly now: () => number;
}

interface Entry<T> { readonly senderId: number; readonly kind: string; readonly target: T; readonly expiresAt: number }
interface Confirmation { readonly senderId: number; readonly id: string; readonly action: string; readonly expiresAt: number }

export interface StorageItemIds<T> {
  /** Drops every ID and confirmation of `senderId` (a fresh listing replaces the old one). */
  reset(required: { senderId: number }): void;
  issue(required: { senderId: number; kind: string; target: T }): string;
  /** The target, or `undefined` for an unknown, expired, other-sender or other-kind ID. */
  resolve(required: { senderId: number; id: string; kind: string }): T | undefined;
  issueConfirmation(required: { senderId: number; id: string; action: string }): string;
  /** Single use: the confirmation is consumed whether or not it matches. */
  spendConfirmation(required: { senderId: number; confirmationId: string }): { id: string; action: string } | undefined;
}

/**
 * @param optional.itemTtlMs how long an issued ID or confirmation stays valid (default 10 minutes).
 * @complexity O(1) per call; `reset` is O(n) in live entries.
 */
export function createStorageItemIds<T>(
  { randomId, now }: StorageItemIdsRequired,
  { itemTtlMs = 600_000 }: { itemTtlMs?: number } = {},
): StorageItemIds<T> {
  const items = new Map<string, Entry<T>>();
  const confirmations = new Map<string, Confirmation>();
  const live = (expiresAt: number) => now() < expiresAt;
  return {
    reset({ senderId }) {
      for (const [id, entry] of items) if (entry.senderId === senderId) items.delete(id);
      for (const [id, entry] of confirmations) if (entry.senderId === senderId) confirmations.delete(id);
    },
    issue({ senderId, kind, target }) {
      const id = randomId();
      items.set(id, { senderId, kind, target, expiresAt: now() + itemTtlMs });
      return id;
    },
    resolve({ senderId, id, kind }) {
      const entry = items.get(id);
      if (!entry || entry.senderId !== senderId || entry.kind !== kind || !live(entry.expiresAt)) return undefined;
      return entry.target;
    },
    issueConfirmation({ senderId, id, action }) {
      const confirmationId = randomId();
      confirmations.set(confirmationId, { senderId, id, action, expiresAt: now() + itemTtlMs });
      return confirmationId;
    },
    spendConfirmation({ senderId, confirmationId }) {
      const entry = confirmations.get(confirmationId);
      confirmations.delete(confirmationId);
      if (!entry || entry.senderId !== senderId || !live(entry.expiresAt)) return undefined;
      return { id: entry.id, action: entry.action };
    },
  };
}
