import type { ExecutionCardAgent } from '@jini-ai/core/contracts/execution';
import { getFolderDropPort } from '@jini-ai/admin/screens/fs-files/folder-drop-port';
import { getVoiceInputPort } from '../voice-input/voice-input-port';
import { t } from '@jini-ai/admin/screens/settings/settings-execution-i18n';
import { selectedAgentWarning as jiniSelectedAgentWarning } from '@jini-ai/chat/react/admin-execution/ai-agent-presentation';

/** Detection runs on the server; preload bridge presence identifies when that server is local.
 * Returns the dictionary KEY: the server-scope one carries `{productName}`, filled at each render site
 * from `SETTINGS_EXECUTION_PRODUCT_VARS` (`integrations/jini-admin/settings-execution-copy.ts`).
 * Do not infer desktop from screen size, localhost URLs, or the site-switcher flag. */
export const scopeKeys = {
  desktopKey: 'Detected on this computer.',
  serverKey: 'Detected on the {productName} server, not on your own computer.',
};

export function isDesktopAdmin(
  {}: Record<string, never>, { targetWindow }: { targetWindow?: Window } = {},
): boolean {
  // `tovuFiles` is the folder-drop bridge name the desktop preload exposes.
  return getFolderDropPort({ targetWindow, bridgeKey: 'tovuFiles' }) !== null || getVoiceInputPort({ targetWindow }) !== null;
}

/** Unknown authentication is not a refusal. Warn only about a confirmed missing sign-in. */
export function selectedAgentWarning(
  { mode, agentId, agents, locale }: {
    mode: string; agentId: string | null; agents: readonly ExecutionCardAgent[]; locale: string;
  }, _optional = {},
): string | null {
  return jiniSelectedAgentWarning({ mode, agentId, agents, locale, translate: t });
}
