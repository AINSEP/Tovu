/** @file Redirect table names Tovu owns; SQL, Trash and publish read the same constant. */
/** Tovu owns these persisted names; SQL, Trash and publish coverage use the same wiring. */
export const REDIRECT_TABLES = {
  redirects: "redirects",
  revisions: "redirect_revisions",
  hits: "redirect_hits",
} as const;
