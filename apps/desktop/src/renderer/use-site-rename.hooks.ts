/**
 * @file "Rename…" — the site grid's inline rename flow, kept out of `SiteGrid.tsx` because this
 * repo keeps derived logic and async state out of `.tsx` files (same rule `SiteGrid.hooks.ts` and
 * `use-add-site.hooks.ts` already follow).
 *
 * Shaped deliberately like `useDeleteConfirmation`, its sibling in the same grid: one id saying
 * which card is in the flow, one in-flight flag, one error string from the last failed attempt.
 * Two flows that look the same on a card should read the same in the code.
 *
 * The draft name lives HERE rather than in the card, for the reason the delete flow keeps
 * `pendingId` at grid level: only one card may be renaming at a time, and state that permits two
 * would eventually show two. Opening a rename on a second card replaces the first rather than
 * stacking, which is also what the operator means by clicking it.
 */
import { useState } from 'react';

import { runnerInventoryBridge } from './runner-api.js';
import type { SiteRecord } from '../contracts/project.js';

/**
 * `validateConfig`'s bound (`apps/website/src/platform/site-dir/read-site-dir.ts`), mirrored so the
 * Save button can refuse the same names main refuses.
 *
 * **This is the first line, never the guarantee.** `site-config.js` re-applies the identical rule
 * on the other side of the wire, because a name that slipped past here would not break the running
 * site — it would stop the NEXT boot, with an error naming a file the operator never edited.
 */
const NAME_MAX_LENGTH = 200;

/**
 * Whether `draft` is a name Tovu will still accept at the site's next boot.
 *
 * Trims BEFORE measuring, exactly as `validateConfig` does — `"   "` is empty, not length 3. A
 * check that measured first would enable Save on a name that bricks the boot.
 *
 * @complexity O(n) in the draft length.
 */
export function isValidSiteName(draft: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed.length <= NAME_MAX_LENGTH;
}

export interface SiteRenameState {
  /** The card currently being renamed, or `null`. */
  renamingId: string | null;
  draft: string;
  setDraft: (next: string) => void;
  saving: boolean;
  renameError: string | null;
  /** Whether Save should be enabled — a valid name, and nothing already in flight. */
  canSave: boolean;
  startRename: (project: SiteRecord) => void;
  cancelRename: () => void;
  submitRename: (id: string) => Promise<void>;
}

/**
 * Drive the grid's rename flow.
 *
 * @param onRenamed called after a successful rename so the caller can refresh its list. The record
 *   main returns is handed over rather than re-fetched — main already built it, and a second
 *   `list` round trip would let the card show a stale name for a frame.
 */
export function useSiteRename(onRenamed?: (record: SiteRecord) => void): SiteRenameState {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const startRename = (project: SiteRecord) => {
    setRenameError(null);
    // Seeded with the CURRENT name, so the common edit (fix a typo, add a word) starts from what is
    // there rather than from an empty field the operator has to retype.
    setDraft(project.displayName);
    setRenamingId(project.id);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameError(null);
  };

  const submitRename = async (id: string) => {
    const bridge = runnerInventoryBridge();
    if (!bridge) {
      // Set the error WITHOUT ever setting `saving` — a call that never reached the bridge did not
      // start, and a spinner for work that is not happening is a lie. Same reasoning
      // `useProjectStart` documents for its own missing-bridge arm.
      setRenameError('The desktop bridge is unavailable, so this site could not be renamed.');
      return;
    }
    setSaving(true);
    setRenameError(null);
    try {
      const record = await bridge.renameSite({ id, name: draft });
      setRenamingId(null);
      onRenamed?.(record);
    } catch (err) {
      // Main's own sentence, verbatim. Every refusal it raises names the fix — "remove this card and
      // add the site again from its new location", "1 to 200 characters once surrounding spaces are
      // removed" — and paraphrasing would drop exactly the half the operator needs. Same contract
      // `use-add-site.hooks.ts` documents for its own errors.
      setRenameError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return {
    renamingId,
    draft,
    setDraft,
    saving,
    renameError,
    canSave: isValidSiteName(draft) && !saving,
    startRename,
    cancelRename,
    submitRename,
  };
}
