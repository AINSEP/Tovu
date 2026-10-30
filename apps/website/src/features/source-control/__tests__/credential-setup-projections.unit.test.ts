import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { ToolExecutionContext } from '@jini-ai/core';
import type { SecretCardSpec } from '@jini-ai/ui/mcp-ui/secret-card';
import type { SourceControlCredentialSetupDeps, proposeSourceControlCredential } from '../credential-setup.js';
import type { SourceControlProviderDescriptor } from '../provider-registry.js';
import type { createSourceControlCredential } from '../store.js';
import { InMemorySourceControlCredentialSetRepo } from '../repo.memory.js';
import { InMemoryKeyring } from '../../webhooks/keyring.memory.js';
import { AesGcmSecretSealer } from '../../webhooks/secret-sealer.aesgcm.js';
import { githubFromSource } from './fixtures/github-from-source.js';
import { credentialText, formatCredentialHint } from '../../../contracts/core/credential-copy.js';

type Prep = { descriptor: SourceControlProviderDescriptor | undefined; provider: string; label: string; locale: string };
type Saved = Awaited<ReturnType<typeof createSourceControlCredential>>;
type Result = Awaited<ReturnType<typeof proposeSourceControlCredential>>;
let captured: SecretCardSpec<Prep, Saved, Result>;
mock.module('@jini-ai/ui/mcp-ui/secret-card', { namedExports: {
  defineSecretCardTool: (spec: SecretCardSpec<Prep, Saved, Result>) => {
    captured = spec;
    return { handler: () => async () => ({ saved: false }) };
  },
} });
const setup = await import('../credential-setup.js');

async function capture({ input = { provider: 'github' }, onAuthorize = () => {} }: { input?: unknown; onAuthorize?: () => void }, _options = {}) {
  const keyring = new InMemoryKeyring();
  const deps: SourceControlCredentialSetupDeps = {
    workspaceId: 'ws', authorize: async () => { onAuthorize(); return { allowed: true, reason: 'matched' }; },
    sourceControlCredentialSetRepo: new InMemorySourceControlCredentialSetRepo(),
    siteAssistantSecretKeyring: keyring, siteAssistantSecretSealer: new AesGcmSecretSealer(keyring),
    clock: { nowMs: () => 0 }, idGen: { newId: () => 'credential' },
    loadSourceControlProviders: githubFromSource,
  };
  const ctx: ToolExecutionContext = { executionId: 'exec', principal: { id: 'person' },
    run: { id: 'run' }, input, signal: new AbortController().signal };
  // The captured card spec is the seam; no exchange or persistence is exercised here.
  await setup.proposeSourceControlCredential({ ctx, deps, surfaces: { surfaceExchanges: { open: () => assert.fail('unused'), deliver: () => assert.fail('unused'), findTypedAnswerTarget: () => undefined, size: () => 0 } } });
  return captured;
}

test('L146 result and outcome preserve every unsuccessful run and descriptor-dependent abandonment', async () => {
  const spec = await capture({});
  const descriptor = (await githubFromSource('ws')).get('github')!.descriptor;
  for (const declared of [undefined, descriptor]) {
    const prep: Prep = { descriptor: declared, provider: 'github', label: 'Original', locale: 'en' };
    const cases = [
      { run: { status: 'cancelled' } as const, message: setup.PROPOSE_CREDENTIAL_CANCELLED },
      { run: { status: 'expired' } as const, message: setup.PROPOSE_CREDENTIAL_CLOSED },
      { run: { status: 'abandoned' } as const, message: declared ? setup.PROPOSE_CREDENTIAL_CLOSED : setup.PROPOSE_CREDENTIAL_ABORTED },
      { run: { status: 'blank' } as const, message: credentialText({ id: 'blank', locale: 'en' }) },
      { run: { status: 'failed', safeMessage: 'Fixed safe failure' } as const, message: 'Fixed safe failure' },
    ];
    for (const { run, message } of cases) {
      assert.deepEqual(spec.result({ prep, run }), { saved: false, credentialId: null, provider: 'github', label: 'Original', cancelled: run.status === 'cancelled', message });
      assert.deepEqual(spec.outcome({ prep, run }), run.status === 'blank' || run.status === 'failed'
        ? { title: 'Credential not saved', state: 'failure', message } : undefined);
    }
  }
});

test('L146 saved projections preserve absent hints and connection fallback without exposing extra data', async () => {
  const spec = await capture({});
  const prep: Prep = { descriptor: undefined, provider: 'github', label: 'Original', locale: 'en' };
  for (const tokenHint of [undefined, null, { length: 12, last4: 'tail' }]) {
    for (const connection of [undefined, 'connected', 'saved'] as const) {
      const saved: Saved = { id: 'credential', providerId: 'github', label: 'Human label', tokenHint,
        configured: true, isDefault: true, accountLabel: null,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
        ...(connection === undefined ? {} : { connection }) };
      const run = { status: 'saved', saved } as const;
      const hint = formatCredentialHint({ hint: tokenHint, locale: prep.locale });
      const message = `${hint ? `${hint}. ` : ''}${credentialText({ id: connection ?? 'saved', locale: prep.locale })}`;
      assert.deepEqual(spec.result({ prep, run }), { saved: true, credentialId: saved.id, provider: 'github',
        label: saved.label, tokenHint, connection: connection ?? 'saved', message });
      assert.deepEqual(spec.outcome({ prep, run }), { title: 'Credential saved', state: 'success', message });
    }
  }
});

test('L146 public input rejects extra keys, missing provider and long labels before authorization', async () => {
  const secretLabel = ['gh', 'p', '_'].join('') + 'a'.repeat(36);
  for (const input of [null, [], {}, { provider: 3 }, { provider: '' }, { provider: 'github', label: secretLabel }, { provider: 'github', token: 'human-only' },
    { provider: 'github', label: 3 }, { provider: 'github', label: 'a'.repeat(201) }]) {
    let authorized = 0;
    await assert.rejects(capture({ input, onAuthorize: () => { authorized += 1; } }));
    assert.equal(authorized, 0);
  }
  await assert.rejects(capture({ input: { provider: 'github', unexpected: true } }), {
    message: 'source_control_propose_credential accepts only provider and label; enter secrets in the human form.',
  });
  await assert.rejects(capture({ input: { provider: 'github', label: 'a'.repeat(201) } }), {
    message: 'Credential label must be at most 200 characters.',
  });
});

test('L146 public label defaults and the maximum label are preserved in preparation', async () => {
  for (const [input, label] of [
    [{ provider: 'github' }, 'default'],
    [{ provider: 'github', label: 'a'.repeat(200) }, 'a'.repeat(200)],
  ] as const) {
    const spec = await capture({ input });
    const prep = await spec.prepare({ ctx: { executionId: 'exec', principal: { id: 'person' }, input,
      run: { id: 'run' }, signal: new AbortController().signal } });
    assert.equal(prep.label, label);
    assert.equal(prep.provider, 'github');
  }
});
