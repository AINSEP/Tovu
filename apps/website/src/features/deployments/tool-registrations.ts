import { buildDeploymentsRegistrations as buildWithPorts, deploymentsDerivedRisk,
  type DeploymentsToolDeps as JiniDeploymentsToolDeps } from '@jini-ai/devops/deploy/site/tool-registrations';
import { requireToolPermission } from '@jini-ai/cms/core';
import { readDockerfileSource, writeDockerfileSourceWithIfMatch } from '@jini-ai/devops/deploy/site/dockerfile';
import { assertExportNotRunning, diagnoseStaticExport, getExportRunSnapshot, startExportRun } from './export-run-binding.js';

export type DeploymentsToolDeps = Omit<JiniDeploymentsToolDeps,
  'requireToolPermission' | 'readDockerfileSource' | 'writeDockerfileSourceWithIfMatch' |
  'assertExportNotRunning' | 'diagnoseStaticExport' | 'getExportRunSnapshot' | 'startExportRun'>;

export function buildDeploymentsRegistrations(routeDeps: DeploymentsToolDeps) {
  return buildWithPorts({ ...routeDeps, requireToolPermission, readDockerfileSource, writeDockerfileSourceWithIfMatch,
    assertExportNotRunning, diagnoseStaticExport, getExportRunSnapshot, startExportRun });
}
export function contributeDeploymentsTools() {
  return { domain: 'deployments', build: buildDeploymentsRegistrations, risk: deploymentsDerivedRisk };
}
