import assert from 'node:assert/strict';
import test from 'node:test';
import { assistantCliPermissions } from '#src/assistant/assistant-subagents-policy';
import { buildAssistantFilesystemNotices } from '../assistant-filesystem-notices.js';

test('personal MCP opt-in discloses its boundary; personal hooks and permissions are always excluded', () => {
  const capabilities = assistantCliPermissions({ enabled: true }).capabilities;
  for (const userMcp of [false, true]) {
    const notice = buildAssistantFilesystemNotices({ agentId: 'claude', capabilities: { ...capabilities, userMcp, userSettings: true } }, { platform: 'darwin' });
    assert.equal(notice.includes('Personal MCP servers are not folder-limited.'), userMcp);
    assert.ok(notice.includes('Site chat does not inherit your personal Claude hooks or permissions.'));
    assert.doesNotMatch(notice, /OUTSIDE_CANARY_NAME|OUTSIDE_CANARY_CONTENT/);
  }
});

test('Windows shell disclosure follows the shell grant and only the Claude sandbox exception', () => {
  const capabilities = assistantCliPermissions({ enabled: true }).capabilities;
  for (const shell of [false, true]) {
    const notice = buildAssistantFilesystemNotices({ agentId: 'claude', capabilities: { ...capabilities, shell } }, { platform: 'win32' });
    assert.equal(notice.includes('shell is not folder-limited on this platform'), shell);
  }
  assert.equal(buildAssistantFilesystemNotices({ agentId: 'codex', capabilities }, { platform: 'win32' }), '');
});
