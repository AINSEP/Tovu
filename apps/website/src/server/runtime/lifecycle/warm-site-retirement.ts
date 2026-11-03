/** Fail-closed retirement for dev-owned site servers. No listener is added outside warm dev. */
import type { Express } from 'express';
import path from 'node:path';
import { readLiveDaemonRegistryRecord } from '@jini-ai/sidecar';
import { delegatedAssistantDaemonConnection } from './assistant-daemon-connection.js';
import { isAssistantDaemonReady } from './daemon-supervisor.js';
import { createDevServerRetirement as createWarmSiteRetirement } from '@jini-ai/devops/local-dev';
import { getExportRunSnapshot } from '../../../features/deployments/export-run.js';
import { getPublishRunSnapshot } from '../../../features/deployments/static-publish/publish-run.js';
export { createWarmSiteRetirement };

/** A registered assistant may have work beyond an HTTP response; protect it until its process
 * parks. This covers all CLI types without guessing from conversation IDs or run descriptions.
 * Shared daemon activity is deliberately conservative: another site's work can protect this one.
 */
async function assistantMayHaveWork({ siteDir }: { siteDir: string }): Promise<boolean> {
  if (isAssistantDaemonReady()) return true;
  const delegated = delegatedAssistantDaemonConnection({});
  if (delegated) {
    try { process.kill(delegated.pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return true; }
  }
  return (await readLiveDaemonRegistryRecord({ registryPath: path.join(siteDir, 'ops/assistant-daemon.json') })) !== null;
}

/** Mount before routing: retirement uses a parent-only random capability and has no public auth
 * bypass. Once fenced, even daemon/tool callbacks cannot start new site work. Background work
 * is read from its existing status owners, never inferred from HTTP 202. O(1) local status reads
 * plus the injected domain-job probe, bounded by the retirement owner's timeout.
 */
export function registerWarmSiteRetirement({ app, siteDir, jobs = async () => false }: { app: Express; siteDir: string; jobs?: () => Promise<boolean> },
  { env = process.env, hasWork = async () => getExportRunSnapshot().status === 'running'
    || getPublishRunSnapshot().status === 'running' || await assistantMayHaveWork({ siteDir }) || await jobs() }:
  { env?: NodeJS.ProcessEnv; hasWork?: () => Promise<boolean> } = {}): void {
  const token = env.TOVU_DEV_RETIRE_TOKEN;
  if (!token || env.TOVU_DEV_WARM_SITES !== '1') return;
  const guard = createWarmSiteRetirement({ hasWork });
  app.use((req, res, next) => {
    if (req.path === '/internal/dev-site-retire') {
      if (req.headers['x-tovu-retire'] !== token) { res.sendStatus(404); return; }
      if (req.method === 'DELETE') { guard.cancel(); res.sendStatus(204); return; }
      if (req.method !== 'POST') { res.sendStatus(404); return; }
      void guard.retire().then(idle => { res.sendStatus(idle ? 204 : 409); });
      return;
    }
    if (!guard.accepting()) { res.status(503).json({ error: 'This idle dev site is stopping. Reopen it from Sites.' }); return; }
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    const release = guard.begin();
    res.once('finish', () => release({}));
    // A dropped response does not prove its handler finished. Preserve that uncertain request;
    // completed responses and known background jobs release through their respective owners.
    res.once('close', () => { if (res.writableFinished) release({}); });
    next();
  });
}
