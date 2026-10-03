import { claudeAgentDef, resolveAgentLaunch, applyAgentLaunchEnv } from '@jini-ai/agent-runtime';
const args = claudeAgentDef.buildArgs({ prompt: 'PROMPT_HERE', imagePaths: [] }, { extraAllowedDirs: [], options: { model: 'claude-sonnet-4-5' }, runtimeContext: { cwd: process.cwd(), newSessionId: 'sess-1' } });
console.log('buildArgs ->', JSON.stringify(args, null, 1));
console.log('promptViaStdin:', claudeAgentDef.promptViaStdin, '| promptInputFormat:', claudeAgentDef.promptInputFormat, '| streamFormat:', claudeAgentDef.streamFormat);
const launch = resolveAgentLaunch({ def: claudeAgentDef });
console.log('resolveAgentLaunch ->', JSON.stringify({ launchPath: launch.launchPath, launchKind: launch.launchKind, childPathPrepend: launch.childPathPrepend, diagnostic: launch.diagnostic }, null, 1));
