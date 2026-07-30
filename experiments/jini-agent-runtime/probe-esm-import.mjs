const m = await import('@jini-ai/agent-runtime');
const keys = Object.keys(m);
console.log('IMPORT_OK exports=' + keys.length);
for (const n of ['detectAgents','resolveAgentLaunch','createClaudeStreamHandler','claudeAgentDef','codexAgentDef','buildAgentPrompt']) {
  console.log(`  ${n}: ${typeof m[n]}`);
}
