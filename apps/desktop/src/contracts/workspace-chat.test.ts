import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopVerbForAgentToolName, mcpToolNameForVerb } from './workspace-chat.js';
import { runnerToolNames } from './sections.js';

test('mcpToolNameForVerb spells every dot as an underscore so the name passes MCP clients\' tool-name pattern', () => {
  assert.equal(mcpToolNameForVerb('desktop.project.list'), 'desktop_project_list');
  for (const verb of runnerToolNames()) assert.match(mcpToolNameForVerb(verb), /^[a-zA-Z0-9_-]{1,64}$/, verb);
});

test('desktopVerbForAgentToolName reverses the mapping for bare and client-namespaced names', () => {
  const verbs = runnerToolNames();
  assert.ok(verbs.length > 0);
  for (const verb of verbs) {
    assert.equal(desktopVerbForAgentToolName(mcpToolNameForVerb(verb)), verb);
    assert.equal(desktopVerbForAgentToolName(`mcp__jini__${mcpToolNameForVerb(verb)}`), verb);
  }
});

test('desktopVerbForAgentToolName answers undefined for names that are not ours', () => {
  const someVerb = mcpToolNameForVerb(runnerToolNames()[0]!);
  assert.equal(desktopVerbForAgentToolName('Read'), undefined);
  assert.equal(desktopVerbForAgentToolName('mcp__jini__not_a_desktop_verb'), undefined);
  // A namespace prefix with no server separator is malformed, even when it ends in one of our names.
  assert.equal(desktopVerbForAgentToolName(`mcp__${someVerb}`), undefined);
});
