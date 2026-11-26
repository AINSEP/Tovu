import { resolveBundledHostSignals } from '@jini-ai/agent-plugins/site/host-signals';
import { evaluateHostSignals, selectCoreHostSignalDeclaration } from '@tovu/contracts/host-signals';
import { bundledContributionSources } from '#src/features/agent-plugins/bundled-contribution-sources';
import { bundledAgentPluginsDir } from './site-paths.js';
import { TOVU_AGENT_PLUGIN_IDENTITY_READ } from "#src/features/agent-plugins/identity-read-policy";

/** Resolve current host facts inside the feature owner's fallback boundary, including discovery failures. */
export function resolveHostSignals({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}, _options = {}) {
  return resolveBundledHostSignals({ env, sources: bundledContributionSources, evaluateHostSignals, selectCoreHostSignalDeclaration, get bundledSourceRoot() { return bundledAgentPluginsDir({}, { env }); } }, TOVU_AGENT_PLUGIN_IDENTITY_READ);
}
