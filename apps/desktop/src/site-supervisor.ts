/**
 * @file The one holder of "which site dirs have a LIVE `tovu serve` right now" — `main.js`'s
 * `openSites` map, grown the one property it never had: it observes the child dying.
 *
 * **The defect this exists for (D-06).** `openSites` was a bare `Map`, and the audit's phrasing is
 * exact: it was "a registry of what was STARTED and not yet deliberately stopped", read everywhere
 * as "what is running". `startTovuServer`'s handle was built for boot-or-fail and discarded the
 * child's exit once ready, so after a crash:
 *
 * - `buildSiteRecord` (`project-ipc.js`) kept reporting `status: "running"` and the old port;
 * - `useSitesPolling`'s 4 s re-poll — whose own comment claims it is there to catch a crash —
 *   re-read a map that never changed, so the comment was false;
 * - `openSiteServer` (`main.js`) returned `already.server`, so "Start site" handed back the corpse
 *   and spawned nothing. Wedged for the rest of the session.
 *
 * Nothing was wrong with any individual reader. There was simply no component that owned the
 * `running → exited` transition, so every reader of "running" was reading "was started". This is
 * that component.
 *
 * **Deliberately Map-compatible.** `get`/`set`/`has`/`delete`/`values`/`size` behave exactly as the
 * `Map` they replace, so every existing call site and every test that injects a plain `Map` keeps
 * working unchanged. What is added is invisible to those callers: `set` also attaches the exit
 * observation, `delete` also withdraws it, and an exit that arrives while an entry is still current
 * removes it and reports through `onUnexpectedExit`.
 *
 * **Why DELIBERATE closes are not this module's business.** `handleDelete` and the window `closed`
 * listener already drop the entry and the crash-safety row themselves, in that order, for reasons
 * their own comments give. Taking that over would rewrite two working paths to fix a third. This
 * module owns exactly the transition that had no owner: the one nobody asked for.
 *
 * No `electron` import, so all of it is testable under plain `node --test` — same convention as
 * `tracked-sites.js`, `site-process-registry.js` and `project-delete-guard.js`.
 */

/** How a site's child exited: the `code` and `signal` of Node's own child `exit` event. */
interface ServerExit {
  code: number | null;
  signal: string | null;
}

/** The slice of a `startTovuServer` handle this module reads. `onExit` is optional: see `set`. */
interface SupervisedServer {
  onExit?: (listener: (exit: ServerExit) => void) => void;
}

/** The least a stored entry carries. The caller's real entry type (the server handle's `port` and
 *  `pid`, the site's window) passes through as `E`. */
interface SiteEntry {
  server: SupervisedServer;
}

/** {@link createSiteSupervisor}'s dependencies. */
interface SiteSupervisorDeps<E extends SiteEntry> {
  onUnexpectedExit: (siteDir: string, exit: ServerExit, entry: E) => void;
}

/** What {@link createSiteSupervisor} returns: `Map<siteDir, E>`'s surface plus {@link lastExitOf}. */
interface SiteSupervisor<E extends SiteEntry> {
  set(siteDir: string, entry: E): SiteSupervisor<E>;
  delete(siteDir: string): boolean;
  get(siteDir: string): E | undefined;
  has(siteDir: string): boolean;
  values(): MapIterator<E>;
  readonly size: number;
  lastExitOf(siteDir: string): ServerExit | null;
}

/**
 * @param deps
 * @param deps.onUnexpectedExit called once per site whose child dies without a {@link delete} first.
 *   Receives the entry that was holding it, because the caller needs its `server.pid` to drop the
 *   right crash-safety row — `site-process-registry.js` can hold a live sibling instance's row for the
 *   same site dir, and closing by site dir alone would take that one too (D-07).
 *   Injected rather than reaching for `site-process-registry.js` directly so this module needs no
 *   `registryPath`, no filesystem, and no knowledge of what the caller does about it — `main.js`
 *   drops the crash-safety row and logs; a test just records the call.
 * @returns a `Map`-compatible store with {@link lastExitOf} added.
 * @complexity O(1) to construct.
 */
function createSiteSupervisor<E extends SiteEntry>(deps: SiteSupervisorDeps<E>): SiteSupervisor<E> {
  /** Live entries only. */
  const live = new Map<string, E>();
  /** Why the last child died. */
  const exits = new Map<string, ServerExit>();

  /**
   * Handle one child's exit.
   *
   * The identity check is the whole correctness of this function. A listener fires against the
   * entry it was attached for, and by the time it fires that entry may already have been deleted
   * (a deliberate stop — whose `server.stop()` is itself what triggered the exit) or REPLACED by a
   * later `set` for the same site dir. Acting on either would drop a healthy entry that has nothing
   * to do with the process that just died. Comparing the entry object identity, not the site dir,
   * is what makes "is this exit still about the thing I am holding" answerable.
   *
   * @complexity O(1).
   */
  function handleExit(siteDir: string, entry: E, exit: ServerExit): void {
    if (live.get(siteDir) !== entry) return;
    live.delete(siteDir);
    exits.set(siteDir, exit);
    deps.onUnexpectedExit(siteDir, exit, entry);
  }

  return {
    /**
     * Record a site's live server and begin watching it. `Map.set`'s contract plus the observation.
     *
     * A handle with no `onExit` is stored and simply not watched, rather than throwing: the sites-home
     * and own-server paths both build real handles from `startTovuServer`, but tests inject minimal
     * `{server: {port}}` stand-ins, and a store that refused those would force every unrelated test
     * to fake a lifecycle it is not exercising.
     *
     * @complexity O(1).
     */
    set(siteDir: string, entry: E): SiteSupervisor<E> {
      live.set(siteDir, entry);
      // A previous crash at this path is no longer the current answer about it.
      exits.delete(siteDir);
      if (typeof entry?.server?.onExit === "function") {
        entry.server.onExit((exit) => handleExit(siteDir, entry, exit));
      }
      return this;
    },

    /**
     * Forget a site — the deliberate close. Withdraws the exit observation by construction: the
     * listener still fires when `server.stop()` lands, sees this entry is no longer current, and
     * does nothing.
     *
     * @complexity O(1).
     */
    delete(siteDir: string): boolean {
      exits.delete(siteDir);
      return live.delete(siteDir);
    },

    /** @complexity O(1). */
    get(siteDir: string): E | undefined {
      return live.get(siteDir);
    },

    /** @complexity O(1). */
    has(siteDir: string): boolean {
      return live.has(siteDir);
    },

    /** @complexity O(1). */
    values(): MapIterator<E> {
      return live.values();
    },

    /** @complexity O(1). */
    get size(): number {
      return live.size;
    },

    /**
     * How the site at `siteDir` last died, when it died on its own — the fact `SiteRecord`'s
     * `statusDetail` reports so a stopped tab can say "the server exited" rather than presenting a
     * crashed site as one the operator simply never started.
     *
     * Cleared by both {@link set} and {@link delete}: a restarted or forgotten site's old crash is
     * not a current fact about it.
     *
     * @returns `{code, signal}`, or `null` when this site has not died unattended.
     * @complexity O(1).
     */
    lastExitOf(siteDir: string): ServerExit | null {
      return exits.get(siteDir) ?? null;
    },
  };
}

export { createSiteSupervisor };
export type { ServerExit, SiteEntry, SiteSupervisor, SiteSupervisorDeps, SupervisedServer };
