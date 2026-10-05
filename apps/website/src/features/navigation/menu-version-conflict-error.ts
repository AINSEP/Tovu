import { MenuConflictError } from "@jini-ai/cms/navigation";

/**
 * @file The menu compare-and-set loss as its own type, so the update-tree route can answer it with
 * `code: "VERSION_CONFLICT"` (the same code posts and entries send) and the admin can tell it apart
 * from the other 409s `MenuConflictError` also carries on that route (slug already taken, slug held
 * by a trashed menu). Those want the server's own message; a lost compare-and-set wants
 * "someone else changed this, reload".
 *
 * A subclass, so every existing `instanceof MenuConflictError` check keeps matching. Jini's
 * `menuVersionConflictError` factory still returns the plain base class, which is why
 * `TrashAwareInMemoryMenuRepo` re-wraps its inner repo's loss. Belongs in `@jini-ai/cms/navigation`
 * next to that factory; once it moves there, this file and that re-wrap go.
 */
export class MenuVersionConflictError extends MenuConflictError {}
