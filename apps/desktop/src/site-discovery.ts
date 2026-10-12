/** Off-thread adapter for Tovu's existing one-level website discovery, with no worker writes. */
import { Worker } from 'node:worker_threads';
import type { createSitesWorkspace } from './shared-sites.ts';

export interface DesktopDiscoveryInput {
  statePath: string;
  /** Picker validation supplies proposed roots without saving settings. */
  scanRoots?: string[];
  workspaceOptions: Pick<NonNullable<Parameters<typeof createSitesWorkspace>[1]>, 'homeDir' | 'cwd' | 'sourceRoots' | 'env' | 'platform'>;
}
type DiscoveryWorker = Pick<Worker, 'once' | 'removeAllListeners' | 'terminate' | 'unref'>;

/** Start boot discovery without delaying the home window; sweep only after the scan settles.
 * @returns A completion promise; discovery failures are reported and do not fail desktop boot.
 * @complexity O(1) orchestration beyond the supplied discovery/sweep operations.
 */
export async function startDesktopSiteDiscovery({ scan, sweep, report }: {
  scan: () => Promise<unknown>; sweep: () => void; report: (failure: unknown) => void;
}, _options = {}): Promise<void> {
  try { await scan(); }
  catch (failure) { report(failure); }
  sweep();
}

/** Native worker seam: no callbacks, Electron objects or credentials are serialized as results.
 * @returns Discovered site paths; rejects on timeout, cancellation or worker failure.
 * @complexity O(n log n) in at most 1000 candidates across at most 32 roots; 10s deadline.
 */
export function discoverDesktopSites(input: DesktopDiscoveryInput, {
  signal, timeoutMs = 10_000,
  createWorker = () => new Worker(new URL('./site-discovery-worker.ts', import.meta.url), { workerData: input }),
}: { signal?: AbortSignal; timeoutMs?: number; createWorker?: () => DiscoveryWorker } = {}): Promise<string[]> {
  if (signal?.aborted) return Promise.reject(new Error('Sites discovery was cancelled.'));
  return new Promise((resolve, reject) => {
    const worker = createWorker();
    let settled = false;
    const finish = (error?: Error, found: string[] = []): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.unref();
      // A stuck filesystem syscall must not hold the UI's deadline waiting for termination.
      // Keep the error listener until termination settles; a late worker error must not crash main.
      void worker.terminate().then(() => worker.removeAllListeners(), () => worker.removeAllListeners());
      if (error) reject(error);
      else resolve(found);
    };
    const cancel = () => finish(new Error('Sites discovery was cancelled.'));
    const timer = setTimeout(() => finish(new Error('Sites discovery timed out. Disconnect unavailable volumes or choose smaller sites folders and try again.')), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    worker.once('message', (result: { found?: string[]; error?: string }) => {
      if (result.error) finish(new Error(result.error));
      else finish(undefined, result.found ?? []);
    });
    worker.once('error', (error: Error) => finish(error));
    worker.once('exit', () => finish(new Error('Sites discovery worker exited before returning websites.')));
  });
}
