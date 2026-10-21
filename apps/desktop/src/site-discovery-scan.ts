/** The read-only scan the discovery worker runs, as a plain function so its result contract is testable
 *  without a thread. Persistence/deletion authority stays with tracked-sites. */
import { createSitesWorkspace } from './shared-sites.ts';
import { readDesktopState, classifySiteDirSafely } from './site-dir-store.ts';
import { discoverSiteDirs } from './tracked-sites.ts';
import type { DesktopDiscoveryInput } from './site-discovery.ts';

/** What the worker posts back: the found site paths, or a message — never a thrown value or an Error object. */
export type DesktopDiscoveryResult = { found: string[] } | { error: string };

/** The shared workspace's one-level discovery for `input`, reading settings and the legacy MRU fresh. */
function discoverForInput(input: DesktopDiscoveryInput): string[] {
  const workspace = createSitesWorkspace({}, { ...input.workspaceOptions, catalogRecovery: false });
  // Read settings in this worker too: canonicalizing removable roots can itself block.
  return discoverSiteDirs({
    scanRoots: input.scanRoots ?? workspace.roots({}),
    knownDirs: [...readDesktopState(input.statePath).recentSiteDirs, ...workspace.registry({}).list({}).map((row) => row.path)],
    classifySiteDir: classifySiteDirSafely,
  }, { homeDir: workspace.homeDir, sitesHome: workspace.home({}) });
}

/**
 * Runs one discovery and folds any failure into a serializable message.
 * @param required.input The worker's `workerData`.
 * @param optional.discover The scan itself; defaults to the shared workspace's discovery.
 * @returns `{ found }`, or `{ error }` with the failure's message (or its string form for a non-Error throw).
 * @complexity That of the discovery: O(n log n) in at most 1000 candidates across at most 32 roots.
 */
export function runDesktopDiscovery(
  { input }: { input: DesktopDiscoveryInput },
  { discover = discoverForInput }: { discover?: (input: DesktopDiscoveryInput) => string[] } = {},
): DesktopDiscoveryResult {
  try {
    return { found: discover(input) };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : String(failure) };
  }
}
