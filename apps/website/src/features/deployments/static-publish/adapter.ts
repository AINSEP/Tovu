import { publishStaticSite as publishWithPorts, type StaticPublishDeps as JiniStaticPublishDeps,
  type StaticPublishInput } from '@jini-ai/devops/deploy/site/static-publish/adapter';
import { issueCredentialSetup } from '#src/contracts/core/tool-failure-diagnostics';
import { rmSync } from 'node:fs';
import { publicPageSecurityHeaders } from '#src/features/theme/public-page-security-headers';
import { createDeployHostKit } from '../deploy-targets/host-kit-binding.js';
import { createNoopTracker } from '@jini-ai/diagnostics/observability';
import { rewriteFormActions } from '@jini-ai/cms/forms/destinations/rewrite-actions';
import { firstExportFailure } from '#src/features/site-export/export-failure-summary';
import { redactSecretShapes } from '@tovu/contracts/secret-redaction';
import { publishJobs } from './publish-run.js';

export const staticPublishPorts = {
  get publishJobs() { return publishJobs; }, redactSecretShapes, createNoopTracker, createDeployHostKit,
  defaultPublicPageSecurityHeaders: () => publicPageSecurityHeaders({}), firstExportFailure,
  rmSync, warn: console.warn, rewriteFormActions, issueCredentialSetup,
};
export type StaticPublishDeps = Omit<JiniStaticPublishDeps, keyof typeof staticPublishPorts>;

export function publishStaticSite(deps: StaticPublishDeps, input: StaticPublishInput) {
  return publishWithPorts({ ...deps, ...staticPublishPorts }, input);
}
