import { claudeAgentDef, resolveAgentLaunch, applyAgentLaunchEnv } from '@jini-ai/agent-runtime';
const args = claudeAgentDef.buildArgs('PROMPT_HERE', [], [], { model: 'claude-sonnet-4-5' }, { cwd: process.cwd(), newSessionId: 'sess-1' });
console.log('buildArgs ->', JSON.stringify(args, null, 1));
console.log('promptViaStdin:', claudeAgentDef.promptViaStdin, '| promptInputFormat:', claudeAgentDef.promptInputFormat, '| streamFormat:', claudeAgentDef.streamFormat);
const launch = resolveAgentLaunch(claudeAgentDef);
console.log('resolveAgentLaunch ->', JSON.stringify({ launchPath: launch.launchPath, launchKind: launch.launchKind, childPathPrepend: launch.childPathPrepend, diagnostic: launch.diagnostic }, null, 1));
