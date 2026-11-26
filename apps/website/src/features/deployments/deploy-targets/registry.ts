import { loadDeployTargetRegistry as loadInstalled,
  loadDeployTargetRegistryFromSource as loadSource, loadBundledDeployTargetRegistry as loadBundled } from '@jini-ai/devops/deploy/site/deploy-targets/registry';
import { bundledContributionSources } from '../../agent-plugins/bundled-contribution-sources.js';
import { defineExecutablePluginContribution, loadPluginContributionsFromSource, type LoadPluginContributions,
  type TrustedPluginPackage } from '../../agent-plugins/lifecycle.js';

const sourcePorts: Pick<Parameters<typeof loadBundled>[0], 'bundledContributionSources' | 'loadPluginContributionsFromSource'> = {
  bundledContributionSources,
  loadPluginContributionsFromSource: ({ plugin, definition }) =>
    loadPluginContributionsFromSource({ plugin, definition: defineExecutablePluginContribution(definition) }),
};

export const loadDeployTargetRegistry = (ctx: { workspaceId: string }, required: { loadContributions: LoadPluginContributions }) =>
  loadInstalled({ ...ctx, loadContributions: ({ definition, ...input }, options) =>
    required.loadContributions({ ...input, definition: defineExecutablePluginContribution(definition) }, options) });

export const loadDeployTargetRegistryFromSource = (plugin: TrustedPluginPackage, _optional = {}) =>
  loadSource({ plugin, ...sourcePorts });

export const loadBundledDeployTargetRegistry = (required: { sourceRoot: string }, _optional = {}) =>
  loadBundled({ ...required, ...sourcePorts });
