import { detectAgents, claudeAgentDef } from '@jini-ai/agent-runtime';
export async function ids(): Promise<string[]> {
  const a = await detectAgents();
  return [...a.map(x => x.id), claudeAgentDef.id];
}
