import { loadDeployOpsRegistryFromSource as loadSource, loadBundledDeployOpsRegistry as loadBundled,
  readBundledDeployOpsDescriptors as readBundled, loadDeployOpsRegistry as loadInstalled } from '@jini-ai/devops/deploy/site/deploy-ops/registry';
import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import { readFileSync } from 'node:fs';
import { bundledAgentPluginsDir } from '#src/platform/site-dir/index';
import { bundledContributionSources } from '../../agent-plugins/bundled-contribution-sources.js';
import { defineExecutablePluginContribution, type LoadPluginContributions, loadPluginContributionsFromSource, readTrustedPluginFile,
  type TrustedPluginPackage } from '../../agent-plugins/lifecycle.js';

const sourcePorts: Pick<Parameters<typeof loadBundled>[0], 'bundledContributionSources' | 'loadPluginContributionsFromSource'> = {
  bundledContributionSources,
  loadPluginContributionsFromSource: ({ plugin, definition, onReadError, importRefusalReason, importErrorReason }) =>
    loadPluginContributionsFromSource({ plugin, definition: defineExecutablePluginContribution(definition, { onReadError, importRefusalReason, importErrorReason }) }),
};

export function loadDeployOpsRegistryFromSource(plugin: TrustedPluginPackage, _optional = {}) {
  return loadSource({ plugin, ...sourcePorts });
}

export function loadBundledDeployOpsRegistry(required: { sourceRoot: string }, _optional = {}) {
  return loadBundled({ ...required, ...sourcePorts });
}

export function readBundledDeployOpsDescriptors(required: { sourceRoot: string }, _optional = {}) {
  return readBundled({ ...required, bundledContributionSources, readFileSync });
}

export function loadDeployOpsRegistry(ctx: { workspaceId: string }, required: { loadContributions: LoadPluginContributions }) {
  return loadInstalled({ ...ctx, sourceRoot: bundledAgentPluginsDir(), bundledContributionSources, readTrustedPluginFile,
    loadContributions: ({ definition, onReadError, importRefusalReason, importErrorReason, ...input }, options) => required.loadContributions({ ...input,
      definition: defineExecutablePluginContribution(definition, { onReadError, importRefusalReason, importErrorReason }) }, options),
    warn: error => console.warn('[deploy-ops] deploy ops could not be loaded; installed plugin packages could not be read', formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)),
  });
}
