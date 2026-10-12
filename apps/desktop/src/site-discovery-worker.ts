/** Read-only Tovu discovery worker. Persistence/deletion authority stays with tracked-sites. */
import { parentPort, workerData } from 'node:worker_threads';
import { createSitesWorkspace } from './shared-sites.ts';
import { readDesktopState, classifySiteDirSafely } from './site-dir-store.ts';
import { discoverSiteDirs } from './tracked-sites.ts';
import type { DesktopDiscoveryInput } from './site-discovery.ts';

const input = workerData as DesktopDiscoveryInput;
try {
  const workspace = createSitesWorkspace({}, { ...input.workspaceOptions, catalogRecovery: false });
  // Read settings in this worker too: canonicalizing removable roots can itself block.
  const found = discoverSiteDirs({
    scanRoots: input.scanRoots ?? workspace.roots({}),
    knownDirs: [...readDesktopState(input.statePath).recentSiteDirs, ...workspace.registry({}).list({}).map((row) => row.path)],
    classifySiteDir: classifySiteDirSafely,
  }, { homeDir: workspace.homeDir, sitesHome: workspace.home({}) });
  parentPort?.postMessage({ found });
} catch (failure) {
  parentPort?.postMessage({ error: failure instanceof Error ? failure.message : String(failure) });
}
