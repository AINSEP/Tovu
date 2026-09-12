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
 *
 * `canSubmitRename`, `renameSubmission`, and `describeRenameFailure` are pulled out as plain
 * functions — same reason `folder-drop.ts` was pulled out of `App.hooks.ts`: this package has no
 * React renderer at all (no jsdom, no testing-library, no react-test-renderer), so a decision left
 * inside `useSiteRename`'s body is untestable without one. Each takes exactly what it needs as an
 * argument rather than closing over hook state, so `submitRename` below is reduced to calling them
 * and writing whatever they decide into `useState` — no decision of its own left to get wrong.
 */
import { useState } from 'react';

import { runnerInventoryBridge } from './runner-api.js';
import type { RunnerInventoryBridge } from './runner-api.js';
import type { RenameSiteInput, SiteRecord } from '../contracts/project.js';

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

/** Whether Save should be enabled — a valid name, and nothing already in flight.
 *  @complexity O(n) in the draft length (delegates to {@link isValidSiteName}). */
export function canSubmitRename(draft: string, saving: boolean): boolean {
  return isValidSiteName(draft) && !saving;
}

/** Shown when `runnerInventoryBridge()` returns nothing — a renderer running outside Electron (a
 *  plain `vite preview`, a test harness). */
export const NO_BRIDGE_RENAME_MESSAGE = 'The desktop bridge is unavailable, so this site could not be renamed.';

export type RenameSubmission =
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'submit'; readonly bridge: RunnerInventoryBridge; readonly payload: RenameSiteInput };

/**
 * What submitting a rename should do next: refuse before calling anything (no desktop bridge is
 * reachable), or the bridge to call and the exact payload to send it. Never calls anything itself —
 * the caller acts on the result — so this is testable with a fake bridge and no hook, no state, no
 * renderer.
 *
 * @complexity O(1).
 */
export function renameSubmission(
  bridge: RunnerInventoryBridge | undefined,
  id: string,
  draft: string,
): RenameSubmission {
  if (bridge === undefined) return { kind: 'refused', message: NO_BRIDGE_RENAME_MESSAGE };
  return { kind: 'submit', bridge, payload: { id, name: draft } };
}

/**
 * The message to show for a rejected rename. Main's own sentence, verbatim, when it threw a real
 * `Error` — main's refusals name the fix ("1 to 200 characters once surrounding spaces are
 * removed"), and paraphrasing would drop exactly the half the operator needs, same contract
 * `use-add-site.hooks.ts` documents for its own errors. The coerced string otherwise.
 *
 * @complexity O(n) in the message length.
 */
export function describeRenameFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const decision = renameSubmission(runnerInventoryBridge(), id, draft);
    if (decision.kind === 'refused') {
      // Set the error WITHOUT ever setting `saving` — a call that never reached the bridge did not
      // start, and a spinner for work that is not happening is a lie. Same reasoning
      // `useProjectStart` documents for its own missing-bridge arm.
      setRenameError(decision.message);
      return;
    }
    setSaving(true);
    setRenameError(null);
    try {
      const record = await decision.bridge.renameSite(decision.payload);
      setRenamingId(null);
      onRenamed?.(record);
    } catch (err) {
      setRenameError(describeRenameFailure(err));
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
    canSave: canSubmitRename(draft, saving),
    startRename,
    cancelRename,
    submitRename,
  };
}
