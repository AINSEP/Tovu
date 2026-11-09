/** P25: the former copy card approves references, with no source-site discovery or secret copies. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFakeClock } from '#src/__tests__/support/fake-clock';
import { createSurfaceExchangeStore, SURFACE_DISMISSED_PARAM } from '@jini-ai/daemon/surface-exchanges';
import { InMemoryVaultRepo } from '@jini-ai/platform/secrets/credential-sets';
import { fakeAttachments, vaultRow } from '#src/features/project-keys/__tests__/helpers';
import { createProjectKeys } from '#src/features/project-keys/service';
import { buildCredentialCopyRegistrations, CREDENTIAL_COPY_TOOL_ID } from '../credential-copy-tool.js';

async function fixture({ saved = { normalCard: true } }: { saved?: unknown } = {}) {
  let next = 0;
  const timers = new Set<() => void>();
  const exchanges = createSurfaceExchangeStore({ clock: createFakeClock({ startIso: '2026-11-04T00:00:00Z' }),
    idGenerator: { newId: () => `use-${++next}` }, defaultChannel: 'mcp-ui',
    scheduler: { schedule: ({ callback }) => { timers.add(callback); return () => { timers.delete(callback); }; } } });
  const vault = new InMemoryVaultRepo({});
  const attachments = fakeAttachments();
  await vault.put({ record: vaultRow(), expectedRevision: null });
  const keys = createProjectKeys({ vault, attachments, siteId: 'server-bound-site', siteName: 'Site A',
    providerUsage: async () => ({ store: 'project', usedByThisSite: false, usedBy: [] }), reapply: async () => 'now',
    transaction: async ({ run }) => run() });
  let allowed = true;
  let normalCards = 0;
  const tool = buildCredentialCopyRegistrations({ deps: { workspaceId: 'workspace-local', ownerPrincipalId: Promise.resolve('owner'),
    projectKeys: keys, authorize: async () => ({ allowed, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
    surfaces: { surfaceExchanges: exchanges }, saveNew: async () => { normalCards++; return saved; } })[0]!;
  const ctx = { executionId: 'use', principal: { id: 'owner' }, run: { id: 'run' }, input: {}, signal: new AbortController().signal };
  return { vault, attachments, tool, ctx, keys, timers, exchanges, countNormal: () => normalCards,
    deny: () => { allowed = false; },
    deliver: (params: Record<string, unknown>, principalId = 'owner') => exchanges.deliver({ exchangeId: `use-${next}`, principalId, params }, { toolId: CREDENTIAL_COPY_TOOL_ID, channel: 'mcp-ui' }) };
}

test('one owner card approves only its selected reference; metadata stays out of the model result', async () => {
  const f = await fixture();
  let cards = 0;
  const result = await f.tool.handler(f.ctx, { emitSurface: async emission => {
    cards++;
    const text = JSON.stringify(emission);
    assert.match(text, /Use this key/, 'one label fits a saved key and Enter a new key');
    assert.doesNotMatch(text, /owner store/, 'plain words, not storage jargon');
    assert.match(text, /Shared Keys/);
    assert.equal(f.deliver({ credentialId: 'key-a' }, 'another-owner').ok, false);
    assert.equal(f.deliver({ credentialId: 'key-a' }).ok, true);
  } });
  assert.deepEqual(result, { granted: true, credentialId: 'key-a' });
  assert.equal(cards, 1);
  assert.equal(await f.attachments.isAttached({ siteId: 'server-bound-site', keyId: 'key-a' }), true);
  assert.equal(await f.attachments.isAttached({ siteId: 'workspace-local', keyId: 'key-a' }), false);
  assert.equal(f.deliver({ credentialId: 'key-a' }).ok, false, 'approval cannot be replayed');
  assert.equal((await f.vault.find({ workspaceId: 'project', id: 'key-a' }))?.revision, 1, 'owner entry is not rewritten');
});

test('the key dropdown opens on a plain prompt, never on a dash', async () => {
  const f = await fixture();
  await f.tool.handler(f.ctx, { emitSurface: async emission => {
    const html = JSON.stringify(emission);
    assert.doesNotMatch(html, /disabled>—</);
    assert.match(html, /disabled>Choose a key</, 'short enough not to clip in the chat frame at phone width');
    f.deliver({ [SURFACE_DISMISSED_PARAM]: true });
  } });
});

test('cancel, expiry and forged site identity never create a grant', async () => {
  for (const answer of ['cancel', 'expiry', 'forged'] as const) {
    const f = await fixture();
    const pending = f.tool.handler(f.ctx, { emitSurface: async () => {
      if (answer === 'expiry') { [...f.timers][0]!(); return; }
      f.deliver(answer === 'cancel' ? { [SURFACE_DISMISSED_PARAM]: true } : { credentialId: 'key-a', siteId: 'victim' });
    } });
    if (answer === 'forged') await assert.rejects(pending, /No site identity/);
    else assert.deepEqual(await pending, answer === 'cancel'
      ? { granted: false, reason: 'dismissed', message: 'The owner closed the card without choosing a key.' }
      : { granted: false, reason: 'interrupted', message: 'The run ended before the owner chose a key.' });
    assert.deepEqual(await f.attachments.usersOf({ keyId: 'key-a' }), []);
  }
});

test('an interrupted run reports interrupted, never a choice by the owner', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const pending = f.tool.handler({ ...f.ctx, signal: controller.signal }, { emitSurface: async () => { controller.abort(); } });
  assert.deepEqual(await pending, { granted: false, reason: 'interrupted', message: 'The run ended before the owner chose a key.' });
});

test('nothing to pick says so; the card still offers a new key', async () => {
  const f = await fixture();
  await f.vault.delete({ workspaceId: 'project', id: 'key-a', expectedRevision: 1 });
  let html = '';
  const result = await f.tool.handler(f.ctx, { emitSurface: async emission => { html = JSON.stringify(emission); f.deliver({ [SURFACE_DISMISSED_PARAM]: true }); } });
  assert.deepEqual(result, { granted: false, reason: 'nothing-to-pick', message: 'No saved keys were available to pick from.' });
  assert.match(html, /Enter a new key/);
  assert.match(html, /No saved keys yet/);
});

test('a key saved on another site is offered by name, adopted after approval, and the secret never returns', async () => {
  const f = await fixture();
  const SITE_KEY = 'saved-on-site:site-b:row-1';
  let adopted = 0;
  const keys = createProjectKeys({ vault: f.vault, attachments: f.attachments, siteId: 'server-bound-site', siteName: 'Site A',
    siteKeys: {
      list: async () => [
        { keyId: SITE_KEY, name: 'Vercel, thetayway', kind: 'vendor', siteName: 'thetayway' },
        { keyId: 'saved-on-site:locked:row-2', name: 'Vercel, old-site', kind: 'vendor', siteName: 'old-site', locked: 'Open old-site in Tovu and recover its key, then try again.' },
      ],
      find: async () => vaultRow({ id: 'row-1' }),
      adopt: async () => { adopted++; return { keyId: 'key-a' }; },
    },
    providerUsage: async () => ({ store: 'project', usedByThisSite: false, usedBy: [] }), reapply: async () => 'now', transaction: async ({ run }) => run() });
  const tool = buildCredentialCopyRegistrations({ deps: { workspaceId: 'workspace-local', ownerPrincipalId: Promise.resolve('owner'),
    projectKeys: keys, authorize: async () => ({ allowed: true, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
    surfaces: { surfaceExchanges: f.exchanges } })[0]!;
  let cardText = '';
  const result = await tool.handler(f.ctx, { emitSurface: async emission => {
    cardText = JSON.stringify(emission);
    assert.equal(adopted, 0, 'nothing is opened before the owner approves');
    assert.match(cardText, /Vercel, thetayway/);
    assert.doesNotMatch(cardText, /value=.{0,4}saved-on-site:locked/, 'a locked key is never selectable');
    assert.match(cardText, /recover its key/, 'locked rows say why, on the card');
    assert.equal(f.deliver({ credentialId: SITE_KEY }, 'someone-else').ok, false, 'only the owner can answer');
    assert.equal(f.deliver({ credentialId: SITE_KEY }).ok, true);
  } });
  assert.deepEqual(result, { granted: true, credentialId: 'key-a' }, 'only the approved reference reaches the model');
  assert.equal(adopted, 1);
  assert.equal(await f.attachments.isAttached({ siteId: 'server-bound-site', keyId: 'key-a' }), true);
  assert.doesNotMatch(JSON.stringify(result), /token/i);
});

test('a non-owner session is refused before any site is read', async () => {
  const f = await fixture();
  let listed = 0;
  const keys = { ...f.keys, list: async () => { listed++; return []; } };
  const tool = buildCredentialCopyRegistrations({ deps: { workspaceId: 'workspace-local', ownerPrincipalId: Promise.resolve('owner'),
    projectKeys: keys, authorize: async () => ({ allowed: true, reason: 'fixture' }), gatedMutations: { gatewayDeps: {} } },
    surfaces: { surfaceExchanges: f.exchanges } })[0]!;
  await assert.rejects(tool.handler({ ...f.ctx, principal: { id: 'not-owner' } }, { emitSurface: async () => {} }), /installation owner/);
  assert.equal(listed, 0);
});

test('permissions are rechecked after approval and deleted entries cannot be granted', async () => {
  for (const changed of ['permission', 'entry'] as const) {
    const f = await fixture();
    await assert.rejects(f.tool.handler(f.ctx, { emitSurface: async () => {
      if (changed === 'permission') f.deny();
      else await f.vault.delete({ workspaceId: 'project', id: 'key-a', expectedRevision: 1 });
      f.deliver({ credentialId: 'key-a' });
    } }));
    assert.deepEqual(await f.attachments.usersOf({ keyId: 'key-a' }), []);
  }
});

test('new-key choice opens the normal secret card and model selection is rejected', async () => {
  const f = await fixture();
  await assert.rejects(f.tool.handler({ ...f.ctx, input: { credentialId: 'key-a' } }), /human card/);
  const result = await f.tool.handler(f.ctx, { emitSurface: async () => { f.deliver({ credentialId: ':new-key' }); } });
  assert.deepEqual(result, { normalCard: true });
  assert.equal(f.countNormal(), 1);
  assert.deepEqual(await f.attachments.usersOf({ keyId: 'key-a' }), []);
});

test('a successful normal-card fallback creates its site grant through the common save-result owner', async () => {
  const f = await fixture({ saved: { created: true, credential: { id: 'key-a' } } });
  const result = await f.tool.handler(f.ctx, { emitSurface: async () => { f.deliver({ credentialId: ':new-key' }); } }) as { usedByThisSite: boolean };
  assert.equal(result.usedByThisSite, true);
  assert.equal(await f.attachments.isAttached({ siteId: 'server-bound-site', keyId: 'key-a' }), true);
});
