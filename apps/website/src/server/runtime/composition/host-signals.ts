import { resolveBundledHostSignals } from '@jini-ai/agent-plugins/site/host-signals';
import { evaluateHostSignals, selectCoreHostSignalDeclaration } from '@tovu/contracts/host-signals';
import { bundledContributionSources } from '#src/features/agent-plugins/bundled-contribution-sources';
import { bundledAgentPluginsDir } from './site-paths.js';

/** Resolve current host facts inside the feature owner's fallback boundary, including discovery failures. */
export function resolveHostSignals({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}, _options = {}) {
  return resolveBundledHostSignals({ env, sources: bundledContributionSources, evaluateHostSignals, selectCoreHostSignalDeclaration, get bundledSourceRoot() { return bundledAgentPluginsDir({}, { env }); } });
}
