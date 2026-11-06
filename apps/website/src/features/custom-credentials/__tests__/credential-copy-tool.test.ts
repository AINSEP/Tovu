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
    else assert.deepEqual(await pending, { granted: false });
    assert.deepEqual(await f.attachments.usersOf({ keyId: 'key-a' }), []);
  }
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
