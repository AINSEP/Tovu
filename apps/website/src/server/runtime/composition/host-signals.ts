import { resolveBundledHostSignals } from '#src/features/agent-plugins/host-signals';
import { bundledAgentPluginsDir } from './site-paths.js';

/** Resolve current host facts inside the feature owner's fallback boundary, including discovery failures. */
export function resolveHostSignals({ env = process.env }: { env?: NodeJS.ProcessEnv } = {}, _options = {}) {
  return resolveBundledHostSignals({ env, get bundledSourceRoot() { return bundledAgentPluginsDir({}, { env }); } });
}
