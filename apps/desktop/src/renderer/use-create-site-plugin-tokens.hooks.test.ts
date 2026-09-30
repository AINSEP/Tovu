/**
 * @file The pure halves of `use-create-site-plugin-tokens.hooks.ts`: what the create input carries
 * for the typed tokens, and the line the "is ready" notice adds for them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createdTokensNote, tokensForCreate } from './use-create-site-plugin-tokens.hooks.js';

test('tokensForCreate: trimmed, blanks dropped, undefined when nothing was typed', () => {
  assert.deepEqual(tokensForCreate({ supabase: '  sbp_x  ', crm: '   ' }), { supabase: 'sbp_x' });
  assert.equal(tokensForCreate({ supabase: '' }), undefined);
  assert.equal(tokensForCreate({}), undefined);
});

test('createdTokensNote: saved says it connects on first start; failed says to ask the assistant; none is null', () => {
  assert.equal(
    createdTokensNote({ agentPluginTokens: { status: 'saved', pluginIds: ['supabase'] } }),
    'Supabase will connect when this site first starts.',
  );
  assert.equal(
    createdTokensNote({ agentPluginTokens: { status: 'failed', pluginIds: ['supabase', 'my-crm'] } }),
    "Supabase, My Crm couldn't be saved. Open the site and ask its assistant to connect it.",
  );
  assert.equal(createdTokensNote({}), null);
  assert.equal(createdTokensNote(null), null);
});
