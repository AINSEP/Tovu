// Scripted CLI boundary: no network, credentials, model reply, timers or sleeps.
const path = require('node:path');
if (process.argv.includes('--version')) {
  console.log('2.1.309 (Claude Code)');
} else if (process.argv.includes('--help')) {
  console.log('--output-format --input-format --verbose --include-partial-messages --permission-mode --allowedTools --disallowedTools --mcp-config --strict-mcp-config');
} else if (process.argv.includes('auth') && process.argv.includes('status')) {
  // Script the discovery probe as well; no credential is read or sent. The run itself reports
  // the explicit no-key reason below, after proving its real child and site scope were bound.
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'release-gate-fixture' }));
} else {
  // Keep the child alive on its real stdin pipe until the harness closes the app. This lets the
  // shared-daemon journey prove concurrent ownership without a timed sleep or a model request.
  process.stdin.resume();
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'release-gate-no-key',
    session_id: `gate:${path.basename(process.cwd())}:${process.pid}` }));
  console.log(JSON.stringify({ type: 'assistant', error: 'RELEASE_GATE_NO_MODEL_KEY',
    message: { id: 'no-key', content: [{ type: 'text',
      text: 'Release gate: no model key was provided. Supply a model key to generate a reply.' }] } }));
}
