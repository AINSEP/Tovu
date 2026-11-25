/**
 * Trash retention window, in days — the ONE host-owned value (owner decision G7-4).
 *
 * The engine (`@jini-ai/cms/trash`) has no default: `createTrashService` and `computePurgeAfter`
 * both require the window, and every host call site passes this constant. It is stamped into
 * `trashed_items.purge_after` at delete time, so changing it later never shortens what a row was
 * already promised (rows trashed under the old 60-day window keep their stamp; no migration).
 */
export const TRASH_RETENTION_DAYS = 30;
