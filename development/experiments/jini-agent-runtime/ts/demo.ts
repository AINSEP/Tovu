import { createJiniAgentRunner } from './agent-runner.jini.js';

async function main() {
  const runner = createJiniAgentRunner();
  const agents = await runner.listAvailableAgents();
  console.log('available:', agents.filter(a => a.available).map(a => `${a.id}@${a.version}`).join(', '));

  const res = await runner.runTurn(
    { prompt: process.argv[3] ?? 'Say OK.', workingDir: process.argv[2] ?? process.cwd() },
    (e) => { if (e.type === 'tool_use') console.log('  [tool_use]', e.name); },
  );
  console.log('exit=', res.exitCode, 'cost=$' + res.costUsd, 'tools=' + res.toolCalls.length);
  console.log('--- text ---\n' + res.text.slice(0, 900));
}
main().catch((e) => { console.error('FAILED', e); process.exit(1); });
