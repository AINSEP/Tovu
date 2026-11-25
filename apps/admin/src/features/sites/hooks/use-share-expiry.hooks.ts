import { useState } from "react";
import type { ShareExpiryDays, SiteShare } from "./site-transfer-dependencies.hooks";
import { isExpiredShare } from "../site-transfer-rules";

/**
 * @file The Export tab's share-expiry state (P11 ST-12b.T): the owner's Never/7/30/90 choice for the
 * next export, the "Show expired exports" filter, and the dismissed expiry notice. Never is the
 * default, and a day choice the destination does not honour falls back to Never (owner rule (c)).
 */

/** What `ShareExpiryControls` reads through its required `useShareExpiry` hook. */
export interface ShareExpiryHookResult {
  expiresInDays: ShareExpiryDays | null;
  change: (required: { expiresInDays: ShareExpiryDays | null }) => void;
  acknowledge: () => void;
  setShowExpired: (required: { showExpired: boolean }) => void;
}

export interface ShareExpiryController {
  /** Injected into `ShareExpiryControls`; returns this render's state, so it calls no hooks itself. */
  useShareExpiry: () => ShareExpiryHookResult;
  /** Day choices the destination honours, from the list response; empty means Never only. */
  choices: readonly ShareExpiryDays[];
  /** The effective choice the next backup export sends; `null` is Never. */
  expiresInDays: ShareExpiryDays | null;
  showExpired: boolean;
  /** The expired export whose notice the owner dismissed. Dismissing is local and never changes a status. */
  acknowledgedId: string | null;
}

const DAY_CHOICES: readonly ShareExpiryDays[] = [7, 30, 90];

/** Keeps only the server's choices this admin knows; anything unexpected is dropped, never guessed. O(1). */
export function shareExpiryChoices({ offered }: { offered: readonly (number | null)[] | undefined }, _optional = {}): readonly ShareExpiryDays[] {
  return DAY_CHOICES.filter(days => offered?.includes(days) === true);
}

export function useShareExpiryState(
  { offered, newestBackup }: { offered: readonly (number | null)[] | undefined; newestBackup: SiteShare | undefined },
  _optional = {},
): ShareExpiryController {
  const [chosen, setChosen] = useState<ShareExpiryDays | null>(null);
  const [showExpired, setShowExpiredState] = useState(true);
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null);
  const choices = shareExpiryChoices({ offered });
  // Fail closed: a choice the current destination no longer honours is sent as Never, not refused later.
  const expiresInDays = chosen !== null && choices.includes(chosen) ? chosen : null;
  const result: ShareExpiryHookResult = {
    expiresInDays,
    change: ({ expiresInDays: next }) => setChosen(next),
    acknowledge: () => { if (newestBackup && isExpiredShare({ share: newestBackup })) setAcknowledgedId(newestBackup.shareId); },
    setShowExpired: ({ showExpired: next }) => setShowExpiredState(next),
  };
  return { useShareExpiry: () => result, choices, expiresInDays, showExpired, acknowledgedId };
}
