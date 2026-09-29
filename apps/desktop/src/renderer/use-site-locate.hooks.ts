/**
 * @file The missing-folder card's Locate button (`SiteRecord.folderMissing`). Main opens the folder
 * picker and repoints the card (`SITE_IPC_CHANNELS.locate`); this hook only tracks which card is
 * mid-locate and what went wrong, and hands the resolved record up so the grid shows the found site
 * at once instead of after the next 4 s poll.
 *
 * The resolved record has a DIFFERENT id — a record's id is its folder — so the callback gets the
 * old id too, for the caller to know which card it replaces.
 */
import { useCallback, useState } from 'react';

import { runnerInventoryBridge } from './runner-api.js';
import { describeAddFailure } from './use-add-site.hooks.js';
import type { SiteRecord } from '../contracts/project.js';

export interface SiteLocate {
  /** The card whose picker is open, or `null`. */
  locatingId: string | null;
  /** Why this card's last Locate failed, or `null`. Main's own sentence, verbatim. */
  errorOf: (id: string) => string | null;
  locate: (id: string) => Promise<void>;
}

/** A settled Locate: the record at its new folder, main's refusal, or neither (the operator cancelled). */
export type SiteLocateResult = { record?: SiteRecord; error?: string };

/**
 * One Locate against the bridge, with every failure turned into the sentence the card shows.
 * A cancelled picker is the operator's own choice, so it comes back as neither record nor error.
 *
 * @complexity O(1) beyond the IPC round trip.
 */
export async function performLocate(
  id: string,
  bridge: { locateSite: (id: string) => Promise<SiteRecord> } | undefined,
): Promise<SiteLocateResult> {
  if (bridge === undefined) return { error: 'The desktop bridge is unavailable.' };
  try {
    return { record: await bridge.locateSite(id) };
  } catch (err) {
    const error = describeAddFailure(err);
    return error === null ? {} : { error };
  }
}

/**
 * @param onLocated called with main's record at the found folder and the id it replaces.
 * @complexity O(1) per render.
 */
export function useSiteLocate(onLocated?: (record: SiteRecord, previousId: string) => void): SiteLocate {
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const errorOf = useCallback((id: string) => errors[id] ?? null, [errors]);

  const locate = useCallback(
    async (id: string) => {
      setLocatingId(id);
      const result = await performLocate(id, runnerInventoryBridge());
      setErrors((current) => {
        const { [id]: _cleared, ...rest } = current;
        return result.error === undefined ? rest : { ...rest, [id]: result.error };
      });
      if (result.record !== undefined) onLocated?.(result.record, id);
      setLocatingId(null);
    },
    [onLocated],
  );

  return { locatingId, errorOf, locate };
}
