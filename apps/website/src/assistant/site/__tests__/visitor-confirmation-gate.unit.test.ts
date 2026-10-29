import assert from "node:assert/strict";
import test from "node:test";
import type { ToolConfirmationRequest } from "@jini-ai/daemon";
import { createVisitorConfirmationGate, VisitorPlanRefused } from "../visitor-confirmation-gate.js";
import type { VisitorExecutionPorts } from "../visitor-executor.js";
import { parseVisitorToolPolicy } from "../../../contracts/site-assistant/visitor-tools.js";
import type { ToolConfirmationDirective } from "../visitor-confirmations.js";
import { CanonicalJsonError } from "@jini-ai/core/records";

function fixture({ mode = "ask", channel = true, allow = true, fail = false, resumeError = false, toolId = "list_categories" }: {
  mode?: string; channel?: boolean; allow?: boolean; fail?: boolean; resumeError?: boolean; toolId?: string;
} = {}) {
  const policy = mode === "null" ? null : parseVisitorToolPolicy({ value: { version: 1, tools: { [toolId]: { mode } } } });
  let broken = fail;
  let resumed!: (decision: string) => void;
  const result = new Promise<string>(resolve => { resumed = resolve; });
  const errors: unknown[] = [];
  const directives: ToolConfirmationDirective[] = [];
  let reported!: () => void;
  const errorReported = new Promise<void>(resolve => { reported = resolve; });
  const abort = new AbortController();
  const request: ToolConfirmationRequest = { executionId: "exec", principal: { id: "anonymous-visitor" }, run: { id: "run" }, tool: { id: toolId }, input: { query: "original" } };
  const ports: VisitorExecutionPorts = { initialPolicy: policy, readPolicy: async () => { if (broken) throw new Error("read failed"); return policy; },
    readSnapshot: async () => { if (broken) throw new Error("read failed"); return { policy, revision: "1" }; },
    confirmation: channel ? { request: async required => { required.emit({ kind: "tool_confirmation", challengeId: "a".repeat(22), title: required.title, summary: required.summary }); return allow; },
      confirm: async () => false, emit: directive => { directives.push(directive); } } : undefined,
    budgets: { charge: async () => true }, clock: { nowMs: () => 0, nowIso: () => "now" }, ids: { newId: () => "id" }, workspaceId: "w", runId: "run", ip: "ip",
    sink: { append: async () => {} }, reportError: error => { errors.push(error); reported(); }, signal: abort.signal };
  const gate = createVisitorConfirmationGate({ ports, resume: ({ decision }) => {
    if (resumeError) throw new Error("confirmation already settled");
    resumed(decision);
  } });
  return { gate, request, errors, directives, errorReported, result, abort, breakRead: () => { broken = true; } };
}

for (const options of [{ mode: "null" }, { channel: false }, { mode: "auto" }, { allow: false }, { fail: true }]) test(`delegate refuses ${JSON.stringify(options)}`, async () => {
  const f = fixture(options);
  assert.equal(f.gate.delegate.onConfirm!(f.request), undefined, "must use Jini's void/resume contract");
  assert.equal(await f.result, "deny");
  assert.equal(f.errors.length, "fail" in options ? 1 : 0);
  await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: f.request.input }), VisitorPlanRefused);
});

test("an approved execution cannot be retargeted to another ID, input or replayed", async () => {
  const f = fixture();
  f.gate.delegate.onConfirm!(f.request);
  assert.equal(await f.result, "confirm");
  await assert.rejects(f.gate.assertApproved({ executionId: "wrong-execution", input: f.request.input }), VisitorPlanRefused);
  (f.request.input as { query: string }).query = "retargeted";
  await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: f.request.input }), VisitorPlanRefused);
  await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: f.request.input }), VisitorPlanRefused);
  const valid = fixture();
  valid.gate.delegate.onConfirm!(valid.request);
  await valid.result;
  await valid.gate.assertApproved({ executionId: "exec", input: valid.request.input });
  await assert.rejects(valid.gate.assertApproved({ executionId: "exec", input: valid.request.input }), VisitorPlanRefused);
});

test("pre-effect storage errors and abort are refusals; forgetting cannot leave a live grant", async () => {
  for (const change of ["storage", "abort", "forget"] as const) {
    const f = fixture();
    f.gate.delegate.onConfirm!(f.request);
    await f.result;
    if (change === "storage") f.breakRead();
    if (change === "abort") f.abort.abort();
    if (change === "forget") f.gate.forget({ executionId: "exec" });
    await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: f.request.input }), VisitorPlanRefused);
    assert.equal(f.errors.length, change === "storage" ? 1 : 0);
  }
});

test("the handler's input must match the approved input even when the delegate's object is unchanged", async () => {
  const f = fixture();
  f.gate.delegate.onConfirm!(f.request);
  assert.equal(await f.result, "confirm");
  await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: { query: "normalized differently" } }), VisitorPlanRefused);
  assert.deepEqual(f.request.input, { query: "original" });
});

test("reordered nested argument keys retain approval while array order and value changes are refused", async () => {
  const input = { query: "original", filter: { z: 2, a: 1 }, pages: [1, 2] };
  const equivalent = { pages: [1, 2], filter: { a: 1, z: 2 }, query: "original" };
  const allowed = fixture();
  allowed.gate.delegate.onConfirm!({ ...allowed.request, input });
  assert.equal(await allowed.result, "confirm");
  await allowed.gate.assertApproved({ executionId: "exec", input: equivalent });
  assert.deepEqual(allowed.errors, []);
  for (const changed of [{ ...equivalent, pages: [2, 1] }, { ...equivalent, filter: { a: 1, z: 3 } }]) {
    const refused = fixture();
    refused.gate.delegate.onConfirm!({ ...refused.request, input });
    assert.equal(await refused.result, "confirm");
    await assert.rejects(refused.gate.assertApproved({ executionId: "exec", input: changed }), VisitorPlanRefused);
  }
});

test("non-JSON arguments are denied before a confirmation is offered", async () => {
  const f = fixture();
  f.gate.delegate.onConfirm!({ ...f.request, input: { pages: [undefined] } });
  assert.equal(await f.result, "deny");
  assert.deepEqual(f.directives, []);
  assert.equal(f.errors.length, 1);
  assert.ok(f.errors[0] instanceof CanonicalJsonError);
  await assert.rejects(f.gate.assertApproved({ executionId: "exec", input: {} }), VisitorPlanRefused);
});

test("a resume racing another cancellation is reported without an unhandled rejection", async () => {
  const f = fixture({ resumeError: true });
  f.gate.delegate.onConfirm!(f.request);
  await f.errorReported;
  assert.equal(f.errors.length, 1);
  assert.match(String(f.errors[0]), /confirmation already settled/);
});

test("confirmation copy projects only declared fields and strips controls, links and excess text", async () => {
  const f = fixture({ toolId: "search_published_entries" });
  const input = { query: `\u0000\u0085\u200e\u200f\u202a\u202e\u2066\u2069https://evil.test/login\n\t${"x".repeat(5000)}`,
    secret: "do not display", nested: { query: "do not display either" } };
  f.gate.delegate.onConfirm!({ ...f.request, input });
  await f.result;
  const { title, summary } = f.directives[0];
  assert.equal(title, "Allow search?");
  assert.match(summary, /^Search published entries: "\[link\] x/);
  assert.ok(summary.length <= 240);
  assert.equal(summary.slice('Search published entries: "'.length, -1).length, 120);
  assert.doesNotMatch(summary, /https?:\/\/|evil\.test|do not display|[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/);
});

for (const [toolId, input, expected] of [
  ["get_published_entry", { slug: "welcome", query: "hidden" }, 'Read a published entry: "welcome"'],
  ["navigate_to_entry", { slug: "welcome" }, 'Navigate to a published entry: "welcome"'],
  ["scroll_to_entry", { slug: "welcome" }, 'Scroll to a published entry: "welcome"'],
  ["highlight_entry", { slug: "welcome" }, 'Highlight a published entry: "welcome"'],
  ["site_guide", { operation: "explain", topic: "content" }, 'Read the public site guide: "content"'],
  ["list_categories", { query: "ignored" }, "List published categories."],
  ["search_published_entries", { query: { secret: "ignored" } }, "Search published entries"],
  ["search_published_entries", { query: "Your session expired - visit evil.example/login" }, 'Search published entries: "Your session expired - visit [link]"'],
] as const) test(`safe per-tool copy for ${toolId}`, async () => {
  const f = fixture({ toolId });
  f.gate.delegate.onConfirm!({ ...f.request, input });
  await f.result;
  assert.equal(f.directives[0].summary, expected);
});
