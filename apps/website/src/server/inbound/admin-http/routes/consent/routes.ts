/** @file Authenticated, workspace-scoped projections of the shared consent service. */
import type { Express, Request, Response } from 'express';
import { ToolInputError } from '@jini-ai/core';
import { ForbiddenError } from '@jini-ai/cms/core';
import type { SiteConsentService } from '#src/features/consent/service';
import { SiteConsentConflict } from '#src/features/consent/revisions';
import { getAuthedPrincipal } from '#src/server/inbound/admin-http/dev-auth';
import { authorizeOrRespond } from '#src/server/inbound/admin-http/authorize-guard';
import type { RouteDeps } from '#src/server/routes/types';

import { readConsentRequest, consentRevisionToken } from '#src/features/consent/request';

const BASE = '/api/admin/v1/workspaces/:workspaceId/consent';

/** Six HTTP endpoints, each behind the existing admin session gate and its service permission.
 * @example registerAdminConsentRoutes({ app, deps, service })
 * @complexity One service call per route; readiness renders at most one bounded local page. */
export function registerAdminConsentRoutes({ app, deps, service }: { app: Express; deps: Pick<RouteDeps, 'workspaceId' | 'authorize'>; service: SiteConsentService }, _options = {}): void {
  /** Framework callbacks retain Express's required positional signature. */
  const mount = ({ method, suffix, write, run }: { method: 'get' | 'post' | 'put'; suffix: string; write: boolean; run: (input: { req: Request; principalId: string }) => Promise<unknown> }, _optional = {}) => {
    app[method](`${BASE}${suffix}`, async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      if (String(req.params.workspaceId ?? '') !== deps.workspaceId) { res.status(404).json({ error: 'workspace was not found' }); return; }
      try {
        const principal = getAuthedPrincipal(res);
        if (!await authorizeOrRespond(res, deps.authorize, { principalId: principal.id, workspaceId: deps.workspaceId, permission: write ? 'settings.workspace.write' : 'settings.read', entityType: 'site-consent' })) return;
        res.json(await run({ req, principalId: principal.id }));
      } catch (error) {
        if (error instanceof ToolInputError) { res.status(400).json({ code: 'CONSENT_VALIDATION_FAILED', error: error.message }); return; }
        if (error instanceof SiteConsentConflict) { res.status(409).json({ code: 'CONSENT_REVISION_CONFLICT', error: error.message }); return; }
        if (error instanceof ForbiddenError) { res.status(403).json({ code: 'FORBIDDEN', error: 'Permission to access cookie consent was denied.' }); return; }
        console.error('[consent-admin] operation failed');
        res.status(503).json({ code: 'CONSENT_UNAVAILABLE', error: 'Cookie consent settings are unavailable. Published enforcement remains in place.' });
      }
    });
  };
  mount({ method: 'get', suffix: '/settings', write: false, run: ({ principalId }) => service.read({ principalId }) });
  mount({ method: 'get', suffix: '/readiness', write: false, run: ({ req, principalId }) => {
    const input = readConsentRequest({ body: req.query, fields: ['path'] });
    if (input.path !== undefined && typeof input.path !== 'string') throw new ToolInputError({ message: 'path must be one local page path.' });
    return service.readiness({ principalId, path: input.path as string | undefined });
  } });
  mount({ method: 'post', suffix: '/dry-run', write: false, run: ({ req, principalId }) => {
    const input = readConsentRequest({ body: req.body, fields: ['path', 'config'] });
    if (input.path !== undefined && typeof input.path !== 'string') throw new ToolInputError({ message: 'path must be one local page path.' });
    return service.readiness({ principalId, path: input.path as string | undefined, ...(input.config === undefined ? {} : { config: input.config }) });
  } });
  mount({ method: 'post', suffix: '/preview', write: false, run: ({ req, principalId }) => {
    const input = readConsentRequest({ body: req.body, fields: ['path', 'config'] });
    if (input.path !== undefined && typeof input.path !== 'string') throw new ToolInputError({ message: 'path must be one local page path.' });
    return service.preview({ principalId, path: input.path as string | undefined, ...(input.config === undefined ? {} : { config: input.config }) });
  } });
  mount({ method: 'put', suffix: '/settings', write: true, run: ({ req, principalId }) => {
    const input = readConsentRequest({ body: req.body, fields: ['config', 'expectedDraftId'] });
    return service.saveDraft({ principalId, config: input.config, expectedDraftId: consentRevisionToken({ input, key: 'expectedDraftId' }) });
  } });
  mount({ method: 'post', suffix: '/publish', write: true, run: ({ req, principalId }) => {
    const input = readConsentRequest({ body: req.body, fields: ['draftId', 'expectedPublishedId'] });
    const draftId = consentRevisionToken({ input, key: 'draftId' });
    if (draftId === null) throw new ToolInputError({ message: 'draftId must name a saved draft.' });
    return service.publish({ principalId, draftId, expectedPublishedId: consentRevisionToken({ input, key: 'expectedPublishedId' }) });
  } });
}
