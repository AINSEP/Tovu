/**
 * @file The one holder of "which site dirs are MID-TRANSITION right now" — the fact `openSites`
 * cannot express and the Projects screen needs to stop lying with.
 *
 * `site-supervisor.ts` answers "is this site's `tovu serve` alive". That is a two-valued answer, and
 * `buildSiteRecord` (`project-ipc.ts`) turned it straight into `running` or `stopped`. Both of a
 * site's lifecycle transitions take real wall-clock time — a boot is seconds, a graceful stop is a
 * SIGTERM plus however long the child takes to drain — and during either one the two-valued answer
 * is wrong in the direction the operator can see:
 *
 * - a site being started reads `stopped` for the whole boot, so a Start button they just pressed
 *   looks like it did nothing, and they press it again;
 * - a site being stopped reads `running` until the child is gone, so a Stop button looks the same.
 *
 * `contracts/project.ts` has declared `starting` and `stopping` in `SiteLifecycleStatus` since the
 * port; nothing had ever been able to produce them. This is what produces them.
 *
 * **Not folded into the supervisor**, though the two are read together. The supervisor's entries are
 * owned by the child process — it learns about them from `set`/`delete` and from the child's own
 * `exit`. These are owned by an IPC handler's call stack: they exist exactly while a `handleStart`
 * or `handleStop` body is awaiting, and their correctness rule is a `finally`, not a lifecycle
 * event. Merging them would put two different ownership models behind one `get`.
 *
 * No `electron` import, so all of it is testable under plain `node --test` — same convention as
 * `site-supervisor.ts`, `tracked-sites.ts` and `project-delete-guard.ts`.
 */

/** Which lifecycle transition a site is in the middle of. Both are `SiteLifecycleStatus` members
 *  verbatim (`contracts/project.ts`), so a reader can use the value as the status directly. */
type SiteTransition = "starting" | "stopping";

/** What {@link createSiteTransitions} returns. */
interface SiteTransitions {
  /**
   * Mark `siteDir` as mid-`transition`, run `body`, and unmark it — whether `body` resolves or
   * rejects. The unmark is the whole contract: a start that fails must leave the card `stopped`,
   * not `starting` forever.
   */
  during<T>(siteDir: string, transition: SiteTransition, body: () => Promise<T>): Promise<T>;
  /** The transition `siteDir` is in the middle of, or `null`. */
  get(siteDir: string): SiteTransition | null;
}

/**
 * @returns an empty transition store.
 * @complexity O(1) to construct.
 */
function createSiteTransitions(): SiteTransitions {
  /**
   * Site dir -> the marker object for the transition currently running on it.
   *
   * The stored value is a fresh object per call rather than the bare string so {@link during}'s
   * `finally` can check IDENTITY before clearing — the same rule, and for the same reason, as
   * `site-supervisor.ts`'s `handleExit`. `project-ipc.ts` serializes start and stop per site dir,
   * so overlapping transitions on one site should not happen; "should not happen" is not a reason
   * for a later transition's mark to be cleared by an earlier one's unwind if it ever does.
   */
  const active = new Map<string, { transition: SiteTransition }>();

  return {
    /** @complexity O(1) beyond `body`'s own cost. */
    async during<T>(siteDir: string, transition: SiteTransition, body: () => Promise<T>): Promise<T> {
      const marker = { transition };
      active.set(siteDir, marker);
      try {
        return await body();
      } finally {
        if (active.get(siteDir) === marker) active.delete(siteDir);
      }
    },

    /** @complexity O(1). */
    get(siteDir: string): SiteTransition | null {
      return active.get(siteDir)?.transition ?? null;
    },
  };
}

export { createSiteTransitions };
export type { SiteTransition, SiteTransitions };
