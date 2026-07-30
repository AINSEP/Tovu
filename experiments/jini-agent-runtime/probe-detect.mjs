import { detectAgents } from '@jini-ai/agent-runtime';
const t0 = Date.now();
const agents = await detectAgents();
console.log(`detectAgents() -> ${agents.length} agents in ${Date.now()-t0}ms`);
for (const a of agents.filter(a => a.available)) {
  console.log(`  AVAILABLE ${a.id.padEnd(14)} v=${a.version ?? '?'} auth=${a.authStatus ?? '?'} models=${a.models.length}(${a.modelsSource}) path=${a.path}`);
}
console.log('  unavailable:', agents.filter(a => !a.available).map(a => a.id).join(', '));
