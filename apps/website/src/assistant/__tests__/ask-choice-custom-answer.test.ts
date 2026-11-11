import assert from "node:assert/strict";
import test from "node:test";
import Ajv from "ajv";

import type { SurfaceEmitter, ToolRegistration } from "@jini-ai/core";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";

import { ASK_CHOICE_TOOL_ID, askChoiceAgentToolCatalog, buildAskChoiceRegistrations } from "../ask-choice-tool.js";
import { CUSTOM_ANSWER_PARAM, CUSTOM_CHOICE_VALUE } from "../ask-choice-custom-answer.js";

/**
 * @file The "Something else" choice on `assistant_ask_choice`'s card: an extra option plus a text
 * box, so the administrator can answer with something the model did not think of. The typed words
 * reach the model as `freeText`, never as a fake option value.
 */

function newStore(): SurfaceExchangeStore {
  return createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" });
}

function handlerFor(store: SurfaceExchangeStore) {
  const registration = buildAskChoiceRegistrations(undefined, { surfaceExchanges: store }).find((r: ToolRegistration) => r.descriptor.id === ASK_CHOICE_TOOL_ID);
  assert.ok(registration);
  return registration.handler;
}

/** Opens one held form and returns its HTML, a way to answer it, and the pending result. */
async function openForm(input: unknown, { emit = true } = {}) {
  const store = newStore();
  const handler = handlerFor(store);
  const emitted: unknown[] = [];
  const emitSurface: SurfaceEmitter = async (surface) => void emitted.push(surface);
  const pending = handler({
    executionId: "exec-1", principal: { id: "principal-1" }, run: { id: "run-1" }, input, signal: new AbortController().signal,
  } as Parameters<typeof handler>[0], emit ? { emitSurface } : {});
  await new Promise((resolve) => setImmediate(resolve));
  const html = emit
    ? (emitted[0] as { payload: { resource: { resource: { text: string } } } }).payload.resource.resource.text
    : ((await pending) as { content: Array<{ resource?: { text: string } }> }).content[1]?.resource?.text ?? "";
  const answer = (params: Record<string, unknown>) => {
    const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
    assert.deepEqual(store.deliver({ exchangeId, principalId: "principal-1", params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, ...params } }, { toolId: ASK_CHOICE_TOOL_ID }), { ok: true });
  };
  return { html, answer, pending };
}

const SINGLE = { question: "Which colour for the header?", options: [{ label: "Blue" }, { label: "Green" }] };
const MULTI = { question: "Which pages need a banner?", options: [{ label: "Home" }, { label: "About" }], multiple: true };

test("single-select: the card offers Something else with a text box that is required only when picked", async () => {
  const { html } = await openForm(SINGLE);
  assert.match(html, new RegExp(`type="radio"[^>]*name="choice" value="${CUSTOM_CHOICE_VALUE}"`));
  assert.match(html, />Something else</);
  assert.match(html, new RegExp(`name="${CUSTOM_ANSWER_PARAM}" placeholder="Type your own answer"`));
  assert.match(html, new RegExp(`"requiredWhen":\\{"field":"choice","in":\\["${CUSTOM_CHOICE_VALUE}"\\]\\}`));
  // The text box stays hidden until Something else is checked.
  assert.match(html, new RegExp(`:not\\(:has\\(input\\[value="${CUSTOM_CHOICE_VALUE}"\\]:checked\\)\\)`));
});

test("single-select: Something else reaches the model as freeText, never as an option value", async () => {
  const { answer, pending } = await openForm(SINGLE);
  answer({ choice: CUSTOM_CHOICE_VALUE, [CUSTOM_ANSWER_PARAM]: "  Dark red, like the logo  " });
  const result = (await pending) as Record<string, unknown>;
  assert.equal(result.submitted, true);
  assert.equal(result.freeText, "Dark red, like the logo");
  assert.equal(result.choice, undefined);
  assert.match(String(result.note), /in their own words/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(CUSTOM_CHOICE_VALUE));
});

test("single-select: text left in the box is ignored when a listed option is picked", async () => {
  const { answer, pending } = await openForm(SINGLE);
  answer({ choice: "Green", [CUSTOM_ANSWER_PARAM]: "changed my mind" });
  const result = (await pending) as Record<string, unknown>;
  assert.equal(result.choice, "Green");
  assert.equal(result.freeText, undefined);
});

test("multi-select: the model gets the ticked options AND the typed words", async () => {
  const { html, answer, pending } = await openForm(MULTI);
  assert.match(html, new RegExp(`type="checkbox"[^>]*name="selections" value="${CUSTOM_CHOICE_VALUE}"`));
  answer({ selections: ["Home", CUSTOM_CHOICE_VALUE], [CUSTOM_ANSWER_PARAM]: "the pricing page" });
  const result = (await pending) as Record<string, unknown>;
  assert.equal(result.submitted, true);
  assert.deepEqual(result.selections, ["Home"]);
  assert.equal(result.freeText, "the pricing page");
  assert.match(String(result.note), /own words/);
});

test("multi-select: Something else ticked with an empty box sends just the real selections", async () => {
  const { answer, pending } = await openForm(MULTI);
  answer({ selections: ["About", CUSTOM_CHOICE_VALUE], [CUSTOM_ANSWER_PARAM]: "   " });
  const result = (await pending) as Record<string, unknown>;
  assert.deepEqual(result.selections, ["About"]);
  assert.equal(result.freeText, undefined);
});

test("allowCustom: false hides Something else, and the catalog schema accepts it", async () => {
  const { html } = await openForm({ ...SINGLE, allowCustom: false });
  assert.doesNotMatch(html, /Something else/);
  assert.doesNotMatch(html, new RegExp(CUSTOM_ANSWER_PARAM));
  const schema = askChoiceAgentToolCatalog[0]!.inputSchema!;
  assert.equal(new Ajv().compile(schema)({ ...SINGLE, allowCustom: false }), true);
  assert.match(askChoiceAgentToolCatalog[0]!.description, /allowCustom/);
});

test("the no-emit fallback form omits Something else (its ticket answer cannot carry typed words)", async () => {
  const { html } = await openForm(SINGLE, { emit: false });
  assert.match(html, /Blue/);
  assert.doesNotMatch(html, /Something else/);
});
