import type {
  StandingDraftAutosaveInput,
  StandingDraftAutosaveSnapshot,
} from "../hooks/use-standing-draft-autosave.hooks";

/**
 * @file Last-resort per-tab mirror for a standing draft the SERVER REFUSED (2026-09-06 stale-basis
 * fix). Deliberately NOT a general autosave backend — browser storage was explicitly rejected for
 * that (see `use-standing-draft-autosave.hooks.ts`'s header); this holds exactly one thing: the
 * text the server answered `applied: false` to, which by definition it will keep refusing until the
 * editor reloads the row. Server-side parking is impossible for that text, so without this the
 * operator's only copy lives in a tab they may close at any moment.
 *
 * Written only on a refusal, read only as the mount-time fallback when the server has nothing
 * parked, and dropped the moment the server accepts a write again, the operator discards, or a real
 * Save lands. Every access is wrapped: `localStorage` throws outright in some privacy modes and on
 * quota exhaustion, and a failed backup must never break the editor it is protecting.
 *
 * Type-only import from the hook module — no runtime edge, and the hook keeps owning the shapes
 * both editors already import from it.
 */

/** Namespaced so one entry's backup can never collide with another's, or with unrelated app keys. */
const KEY_PREFIX = "tovu.admin.standing-draft-backup.";

/** Stands in for the real principal id, which the client does not know — a recovered backup is
 *  identifiably local rather than pretending the server parked it. Nothing renders this today; it
 *  exists because {@link StandingDraftAutosaveSnapshot} requires the field and a lie there would be
 *  the same class of defect this whole fix is about. */
export const LOCAL_BACKUP_PRINCIPAL_ID = "local-tab-backup";

function keyFor(entryId: string): string {
  return `${KEY_PREFIX}${entryId}`;
}

/** Mirrors a refused draft for this browser profile. Silent no-op on any storage failure.
 *  @complexity Time/space: O(size of the draft) for the one `JSON.stringify`. */
export function writeStandingDraftLocalBackup(entryId: string, draft: StandingDraftAutosaveInput, savedAt: string): void {
  const snapshot: StandingDraftAutosaveSnapshot = { ...draft, savedAt, savedByPrincipalId: LOCAL_BACKUP_PRINCIPAL_ID };
  try {
    localStorage.setItem(keyFor(entryId), JSON.stringify(snapshot));
  } catch (err: unknown) {
    // eslint-disable-next-line no-console -- best-effort; the operator's text is still in the tab.
    console.warn("standing-draft local backup: could not write", err);
  }
}

/** The mirrored draft, or `null` when there is none (or storage is unreadable/corrupt).
 *  @complexity Time/space: O(size of the stored draft). */
export function readStandingDraftLocalBackup(entryId: string): StandingDraftAutosaveSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(entryId));
    return raw ? (JSON.parse(raw) as StandingDraftAutosaveSnapshot) : null;
  } catch {
    return null;
  }
}

/** Drops the mirror. Called on an accepted write, an explicit discard, and a real Save.
 *  @complexity Time/space: O(1). */
export function clearStandingDraftLocalBackup(entryId: string): void {
  try {
    localStorage.removeItem(keyFor(entryId));
  } catch {
    // Nothing to do and nothing to tell the operator — a backup that cannot be removed is
    // superseded by the next write anyway, and is never auto-applied.
  }
}
