/**
 * @file The sites-home project list: polling Runner's inventory, the operator's Rescan, applying
 * one refreshed record, and the running-site count the nav badges. Split out of `App.hooks.ts`
 * (which still re-exports all of it) with no behaviour change.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { runnerInventoryBridge } from './runner-api.js';
import { startVisibleInterval } from './visible-interval.js';
import type { BridgeLookup } from './bridge-lookup.js';
import type { SiteRecord } from '../contracts/project.js';

/**
 * Polls Runner's project inventory on a 4s interval.
 *
 * Runner supervises OS processes that change state on their own — a site can crash, or finish
 * booting, with no user action in this window. A mount-only fetch would leave the grid showing a
 * state that stopped being true minutes ago, so re-poll on an interval — only while the window is
 * visible (`startVisibleInterval`): a hidden window does not poll, and polls once the moment it is
 * shown again.
 */
export function useSitesPolling(
  _required: Record<string, never> = {},
  {
    getBridge = runnerInventoryBridge,
    startInterval = startVisibleInterval,
  }: { getBridge?: BridgeLookup<'listSites'>; startInterval?: (tick: () => void, periodMs: number) => () => void } = {},
): {
  projects: readonly SiteRecord[];
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>;
  projectsLoading: boolean;
  loadError: string | null;
} {
  const [projects, setProjectsState] = useState<readonly SiteRecord[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by every local write (create, delete, rename). A poll that started before one is an
  // older snapshot: applying it would erase that write, and the one-time create notice with it.
  const mutationEpoch = useRef(0);
  const setProjects = useCallback<Dispatch<SetStateAction<readonly SiteRecord[]>>>((next) => {
    mutationEpoch.current++;
    setProjectsState(next);
  }, []);

  useEffect(() => {
    const bridge = getBridge();
    if (bridge === undefined) {
      setProjectsLoading(false);
      return undefined;
    }
    let cancelled = false;

    const load = () => {
      const startedAt = mutationEpoch.current;
      return bridge
        .listSites()
        .then((result) => {
          if (cancelled || startedAt !== mutationEpoch.current) return;
          setProjectsState(result);
          setLoadError(null);
        })
        .catch(() => {
          if (!cancelled) setLoadError("Couldn't load projects.");
        })
        .finally(() => {
          if (!cancelled) setProjectsLoading(false);
        });
    };

    void load();
    const stop = startInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [getBridge, startInterval]);

  return { projects, setProjects, projectsLoading, loadError };
}

/**
 * The operator-triggered discovery pass behind the Projects header's "Rescan" control.
 *
 * A button and not only the boot pass, because the reasons a site appears on disk mid-session are
 * ordinary: `tovu init` in a terminal, a folder restored from a backup, a checkout pulled down
 * next to this one. Without it the answer to "my site is right there and Tovu cannot see it" is
 * "quit and relaunch".
 *
 * Takes `setProjects` — `useSitesPolling`'s own setter — and applies main's returned list
 * immediately rather than leaving the grid to the next 4s poll. To the operator those are not the
 * same thing: a rescan that has already found their site but shows nothing for four seconds reads
 * as a button that does not work.
 *
 * `rescanning` is deliberately not derived from the polling hook's `projectsLoading`: that one is
 * true only until the first list arrives, so it would report nothing at all here.
 */
export function useSiteRescan(
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>,
  { getBridge = runnerInventoryBridge }: { getBridge?: BridgeLookup<'rescanSites'> } = {},
): {
  rescanning: boolean;
  rescanError: string | null;
  rescan: () => Promise<void>;
} {
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);

  const rescan = useCallback(async () => {
    const bridge = getBridge();
    if (bridge === undefined) return;
    setRescanning(true);
    setRescanError(null);
    try {
      setProjects(await bridge.rescanSites());
    } catch (failure) {
      setRescanError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setRescanning(false);
    }
  }, [setProjects, getBridge]);

  return { rescanning, rescanError, rescan };
}

/**
 * Replace one project's row with the refreshed `SiteRecord` main just resolved with, leaving every
 * other row untouched.
 *
 * The alternative is waiting for `useSitesPolling`'s 4 s tick, and for a start or a stop those four
 * seconds are the whole problem: the card would go on saying `Running` after the operator watched
 * their stop succeed. A record NOT in the list is dropped rather than appended — this applies a
 * change to a project the grid is already showing, and a row that arrives here for an unknown id is
 * a stale id, not a new site (`rescan`/`create`/`add` are what add rows).
 *
 * `previousId` is for a missing-folder card's Locate, whose record comes back under its NEW folder
 * (a record's id is its folder): the card at `previousId` is replaced, and when the found folder
 * already had a card of its own, that one is dropped so the merged site shows once.
 *
 * @complexity O(n) in the project count, once per applied record.
 */
export function useApplySiteRecord(
  setProjects: Dispatch<SetStateAction<readonly SiteRecord[]>>,
): (record: SiteRecord, previousId?: string) => void {
  return useCallback(
    (record: SiteRecord, previousId: string = record.id) => {
      setProjects((current) => {
        if (!current.some((project) => project.id === previousId)) return current;
        return current.flatMap((project) => {
          if (project.id === previousId) return [record];
          return project.id === record.id ? [] : [project];
        });
      });
    },
    [setProjects],
  );
}

/**
 * How many tracked sites are running right now — the count `NavLink` badges on the Projects entry.
 *
 * @complexity O(n) in the number of sites.
 */
export function countRunningSites(projects: readonly SiteRecord[]): number {
  return projects.filter((project) => project.status === 'running').length;
}
