import { createChatSettingsSnapshot, type ChatSettingsSnapshot } from '@jini-ai/daemon/chat-settings';
import type { RunPlan } from '@jini-ai/agent-runtime/native-tool-policy';
import type { ToolDescriptor } from '@jini-ai/core';
import type { readAssistantRunToolPolicy } from './assistant-run-tool-policy.js';

type Snapshot = Awaited<ReturnType<typeof readAssistantRunToolPolicy>>;

/** Project the same host-gated launch snapshot into guidance and the authenticated read tool. */
export function assistantRunToolFacts(required: {
  agentId: string; snapshot: Snapshot; plan: RunPlan; tools: readonly ToolDescriptor[]; model?: string; effort?: string;
}, _optional = {}): ChatSettingsSnapshot {
  const { agentId, snapshot, plan, tools } = required;
  const servers = new Map<string, { id: string; host: string; transport: string }>();
  for (const tool of tools) {
    const source = tool.metadata?.mcpSource;
    if (source) servers.set(source.id, { id: source.id, host: source.host, transport: 'metadata' });
  }
  return createChatSettingsSnapshot({ agentId, permissions: snapshot.effective, plan,
    ...(required.model ? { model: required.model } : {}), ...(required.effort ? { effort: required.effort } : {}),
    isolation: isolationClass({ snapshot }), sourceByKey: permissionSources({ snapshot, agentId }),
    toolIds: tools.map(tool => tool.id), servers: [...servers.values()],
  });
}

function isolationClass({ snapshot }: { snapshot: Snapshot }): ChatSettingsSnapshot['isolation'] {
  const isolation = snapshot.def?.mcpIsolation;
  if (typeof isolation === 'object') return 'perRun';
  return isolation === 'no-client' ? 'no-client' : 'none';
}

function permissionSources({ snapshot, agentId }: { snapshot: Snapshot; agentId: string }): ChatSettingsSnapshot['sources'] {
  const sources = {} as ChatSettingsSnapshot['sources'];
  const override = snapshot.settings.byAgent?.[agentId];
  for (const key of ['enabled', ...Object.keys(snapshot.nativeCapabilities)] as (keyof typeof sources)[]) {
    const selected = key === 'enabled' ? override?.enabled : override?.capabilities?.[key];
    sources[key] = snapshot.lock ? 'host_locked' : selected === undefined ? snapshot.settingsSource : 'byAgent';
  }
  return sources;
}
