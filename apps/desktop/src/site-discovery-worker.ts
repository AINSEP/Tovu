/** Read-only Tovu discovery worker. Persistence/deletion authority stays with tracked-sites. */
import { parentPort, workerData } from 'node:worker_threads';
import { runDesktopDiscovery } from './site-discovery-scan.ts';
import type { DesktopDiscoveryInput } from './site-discovery.ts';

parentPort?.postMessage(runDesktopDiscovery({ input: workerData as DesktopDiscoveryInput }));
