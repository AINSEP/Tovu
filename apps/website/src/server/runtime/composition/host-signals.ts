import { resolveBundledHostSignals } from '#src/features/agent-plugins/host-signals';
import { bundledAgentPluginsDir } from './site-paths.js';

/** Resolve host facts inside the feature owner's fallback boundary, including discovery failures. */
export function resolveHostSignals({ env }: { env: NodeJS.ProcessEnv }, _options = {}) {
  return resolveBundledHostSignals({ env, get bundledSourceRoot() { return bundledAgentPluginsDir({}, { env }); } });
}
