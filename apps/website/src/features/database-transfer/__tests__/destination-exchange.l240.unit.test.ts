import assert from 'node:assert/strict';
import test from 'node:test';
import type { SurfaceEmission } from '@jini-ai/core';
import type { SurfaceExchangeConversation } from '@jini-ai/daemon/surface-exchanges';
import { createDestinationExchangeReporter } from '../destination-exchange.js';
import { buildDestinationForm, buildDestinationOutcome } from '../destination-ui.js';
import type { SavedDatabaseDestination } from '../destination-store.js';

async function report({ result, payload = { resource: buildDestinationForm('pin') }, get = async () => null,
  locale = 'en', localeError, handlerError, outcome }: {
  result: unknown; payload?: SurfaceEmission['payload']; get?: () => Promise<SavedDatabaseDestination | null>;
  locale?: string; localeError?: Error; handlerError?: Error; outcome?: SurfaceEmission;
}, _options = {}) {
  const emissions: SurfaceEmission[] = [];
  const calls: string[] = [];
  const exchange: SurfaceExchangeConversation = {
    id: 'pin', send: async ({ emission }) => { emissions.push(emission); },
    receive: async () => ({ status: 'received', params: { submitted: 'untrusted' } }),
    close: () => { calls.push('close'); },
  };
  const reporter = createDestinationExchangeReporter({ workspaceId: 'ws', store: {
    get: async workspaceId => { calls.push(workspaceId); return get(); },
    save: async () => assert.fail('must not save'), lastRun: async () => assert.fail('must not read run'),
    recordRun: async () => assert.fail('must not write run'),
  } }, { localeForExchange: async ({ exchangeId }) => {
    calls.push(`locale:${exchangeId}`);
    if (localeError) throw localeError;
    return locale;
  } });
  const output = await reporter({ exchange, confirmationEmission: { channel: 'mcp-ui', payload }, handle: async answer => {
    calls.push('handle');
    assert.deepEqual(answer, { status: 'received', params: { submitted: 'untrusted' } });
    if (handlerError) throw handlerError;
    return { result, outcome };
  } });
  return { output, emissions, calls };
}

for (const payload of [{}, { resource: {} }, { resource: { resource: {} } },
  { resource: { resource: { uri: 'ui://other/form' } } }]) {
  test(`unrelated destination surface passes through: ${JSON.stringify(payload)}`, async () => {
    const result = { saved: true };
    const actual = await report({ result, payload });
    assert.equal(actual.output, result);
    assert.equal(actual.emissions.length, 1);
    assert.deepEqual(actual.calls, ['handle', 'close']);
  });
}
for (const result of [null, false, 0, 'value', {}, { saved: false }, { saved: false, message: 1 }]) {
  test(`non-displayable result passes through after locale lookup: ${JSON.stringify(result)}`, async () => {
    const actual = await report({ result });
    assert.equal(actual.output, result);
    assert.equal(actual.emissions.length, 1);
    assert.deepEqual(actual.calls, ['handle', 'locale:pin', 'close']);
  });
}
for (const saved of [false, null, 'true']) {
  test(`only literal true is success; ${JSON.stringify(saved)} renders a translated failure`, async () => {
    const result = { saved, message: 'Enter a token. Spaces alone are not a token.', code: 'blank' };
    const actual = await report({ result, locale: 'de' });
    const message = 'Gib ein Token ein. Nur Leerzeichen sind kein Token.';
    assert.deepEqual(actual.output, { ...result, message });
    assert.equal(result.message, 'Enter a token. Spaces alone are not a token.');
    assert.deepEqual(actual.emissions[1], { channel: 'mcp-ui', payload: {
      resource: buildDestinationOutcome({ exchangeId: 'pin', state: 'failure', message }),
    } });
    assert.deepEqual(actual.calls, ['handle', 'locale:pin', 'close']);
  });
}
for (const stored of ['hint', 'no-hint', 'missing', 'unreadable'] as const) {
  test(`successful destination uses stored hint only (${stored})`, async () => {
    const tokenHint = { last4: 'tail', length: 12 };
    const result = { saved: true, tokenHint: { last4: 'fake', length: 99 } };
    const actual = await report({ result, get: async () => {
      if (stored === 'unreadable') throw new Error('private failure');
      if (stored === 'missing') return null;
      return { connectionString: 'postgres://owner@db.example.test/db',
        description: { host: 'db.example.test', port: '5432', database: 'db', user: 'owner' },
        savedAt: 'now', ...(stored === 'hint' ? { tokenHint } : {}) };
    } });
    assert.deepEqual(actual.output, { saved: true, tokenHint: stored === 'hint' ? tokenHint : null, connection: 'connected' });
    assert.deepEqual(result.tokenHint, { last4: 'fake', length: 99 });
    assert.deepEqual(actual.emissions[1], { channel: 'mcp-ui', payload: { resource: buildDestinationOutcome({
      exchangeId: 'pin', state: 'success', message: stored === 'hint' ? '…tail, 12 chars. Connected.' : 'Connected.',
    }) } });
    assert.deepEqual(actual.calls, ['handle', 'locale:pin', 'ws', 'close']);
  });
}
for (const source of ['localeError', 'handlerError'] as const) {
  test(`${source} propagates`, async () => {
    const failure = new Error(source);
    await assert.rejects(report({ result: { saved: true }, [source]: failure }), error => error === failure);
  });
}

for (const result of [null, { saved: false }, { saved: false, message: 42 }]) {
  test(`non-displayable result preserves the handler outcome (${JSON.stringify(result)})`, async () => {
    const outcome: SurfaceEmission = { channel: 'mcp-ui', payload: { existing: 'outcome' } };
    const actual = await report({ result, outcome });
    assert.equal(actual.output, result);
    assert.deepEqual(actual.emissions[1], outcome);
    assert.equal(actual.emissions.length, 2);
  });
}
