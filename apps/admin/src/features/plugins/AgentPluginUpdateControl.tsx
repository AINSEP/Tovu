import { useState } from 'react';
import type { Translate } from '@jini-ai/ui/panel-kit';
import type { AdminAgentPlugin } from '@/lib/api';
import { AddAgentPluginPanel } from './AddAgentPluginPanel';
import { useAgentPluginInstall } from './hooks/use-agent-plugin-install.hooks';
import { defaultAgentPluginInstallPort } from './hooks/agent-plugin-install-dependencies.hooks';
import type { AgentPluginInstallPort } from './hooks/agent-plugin-install-port.hooks';

/** Explicit operator-supplied candidate, using the existing bounded zip/folder upload workflow. */
export function AgentPluginUpdateControl({ plugin, t, onUpdated, port = defaultAgentPluginInstallPort }: {
  plugin: AdminAgentPlugin; t: Translate; onUpdated?: (plugin: AdminAgentPlugin) => void; port?: AgentPluginInstallPort;
}) {
  const [open, setOpen] = useState(false);
  const controller = useAgentPluginInstall({ port, t, onInstalled: row => onUpdated?.(row) },
    { update: { pluginId: plugin.pluginId, expectedOldDigest: plugin.archiveDigest! } });
  return <div>
    <button type="button" aria-expanded={open} disabled={controller.busy} onClick={() => setOpen(!open)}>{t('Update')}</button>
    {open ? <AddAgentPluginPanel controller={controller} /> : null}
  </div>;
}
