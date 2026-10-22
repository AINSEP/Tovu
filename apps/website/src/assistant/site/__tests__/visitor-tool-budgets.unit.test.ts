import assert from "node:assert/strict";
import test from "node:test";
import { createVisitorToolBudgets } from "../visitor-tool-budgets.js";

function fixture() {
  let now = 0;
  const budgets = createVisitorToolBudgets({ clock: { nowMs: () => now } });
  return { budgets, advance: (ms: number) => { now += ms; } };
}
const target = { workspaceId: "w", toolId: "list_categories", ip: "ip", limits: { perIpPerHour: 30, perSitePerDay: 1000 } };

test("30/hour/IP includes the boundary; other tools/sites/IPs have separate counters", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) assert.equal(await f.budgets.charge(target), true);
  assert.equal(await f.budgets.charge(target), false);
  for (const extra of [{ ip: "ip2" }, { workspaceId: "w2" }, { toolId: "site_guide" }]) assert.equal(await f.budgets.charge({ ...target, ...extra }), true);
  f.advance(3_600_000);
  assert.equal(await f.budgets.charge(target), true);
});

test("1000/day/site/tool is shared across IPs and renewed only at the day boundary", async () => {
  const f = fixture();
  const decisions = await Promise.all(Array.from({ length: 1001 }, (_, n) => f.budgets.charge({ ...target, ip: `ip${n}` })));
  assert.equal(decisions.filter(Boolean).length, 1000, "parallel calls must not overrun");
  f.advance(3_600_000);
  assert.equal(await f.budgets.charge({ ...target, ip: "fresh" }), false);
  f.advance(86_400_000 - 3_600_000);
  assert.equal(await f.budgets.charge({ ...target, ip: "fresh" }), true);
});

test("IP refusals never charge the site allowance or lock out another visitor", async () => {
  const f = fixture();
  for (let i = 0; i < 30; i++) assert.equal(await f.budgets.charge(target), true);
  for (let i = 0; i < 1001; i++) assert.equal(await f.budgets.charge(target), false);
  // Observable counter check: exactly 30 site slots were used; all remaining 970 still admit.
  for (let i = 0; i < 970; i++) assert.equal(await f.budgets.charge({ ...target, ip: `fresh-${i}` }), true);
  assert.equal(await f.budgets.charge({ ...target, ip: "site-full" }), false);
});

test("lowering or restoring limits cannot reset counters, including concurrent profile changes", async () => {
  const f = fixture();
  assert.equal(await f.budgets.charge(target), true);
  const low = { ...target, limits: { perIpPerHour: 1, perSitePerDay: 1000 } };
  assert.equal(await f.budgets.charge(low), false);
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => f.budgets.charge(i % 2 ? low : target)));
  assert.equal(results.filter(Boolean).length, 29);
  assert.equal(await f.budgets.charge(target), false);
});

test("independent processes have independent counters; queue recovers after a clock failure", async () => {
  let fail = true;
  const budgets = createVisitorToolBudgets({ clock: { nowMs: () => { if (fail) throw new Error("clock down"); return 0; } } });
  await assert.rejects(budgets.charge(target), /clock down/);
  fail = false;
  assert.equal(await budgets.charge(target), true);
  assert.equal(await fixture().budgets.charge(target), true);
});
