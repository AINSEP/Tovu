/**
 * @file The pure half of `use-create-site-plugin-tokens.hooks.ts`: the line the "is ready" notice adds
 * for the typed tokens (what the create input carries is `tokensForCreate`, tested in
 * `@jini-ai/agent-plugins/connect`). The hook itself is
 * rendered from its real module in `site-create-hooks.jsdom.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createdTokensNote } from './use-create-site-plugin-tokens.hooks.js';

test('createdTokensNote: saved says it connects on first start; failed says to ask the assistant; none is null', () => {
  assert.equal(
    createdTokensNote({ record: { agentPluginTokens: { status: 'saved', pluginIds: ['supabase'] } } }),
    'Supabase will connect when this site first starts.',
  );
  assert.equal(
    createdTokensNote({ record: { agentPluginTokens: { status: 'failed', pluginIds: ['supabase', 'my-crm'] } } }),
    "Supabase, My Crm couldn't be saved. Open the site and ask its assistant to connect it.",
  );
  assert.equal(createdTokensNote({ record: {} }), null);
  assert.equal(createdTokensNote({ record: null }), null);
});
