/**
 * @file The menu version-check loss, re-exported from `@jini-ai/cms/navigation`, where it now lives
 * next to `menuVersionConflictError` (Jini 2f9d7daa): Jini's own `updateMenuTree` read check throws
 * it, so the update-tree and assign-location routes must test against the same class.
 *
 * Why its own type: the routes answer it with `code: "VERSION_CONFLICT"` (the same code posts and
 * entries send) so the admin can tell it apart from the other 409s `MenuConflictError` also carries
 * (slug already taken, slug held by a trashed menu). Those want the server's own message; a lost
 * compare-and-set wants "someone else changed this, reload". A subclass, so every existing
 * `instanceof MenuConflictError` check keeps matching.
 */
export { MenuVersionConflictError } from "@jini-ai/cms/navigation";
