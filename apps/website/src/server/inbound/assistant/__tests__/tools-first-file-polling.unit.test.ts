import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBaseSystemOverlay, buildBashGuidanceBlock } from '../assistant-system-overlay.js';

test('an attached picture and saved tool result have a safe first read in every chat permission mode', () => {
  for (const nativeToolAccess of [false, true]) for (const prohibited of [false, true]) {
    const overlay = buildBaseSystemOverlay(prohibited, { nativeToolAccess });
    assert.match(overlay, /Attachments and saved tool results/);
    assert.match(overlay, /read_tool_result/);
    assert.match(overlay, /native Read\/image tool/);
    assert.match(overlay, /Never use Bash, shell commands or scripts to inspect attachments or saved tool results/);
    assert.match(overlay, /chat_list_pending_attachments/);
  }
  assert.doesNotMatch(buildBashGuidanceBlock(['Bash']), /Read remains available only for reading Tovu's own source/);
});

test('a pending image job advertises a real wait before polling without a red Bash sleep row', () => {
  for (const nativeToolAccess of [false, true]) {
    const overlay = buildBaseSystemOverlay(false, { nativeToolAccess });
    assert.match(overlay, /wait_for\(\{seconds:/);
    assert.match(overlay, /poll_after_seconds/);
    assert.match(overlay, /Never use Bash or shell sleep between polls/);
    assert.match(overlay, /describe_tool.*jobs_wait/);
  }
});
