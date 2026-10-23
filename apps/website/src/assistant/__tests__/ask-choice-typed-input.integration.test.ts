import assert from 'node:assert/strict';
import test from 'node:test';
import { buildToolIndex, handleToolCall, type McpToolDef } from '@jini-ai/mcp';

import { ASK_CHOICE_ANSWER_TICKET_PARAM, ASK_CHOICE_TOOL_ID, buildAskChoiceRegistrations } from '../ask-choice-tool.js';
import { executeRegisteredTool } from './fixtures/execute-registered-tool.js';

/** Owner-reported chat inputs must reach the real gate through typed MCP validation, render the
 * intended card, and retain principal-bound answers. Only the unused exchange port is faked.
 */

/** Use the discoverable schema, as typed MCP publication does, with a socket-free gate handler.
 * No emitter is supplied: the real fallback renderer/ticket lifecycle needs no timers or processes.
 */
function createTypedChoiceFixture(_required: Record<string, never>, _options = {}) {
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges: {
    open: () => assert.fail('fallback calls must not open an exchange'),
    deliver: () => assert.fail('fallback calls must redeem their answer ticket'),
    findTypedAnswerTarget: () => undefined,
    size: () => 0,
  } })[0]!;
  const gateInputs: unknown[] = [];
  const tool: McpToolDef = {
    name: ASK_CHOICE_TOOL_ID,
    description: registration.descriptor.description!,
    inputSchema: registration.descriptor.inputSchema as McpToolDef['inputSchema'],
    handler: async ({ args }) => {
      gateInputs.push(args);
      const result = await executeRegisteredTool({ registration, input: args });
      if (result.status !== 'completed') throw new Error(result.error ?? result.status);
      return result.output;
    },
  };
  const tools = buildToolIndex({ tools: [tool] });
  return {
    registration, gateInputs,
    invoke: ({ input }: { input: Record<string, unknown> }, _options = {}) => handleToolCall({
      name: tool.name, tools,
      ctx: { baseUrl: 'http://unused.test', fetchImpl: async () => assert.fail('no network expected') },
    }, { rawArgs: input }),
  };
}

/** Read the actual HTML resource passed through MCP, without executing its scripts. */
function cardHtml({ reply }: { reply: Awaited<ReturnType<typeof handleToolCall>> }, _options = {}): string {
  assert.equal(reply.isError, undefined, JSON.stringify(reply.content));
  const block = reply.content.find(entry => entry.type === 'resource');
  assert.ok(block?.type === 'resource' && 'text' in block.resource, 'a card must reach the MCP client');
  return block.resource.text;
}

const publishOptions = [{ id: 'publish', label: 'Publish now …' }, { id: 'hold', label: 'Not yet — keep it local' }];
const headlineOptions = [
  { label: 'A clearer path forward', description: 'Recommended. Focus on the reader.' },
  { label: 'Build something lasting', description: 'Emphasize the result.' },
];
const realInputs = [
  {
    name: 'title and flat option IDs',
    input: { title: 'Publish the mobile scroll fix to https://a26-ucla.vercel.app?', options: publishOptions },
    title: 'Publish the mobile scroll fix to https://a26-ucla.vercel.app?',
    label: 'Publish the mobile scroll fix to https://a26-ucla.vercel.app?',
    labels: publishOptions.map(option => option.label), values: ['publish', 'hold'], answer: { choice: 'hold' },
  },
  {
    name: 'question, a distinct title and flat option IDs',
    input: { question: 'Publish the mobile scroll fix …?', title: 'Publish to Vercel?', options: publishOptions },
    title: 'Publish to Vercel?', label: 'Publish the mobile scroll fix …?',
    labels: publishOptions.map(option => option.label), values: ['publish', 'hold'], answer: { choice: 'hold' },
  },
  {
    name: 'question and label-only options with descriptions',
    input: { question: 'Which headline …?', options: headlineOptions },
    title: 'Which headline …?', label: 'Which headline …?',
    labels: headlineOptions.map(option => `${option.label} — ${option.description}`), values: headlineOptions.map(option => option.label),
    answer: { choice: headlineOptions[0]!.label },
  },
];

for (const scenario of realInputs) {
  test(`typed MCP + gate: owner input with ${scenario.name} renders and answers the intended card`, async () => {
    const fixture = createTypedChoiceFixture({});
    const before = structuredClone(scenario.input);
    const html = cardHtml({ reply: await fixture.invoke({ input: scenario.input }) });
    assert.deepEqual(fixture.gateInputs, [scenario.input], 'typed validation must pass the input to the gate');
    assert.ok(html.includes(`<h1 class="mcpui-title">${scenario.title}</h1>`));
    assert.ok(html.includes(`<legend class="mcpui-label">${scenario.label}<`));
    for (const label of scenario.labels) assert.ok(html.includes(`>${label}</label>`));
    assert.deepEqual([...html.matchAll(/<input[^>]*type="radio"[^>]*value="([^"]+)"/g)].map(match => match[1]), scenario.values);
    const ticket = html.match(/__askChoiceAnswerTicket"\s*:\s*"([^"]+)"/)?.[1];
    assert.ok(ticket, 'the real card must carry an answer ticket');
    const answer = await executeRegisteredTool({ registration: fixture.registration,
      input: { ...scenario.answer, [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
    assert.equal(answer.status, 'completed');
    assert.deepEqual(answer.output, { submitted: true, ...scenario.answer,
      note: 'Tell the administrator what you understood from their answer, in plain language, before proceeding.' });
    assert.deepEqual(scenario.input, before, 'neither typed MCP nor the gate may mutate the model input');
  });
}

test('typed MCP + gate: flat multiple flag and explicit label render a checklist and retain its answer values', async () => {
  const fixture = createTypedChoiceFixture({});
  const html = cardHtml({ reply: await fixture.invoke({ input: {
    question: 'Which destinations?', title: 'Publish destinations', label: 'Choose every destination', multiple: true,
    options: [{ id: 'preview', label: 'Preview', description: 'Private preview only' }, { value: 'live', label: 'Live' }],
  } }) });
  assert.ok(html.includes('<h1 class="mcpui-title">Publish destinations</h1>'));
  assert.ok(html.includes('<legend class="mcpui-label">Choose every destination</legend>'));
  assert.deepEqual([...html.matchAll(/<input[^>]*type="checkbox"[^>]*value="([^"]+)"/g)].map(match => match[1]), ['preview', 'live']);
  assert.ok(html.includes('>Preview — Private preview only</label>'));
  assert.doesNotMatch(html, /type="radio"/);
  const ticket = html.match(/__askChoiceAnswerTicket"\s*:\s*"([^"]+)"/)?.[1];
  assert.ok(ticket);
  const answer = await executeRegisteredTool({ registration: fixture.registration,
    input: { selections: ['preview', 'live'], [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
  assert.equal(answer.status, 'completed');
  assert.deepEqual(answer.output, { submitted: true, selections: ['preview', 'live'],
    note: 'Tell the administrator what you understood from their answer, in plain language, before proceeding.' });
});

test('typed MCP + gate: an explicit false multiple flag renders radios using the question as label', async () => {
  const fixture = createTypedChoiceFixture({});
  const html = cardHtml({ reply: await fixture.invoke({ input: {
    question: 'Pick one destination', multiple: false, options: publishOptions,
  } }) });
  assert.ok(html.includes('<h1 class="mcpui-title">Pick one destination</h1>'));
  assert.ok(html.includes('<legend class="mcpui-label">Pick one destination<'));
  assert.deepEqual([...html.matchAll(/<input[^>]*type="radio"[^>]*value="([^"]+)"/g)].map(match => match[1]), ['publish', 'hold']);
  assert.doesNotMatch(html, /type="checkbox"/);
});

for (const field of ['singleSelect', 'multiSelect']) {
  test(`typed MCP + gate: nested ${field} renders descriptions and retains IDs and label-default answer values`, async () => {
    const fixture = createTypedChoiceFixture({});
    const html = cardHtml({ reply: await fixture.invoke({ input: { title: 'Next step?', [field]: { label: 'Choose', options: [
      { id: 'publish', label: 'Publish', description: 'Publish immediately' }, { label: 'Hold', description: 'Keep it local' },
    ] } } }) });
    const type = field === 'singleSelect' ? 'radio' : 'checkbox';
    assert.deepEqual([...html.matchAll(new RegExp(`<input[^>]*type="${type}"[^>]*value="([^"]+)"`, 'g'))].map(match => match[1]), ['publish', 'Hold']);
    assert.ok(html.includes('>Publish — Publish immediately</label>'));
    assert.ok(html.includes('>Hold — Keep it local</label>'));
    const ticket = html.match(/__askChoiceAnswerTicket"\s*:\s*"([^"]+)"/)?.[1];
    assert.ok(ticket);
    const values = field === 'singleSelect' ? { choice: 'publish' } : { selections: ['publish', 'Hold'] };
    const answer = await executeRegisteredTool({ registration: fixture.registration,
      input: { ...values, [ASK_CHOICE_ANSWER_TICKET_PARAM]: ticket } });
    assert.equal(answer.status, 'completed');
    assert.deepEqual(answer.output, { submitted: true, ...values,
      note: 'Tell the administrator what you understood from their answer, in plain language, before proceeding.' });
  });
}

test('typed MCP refuses malformed options, flags, unknown keys and model-authored answers before entering the gate', async () => {
  const fixture = createTypedChoiceFixture({});
  const valid = { question: 'Next?', options: [{ label: 'Publish' }] };
  for (const input of [
    { options: valid.options }, { ...valid, question: '' }, { ...valid, options: [] },
    { ...valid, options: [{ id: 42, label: 'Publish' }] }, { ...valid, options: [{ id: 'publish' }] },
    { ...valid, options: [{ label: 'Publish', invented: 'private-value' }] },
    { title: 'Next?', singleSelect: { label: 'Choose', options: [{ label: 'Publish', invented: true }] } },
    { ...valid, multiple: 'yes' }, { ...valid, invented: true },
    { choice: 'publish', [ASK_CHOICE_ANSWER_TICKET_PARAM]: 'model-invented-ticket' },
  ]) {
    const reply = await fixture.invoke({ input });
    assert.equal(reply.isError, true, JSON.stringify(input));
    assert.match(JSON.stringify(reply.content), /invalid arguments for assistant_ask_choice/);
  }
  assert.deepEqual(fixture.gateInputs, [], 'typed MCP must retain its strict schema boundary');
});

test('typed MCP passes declared aliases but the gate refuses conflicting IDs and mixed select shapes', async () => {
  const fixture = createTypedChoiceFixture({});
  for (const value of ['publish', 'other']) {
    const reply = await fixture.invoke({ input: { question: 'Next?', options: [{ id: 'publish', value, label: 'Publish' }] } });
    assert.equal(reply.isError, true);
    assert.match(JSON.stringify(reply.content), /Conflicting.*id.*value/);
  }
  for (const field of ['singleSelect', 'multiSelect']) {
    const reply = await fixture.invoke({ input: { question: 'Next?', title: 'Next step', options: [{ label: 'Publish' }],
      [field]: { label: 'Choose', options: [{ value: 'hold', label: 'Hold' }] } } });
    assert.equal(reply.isError, true);
    assert.match(JSON.stringify(reply.content), /options is ambiguous with singleSelect\/multiSelect/);
  }
  assert.equal(fixture.gateInputs.length, 4, 'these inputs must reach the domain ambiguity checks');
});

test('the gate rejects malformed flat fields before normalization can discard them', async () => {
  const fixture = createTypedChoiceFixture({});
  for (const fields of [{ question: '   ' }, { question: null }, { question: '' }, { multiple: 'maybe' }]) {
    const result = await executeRegisteredTool({ registration: fixture.registration,
      input: { title: 'Next step?', options: [{ label: 'Publish' }], ...fields } });
    assert.equal(result.errorKind, 'validation');
    assert.match(result.error!, /question.*non-empty string|multiple.*boolean/);
    assert.equal(result.output, undefined);
  }
});
