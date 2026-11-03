/** Fail-closed retirement for dev-owned site servers. No listener is added outside warm dev. */
import type { Express } from 'express';
import path from 'node:path';
import { readLiveDaemonRegistryRecord } from '@jini-ai/sidecar';
import { delegatedAssistantDaemonConnection } from './assistant-daemon-connection.js';
import { isAssistantDaemonReady } from './daemon-supervisor.js';
import { createDevServerRetirement as createWarmSiteRetirement } from '@jini-ai/devops/local-dev';
export { createWarmSiteRetirement };

/** Existing local jobs use HTTP 202 or a returned jobId. Keep unobservable jobs protected after
 * their request completes too; explicit Stop remains available. @complexity O(1).
 */
export function isPendingWarmSiteResponse({ status, body }: { status: number; body: unknown }, _options = {}): boolean {
  if (status === 202) return true;
  if (typeof body !== 'object' || body === null) return false;
  return 'jobId' in body && typeof body.jobId === 'string';
}

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
 * bypass. Once fenced, even daemon/tool callbacks cannot start new site work. HTTP 202 jobs have
 * no universal completion port, so they stay protected until explicit Stop. @complexity O(1).
 */
export function registerWarmSiteRetirement({ app, siteDir }: { app: Express; siteDir: string },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {}): void {
  const token = env.TOVU_DEV_RETIRE_TOKEN;
  if (!token || env.TOVU_DEV_WARM_SITES !== '1') return;
  const guard = createWarmSiteRetirement({ hasWork: () => assistantMayHaveWork({ siteDir }) });
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
    let pendingResponse = false;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      pendingResponse ||= isPendingWarmSiteResponse({ status: res.statusCode, body });
      return json(body);
    };
    res.once('finish', () => release({ background: pendingResponse || res.statusCode === 202 }));
    res.once('close', () => release({ background: !res.writableFinished || pendingResponse || res.statusCode === 202 }));
    next();
  });
}
