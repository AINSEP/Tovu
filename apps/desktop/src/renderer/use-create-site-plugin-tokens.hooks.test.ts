/**
 * @file The pure halves of `use-create-site-plugin-tokens.hooks.ts`: what the create input carries
 * for the typed tokens, and the line the "is ready" notice adds for them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createdTokensNote, tokensForCreate } from './use-create-site-plugin-tokens.hooks.js';
import { hookHarness, sourceFunction } from './source-test-harness.js';
import type { CreateSiteInput } from '../contracts/project.js';

function tokenHook() {
  const harness = hookHarness();
  const inputs = { current: new Map<string, HTMLInputElement>() };
  const hook = sourceFunction(
    readFileSync(new URL('./use-create-site-plugin-tokens.hooks.ts', import.meta.url), 'utf8'),
    'useCreateSitePluginTokens',
    { ...harness.bindings, useRef: () => inputs, tokensForCreate, runnerInventoryBridge: () => undefined },
  );
  return { harness, render: (enabled: boolean) => harness.render(() => hook({}, { enabled })) };
}

test('a create with no tokens reaches onCreate unchanged while services are hidden', async () => {
  const { harness, render } = tokenHook();
  try {
    const hook = render(false);
    const input: CreateSiteInput = { displayName: 'Corner Bakery', database: { kind: 'sqlite' } };
    let received: CreateSiteInput | undefined;
    await hook.withTokens(async (value: CreateSiteInput) => { received = value; })(input);
    assert.equal(received, input);
    assert.equal(Object.hasOwn(received!, 'agentPluginTokens'), false);
  } finally { harness.cleanup(); }
});

test('hiding services after a token was typed sends no token and clears the old input', async () => {
  const { harness, render } = tokenHook();
  try {
    const field = { value: '  sbp_hidden  ' } as HTMLInputElement;
    render(true).inputRef('supabase')(field);
    const hook = render(false);
    const input: CreateSiteInput = { displayName: 'Corner Bakery', database: { kind: 'sqlite' } };
    let received: CreateSiteInput | undefined;
    await hook.withTokens(async (value: CreateSiteInput) => { received = value; })(input);
    assert.equal(received, input);
    assert.equal(Object.hasOwn(received!, 'agentPluginTokens'), false);
    assert.equal(field.value, '');
  } finally { harness.cleanup(); }
});

test('enabling services again preserves Supabase agent plugin tokens and clears the input before create', async () => {
  const { harness, render } = tokenHook();
  try {
    render(false);
    const hook = render(true);
    const field = { value: '  sbp_enabled  ' } as HTMLInputElement;
    hook.inputRef('supabase')(field);
    const input: CreateSiteInput = { displayName: 'Corner Bakery', database: { kind: 'sqlite' } };
    let received: CreateSiteInput | undefined;
    await hook.withTokens(async (value: CreateSiteInput) => {
      assert.equal(field.value, '');
      received = value;
    })(input);
    assert.deepEqual(received, { ...input, agentPluginTokens: { supabase: 'sbp_enabled' } });
  } finally { harness.cleanup(); }
});

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
