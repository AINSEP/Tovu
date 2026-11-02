import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/**
 * @file Tovu's overlay for the portable `supabase` plugin (now `@jini-ai/agent-plugins/supabase`). The
 * portable skill no longer assumes how the host opens links (plan v2 §5.1); Tovu's new-tab
 * behavior and its approval card are stated here instead.
 */

const readGuidance = () => readFile(path.resolve(import.meta.dirname, '../GUIDANCE.md'), 'utf8');

test("Tovu's link and approval behavior live here", async () => {
  const guidance = await readGuidance();
  assert.match(guidance, /new\s+tab/i);
  assert.match(guidance, /\*\*Allow\*\* \/ \*\*Allow for this chat\*\* \/ \*\*Cancel\*\*/);
});

// The supabase skill dropped the old Settings trip and restart (bundled-supabase-package unit
// test); the overlay must not bring them back.
test('the overlay keeps the old setup out', async () => {
  const guidance = await readGuidance();
  for (const stale of [/Settings\s*→\s*External MCP/i, /restart/i, /external_mcp_oauth_connect/]) {
    assert.doesNotMatch(guidance, stale);
  }
});
