import type { DetectedAgent, ExecutionPort } from '@jini-ai/ui';
import { getFolderDropPort } from '../fs-files/folder-drop-port';
import { getVoiceInputPort } from '../voice-input/voice-input-port';
import { t } from './settings-execution-i18n';

/** Detection runs on the server; preload bridge presence identifies when that server is local.
 * Do not infer desktop from screen size, localhost URLs, or the site-switcher flag. */
export function localCliScopeCopy(
  { desktop }: { desktop: boolean }, _optional = {},
): string {
  return desktop ? 'Detected on this computer.' : 'Detected on the Tovu server, not on your own computer.';
}

export function isDesktopAdmin(
  {}: Record<string, never>, { targetWindow }: { targetWindow?: Window } = {},
): boolean {
  return getFolderDropPort(targetWindow) !== null || getVoiceInputPort(targetWindow) !== null;
}

/** Unknown authentication is not a refusal. Warn only about a confirmed missing sign-in. */
export function selectedAgentWarning(
  { mode, agentId, agents, locale }: {
    mode: string; agentId: string | null; agents: readonly DetectedAgent[]; locale: string;
  }, _optional = {},
): string | null {
  const agent = agents.find((candidate) => candidate.id === agentId);
  return mode === 'local-cli' && agent?.installed && agent.authStatus === 'missing'
    ? `${agent.label}: ${t({ locale: locale, key: 'Authentication required. Sign in before sending.' })}` : null;
}

/** Empty strings suppress the shared card's divider; trim whitespace without inventing vendor copy.
 * Undefined preserves Jini's existing vendor-description fallback. */
export function normalizeAgentDescription(
  { agent }: { agent: DetectedAgent }, _optional = {},
): DetectedAgent {
  return agent.description === undefined ? agent : { ...agent, description: agent.description.trim() };
}

/** Share the component's scan with the warning instead of spawning another inventory sweep.
 * Rescan results replace previous auth status; rejected scans remain failures, never empty lists. */
export function createAgentPresentationPort(
  { port, onAgents }: { port: ExecutionPort; onAgents: (agents: readonly DetectedAgent[]) => void },
  _optional = {},
): ExecutionPort {
  let latestScan = 0;
  const project = async (request: () => Promise<readonly DetectedAgent[]>) => {
    const scan = ++latestScan;
    const agents = (await request()).map((agent) => normalizeAgentDescription({ agent }));
    // A slow initial scan must not overwrite a newer rescan's authentication result.
    if (scan === latestScan) onAgents(agents);
    return agents;
  };
  return {
    ...port,
    detectLocalAgents: () => project(() => port.detectLocalAgents()),
    ...(port.rescanLocalAgents ? { rescanLocalAgents: () => project(() => port.rescanLocalAgents!()) } : {}),
  };
}
