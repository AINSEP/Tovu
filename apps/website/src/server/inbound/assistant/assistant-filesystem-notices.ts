import type { AssistantCliPermissions } from '#src/contracts/headless/index';

/** Explain the site launch's personal-configuration boundaries without exposing settings or paths.
 * Pure, O(1); provider enforcement fallbacks are disclosed by the executor after its CLI probe.
 */
export function buildAssistantFilesystemNotices({ agentId, capabilities }: {
  agentId: string; capabilities: AssistantCliPermissions['capabilities'];
}, { platform = process.platform }: { platform?: NodeJS.Platform } = {}): string {
  if (agentId !== 'claude') return '';
  const lines = ['Site chat does not inherit your personal Claude hooks or permissions.'];
  if (capabilities.userMcp) lines.push('Personal MCP servers are not folder-limited.');
  if (platform === 'win32' && capabilities.shell) lines.push('shell is not folder-limited on this platform');
  return `\n${lines.join('\n')}\n`;
}
