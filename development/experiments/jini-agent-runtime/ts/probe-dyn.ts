async function main() {
  const m = await import('@jini-ai/agent-runtime');
  console.log('DYNAMIC_OK id=' + m.claudeAgentDef.id);
}
main().catch(e => console.log('DYNAMIC_FAIL ' + e.code));
