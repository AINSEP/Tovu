import { expect, it } from 'vitest';
import { askAgentPluginChoice, ASK_CHOICE_TOOL_ID } from '../../../../website/src/assistant/ask-choice-tool.js';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/core/primitives';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import type { SurfaceEmission } from '@jini-ai/core';
import { SURFACE_QUESTION_META_KEY, projectAcceptedInputEvents, acceptedInputEvent, isAwaitingAnswer, type AgentEvent } from '@jini-ai/chat/core';
import { translateRunAgentPayload, runEventsForSave } from '@jini-ai/chat/core/run-events';

it.each(['use', 'auto', 'skip'] as const)('journals the validated %s answer against the exact displayed card', async action => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const emissions: SurfaceEmission[] = [];
  let uri: string | undefined;
  let exchangeId: string | undefined;
  const result = await askAgentPluginChoice({ surfaces: { surfaceExchanges }, principalId: 'alice', signal: new AbortController().signal,
    matches: [{ id: 'github', name: 'GitHub', why: 'Lets the assistant use the repository' }], emitSurface: async emission => {
      emissions.push(emission);
      if (emission.channel !== 'mcp-ui') return;
      const ui = emission.payload.resource as { resource: { uri: string; text: string; _meta: Record<string, unknown> } };
      uri = ui.resource.uri;
      expect(ui.resource._meta[SURFACE_QUESTION_META_KEY]).toEqual({ title: 'Agent plugins', options: [{ value: 'github', label: 'GitHub' }] });
      expect(ui.resource.text).toContain('GitHub — Lets the assistant use the repository');
      expect(ui.resource.text).toContain('Use');
      expect(ui.resource.text).toContain('Skip');
      exchangeId = ui.resource.text.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
      expect(exchangeId).toEqual(expect.any(String));
      expect(surfaceExchanges.deliver({ exchangeId: exchangeId!, principalId: 'mallory', params: { __choiceAction: action, selections: ['github'] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok).toBe(false);
      expect(surfaceExchanges.deliver({ exchangeId: exchangeId!, principalId: 'alice',
        params: action === 'skip' ? { __dismissed: true } : { __choiceAction: action, selections: ['github'] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok).toBe(true);
    } });
  expect(result).toEqual({ action, selected: action === 'skip' ? [] : ['github'] });
  expect(emissions.map(emission => emission.channel)).toEqual(['mcp-ui', 'user_message']);
  const answerText = action === 'skip' ? 'Declined' : 'GitHub';
  expect(emissions[1]?.payload).toEqual({ id: `answer:${exchangeId}`, surfaceUri: uri, answerText, text: `Agent plugins: ${answerText}` });
  // The existing wire reduction and events_json projection retain the receipt without a tool result.
  const events = emissions.map(emission => translateRunAgentPayload({ payload: {
    ...emission.payload, type: emission.channel,
  } })).filter((event): event is AgentEvent => event !== null);
  const saved = runEventsForSave({ events: [...events, events[1]!] });
  const replayed = projectAcceptedInputEvents({ events: JSON.parse(JSON.stringify(saved)) });
  expect(replayed.flatMap(event => acceptedInputEvent({ event })?.data.text ?? [])).toEqual([`Agent plugins: ${answerText}`]);
  expect(isAwaitingAnswer({ events: [events[0]!] })).toBe(true);
  expect(isAwaitingAnswer({ events: replayed })).toBe(false);
  expect(surfaceExchanges.deliver({ exchangeId: exchangeId!, principalId: 'alice', params: { selections: ['github'] } }, { toolId: ASK_CHOICE_TOOL_ID }).ok).toBe(false);
});

it('never records an unoffered pick as a human answer', async () => {
  const surfaceExchanges = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(),
    idGenerator: createRandomUuidGenerator(), defaultChannel: 'mcp-ui' });
  const emissions: SurfaceEmission[] = [];
  const result = await askAgentPluginChoice({ surfaces: { surfaceExchanges }, principalId: 'alice', signal: new AbortController().signal,
    matches: [{ id: 'github', name: 'GitHub', why: 'Repository work' }], emitSurface: async emission => {
      emissions.push(emission);
      const html = (emission.payload.resource as { resource: { text: string } }).resource.text;
      const exchangeId = html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1];
      expect(exchangeId).toEqual(expect.any(String));
      surfaceExchanges.deliver({ exchangeId: exchangeId!, principalId: 'alice', params: { __choiceAction: 'auto', selections: ['unoffered'] } }, { toolId: ASK_CHOICE_TOOL_ID });
    } });
  expect(result).toEqual({ action: 'skip', selected: [] });
  expect(emissions.map(emission => emission.channel)).toEqual(['mcp-ui']);
});
