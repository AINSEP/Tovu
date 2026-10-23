import assert from "node:assert/strict";
import test from "node:test";
import { createToolRegistry } from "@jini-ai/core";
import type { ToolAttemptEvent } from "@jini-ai/daemon/tool-audit";
import { createVisitorExecutor, VISITOR_TOOL_REFUSAL, type VisitorCapabilityContract, type VisitorExecutionPorts } from "../visitor-executor.js";
import { VisitorPlanRefused } from "../visitor-confirmation-gate.js";
import { EMPTY_VISITOR_TOOL_POLICY, parseVisitorToolPolicy, type VisitorToolPolicy } from "../../../contracts/site-assistant/visitor-tools.js";

function fixture(options: { policy?: VisitorToolPolicy | null; failBudget?: boolean; rejectBudget?: boolean; failPolicy?: boolean; failSink?: boolean; failHandler?: boolean } = {}) {
  let policy = options.policy === undefined ? EMPTY_VISITOR_TOOL_POLICY : options.policy;
  let calls = 0, charges = 0, ids = 0;
  const events: ToolAttemptEvent[] = [], errors: unknown[] = [];
  const abort = new AbortController();
  const ports: VisitorExecutionPorts = {
    initialPolicy: policy, readPolicy: async () => { if (options.failPolicy) throw new Error("policy down"); return policy; },
    workspaceId: "w", runId: "turn", ip: "private-ip", clock: { nowMs: () => 0, nowIso: () => "2026-10-22T00:00:00.000Z" },
    ids: { newId: () => `visitor-${++ids}` }, signal: abort.signal,
    budgets: { charge: async () => { charges++; if (options.rejectBudget) throw new Error("budget down"); return !options.failBudget; } },
    sink: { append: async (event, detail) => { if (options.failSink) throw new Error("sink down"); events.push({ ...event, ...detail }); } },
    reportError: error => { errors.push(error); },
  };
  const capabilities: VisitorCapabilityContract[] = [{ name: "list_categories", visitorOfferable: true,
    displayTitle: "List categories", displayDescription: "Lets visitors see your post categories.",
    execute: async ({ input }) => { calls++; if (options.failHandler) throw new Error("private provider failure"); return { result: input }; } }];
  const executor = createVisitorExecutor({ capabilities }, { ports });
  return { executor, ports, capabilities, events, errors, abort, setPolicy: (next: VisitorToolPolicy | null) => { policy = next; }, calls: () => calls, charges: () => charges };
}
const call = { name: "list_categories", input: { query: "secret" }, caller: "anonymous-visitor" };
const refused = { kind: "refused", reason: VISITOR_TOOL_REFUSAL };

test("uniform refusal uses visitor-friendly language without internal tools or identifiers", () => {
  assert.equal(VISITOR_TOOL_REFUSAL, "I can't help with that request here.");
  assert.doesNotMatch(VISITOR_TOOL_REFUSAL, /tool|list_categories|settings_set_value|[_`]/i);
  assert.equal(new VisitorPlanRefused().message, VISITOR_TOOL_REFUSAL);
});

test("unknown, wrong caller, Off, Ask and over-budget have identical public refusal and no effects", async () => {
  const cases = [
    { options: {}, invocation: { ...call, name: "settings_set_value" } },
    { options: {}, invocation: { ...call, caller: "admin" } },
    ...(["off", "ask"] as const).map(mode => ({ options: { policy: parseVisitorToolPolicy({ value: { version: 1, tools: { list_categories: { mode } } } }) }, invocation: call })),
    { options: { failBudget: true }, invocation: call }, { options: { policy: null }, invocation: call }, { options: { failPolicy: true }, invocation: call },
    { options: { rejectBudget: true }, invocation: call },
  ];
  for (const scenario of cases) {
    const f = fixture(scenario.options);
    assert.deepEqual(await f.executor.invoke(scenario.invocation), refused);
    assert.equal(f.calls(), 0);
    assert.equal(f.events.length, 2);
    assert.equal(f.events[0].phase, "requested");
    assert.equal(f.events[1].phase, "denied");
    assert.equal(f.errors.length, "failPolicy" in scenario.options || "rejectBudget" in scenario.options ? 1 : 0);
    assert.ok(f.events.every(event => event.principalId === "anonymous-visitor"));
    assert.doesNotMatch(JSON.stringify(f.events), /secret|private-ip|provider failure/);
  }
});

test("advertisement reflects policy, Ask never advertises, and the guide reads fresh grants", async () => {
  const f = fixture();
  assert.equal(f.executor.isAdvertised({ toolId: "list_categories" }), true);
  assert.equal(f.executor.isAdvertised({ toolId: "settings_set_value" }), false);
  assert.deepEqual(await f.executor.availableToolNames({}), ["list_categories"]);
  f.setPolicy(parseVisitorToolPolicy({ value: { version: 1, tools: { list_categories: { mode: "off" } } } }));
  assert.deepEqual(await f.executor.availableToolNames({}), []);
  assert.deepEqual(await f.executor.invoke(call), refused);
  f.setPolicy(null);
  assert.deepEqual(await f.executor.availableToolNames({}), []);
  for (const mode of ["ask", "off"]) {
    const other = fixture({ policy: parseVisitorToolPolicy({ value: { version: 1, tools: { list_categories: { mode } } } }) });
    assert.equal(other.executor.isAdvertised({ toolId: "list_categories" }), false);
  }
  assert.equal(fixture({ policy: null }).executor.isAdvertised({ toolId: "list_categories" }), false);
});

test("four attempts per turn uses a synchronous increment and check across parallel calls", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 12 }, () => f.executor.invoke(call)));
  assert.equal(results.filter(result => result.kind === "ok").length, 4);
  assert.equal(f.calls(), 4);
  assert.equal(f.charges(), 4);
  assert.ok(results.slice(4).every(result => JSON.stringify(result) === JSON.stringify(refused)));
  assert.equal(f.events.length, 24);
});

test("attempts keep value-free provenance, fixed identity and terminal phase; sink failure is observation", async () => {
  const f = fixture();
  assert.deepEqual(await f.executor.invoke(call), { kind: "ok", result: call.input, directive: undefined });
  assert.deepEqual(f.events.map(event => event.phase), ["requested", "completed"]);
  assert.equal(f.events[0].attemptId, f.events[1].attemptId);
  assert.ok(f.events[1].executionId);
  assert.doesNotMatch(JSON.stringify(f.events), /secret|private-ip/);
  assert.equal(f.events[0].detail, '{"audience":"visitor","source":"builtin"}');
  const broken = fixture({ failSink: true });
  assert.equal((await broken.executor.invoke(call)).kind, "ok");
  assert.equal(broken.calls(), 1);
  assert.equal(broken.errors.length, 2);
});

test("handler errors retain server-side stacks; cancelled calls refuse silently without raw errors in audit", async () => {
  const f = fixture({ failHandler: true });
  assert.deepEqual(await f.executor.invoke(call), { kind: "error", error: "private provider failure" });
  assert.deepEqual(f.events.map(event => event.phase), ["requested", "failed"]);
  assert.equal(f.errors.length, 1);
  assert.ok(f.errors[0] instanceof Error);
  assert.match(f.errors[0].stack!, /private provider failure/);
  assert.doesNotMatch(JSON.stringify(f.events), /private provider failure/);
  const cancelled = fixture();
  cancelled.abort.abort();
  assert.deepEqual(await cancelled.executor.invoke(call), refused);
  assert.equal(cancelled.calls(), 0);
  assert.equal(cancelled.errors.length, 0);
  assert.deepEqual(cancelled.events.map(event => event.phase), ["requested", "cancelled"]);
});

test("closing the tab during a failing handler produces a silent refusal", async () => {
  const f = fixture();
  const failure = new Error("cancelled pending read");
  const capabilities = [{ ...f.capabilities[0], execute: async () => { f.abort.abort(); throw failure; } }];
  const executor = createVisitorExecutor({ capabilities }, { ports: f.ports });
  assert.deepEqual(await executor.invoke(call), refused);
  assert.equal(f.errors.length, 0);
  assert.deepEqual(f.events.map(event => event.phase), ["requested", "cancelled"]);
});

test("contracts must declare eligibility; a policy entry cannot make a new or undeclared tool executable", async () => {
  const f = fixture();
  const capabilities = [{ ...f.capabilities[0], visitorOfferable: false }, { ...f.capabilities[0], name: "new_read" }] as unknown as VisitorCapabilityContract[];
  const executor = createVisitorExecutor({ capabilities }, { ports: f.ports });
  assert.deepEqual(await executor.invoke(call), refused);
  assert.equal(executor.isAdvertised({ toolId: "new_read" }), false);
  assert.deepEqual(await executor.invoke({ ...call, name: "new_read" }), refused);
  assert.equal(f.calls(), 0);
});

test("rollback runs literal contracts without managed policy, quotas or a sink", async () => {
  const f = fixture();
  const executor = createVisitorExecutor({ capabilities: f.capabilities });
  for (let i = 0; i < 6; i++) assert.equal((await executor.invoke(call)).kind, "ok");
  assert.deepEqual(await executor.availableToolNames({}), ["list_categories"]);
  assert.equal(executor.isAdvertised({ toolId: "list_categories" }), true);
  assert.deepEqual(await executor.invoke({ ...call, name: "unknown" }), refused);
  assert.equal(f.charges(), 0);
});

test("an admin registration in a different registry is unreachable even if policy names it", async () => {
  let adminCalls = 0;
  const adminRegistry = createToolRegistry({});
  adminRegistry.register({ descriptor: { id: "settings_set_value" }, policy: { authorize: () => "allow" }, handler: async () => { adminCalls++; } });
  const f = fixture({ policy: parseVisitorToolPolicy({ value: { version: 1, tools: { settings_set_value: { mode: "auto" } } } }) });
  assert.deepEqual(await f.executor.invoke({ ...call, name: "settings_set_value" }), refused);
  assert.equal(adminCalls, 0);
  assert.equal(adminRegistry.has({ toolId: "settings_set_value" }), true);
});
