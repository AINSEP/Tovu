// Probe: can Tovu (type: commonjs) require() the ESM-only @jini-ai/agent-runtime?
try {
  const m = require('@jini-ai/agent-runtime');
  console.log('REQUIRE_OK exports=' + Object.keys(m).length);
} catch (e) {
  console.log('REQUIRE_FAIL ' + e.code);
  console.log(e.message.split('\n').slice(0, 6).join('\n'));
}
