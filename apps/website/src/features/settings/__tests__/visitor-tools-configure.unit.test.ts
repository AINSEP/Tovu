import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { parseVisitorToolsConfigure, visitorToolsNeedsApproval } from "../visitor-tools-configure.js";
import { visitorToolsObject, VisitorToolPolicyValidationError } from "../../../contracts/site-assistant/visitor-tools.js";
import { readTool, pluginTool, createdTool } from "./visitor-tools-management.fixture.js";

const base = { toolId: "list_categories", expectedRevisionSeq: 0 };
test("closed input retains only valid partial updates and rejects forged approval and authority fields", () => {
  assert.deepEqual(parseVisitorToolsConfigure({ value: { ...base, mode: "off" } }), { ...base, mode: "off" });
  assert.deepEqual(parseVisitorToolsConfigure({ value: { ...base, limits: { perIpPerHour: 31 } } }), { ...base, limits: { perIpPerHour: 31 } });
  assert.deepEqual(parseVisitorToolsConfigure({ value: { toolId: "site", expectedRevisionSeq: 17, mode: "ask", limits: { perSitePerDay: 1001 } } }), { toolId: "site", expectedRevisionSeq: 17, mode: "ask", limits: { perSitePerDay: 1001 } });
  assert.equal(parseVisitorToolsConfigure({ value: { ...base, mode: "auto" } }).mode, "auto");
  assert.deepEqual(visitorToolsObject({ value: {}, keys: [] }), {});
  const invalid = [null, [], 1, "{}", {}, base,
    { ...base, toolId: 1, mode: "off" }, { ...base, toolId: "../private", mode: "off" },
    { ...base, expectedRevisionSeq: -1, mode: "off" }, { ...base, expectedRevisionSeq: "0", mode: "off" },
    { ...base, mode: null }, { ...base, mode: "allow" }, { ...base, limits: {} }, { ...base, limits: [] },
    ...[0, -1, 1.5, "30", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(n => ({ ...base, limits: { perIpPerHour: n } })),
    ...["approved", "confirmed", "permission", "callerPrincipalId", "workspaceId", "endpoint", "remembered"].map(key => ({ ...base, mode: "off", [key]: true })),
    { ...base, limits: { perSitePerDay: 1, extra: true } },
  ];
  for (const value of invalid) assert.throws(() => parseVisitorToolsConfigure({ value }), VisitorToolPolicyValidationError);
});

test("tier table covers publication, public reads, reductions, restoring defaults and above-default reductions", () => {
  const defaultLimits = { perIpPerHour: 30, perSitePerDay: 1000 };
  for (const tool of [readTool, pluginTool, createdTool, { ...readTool, effect: "write" as const }]) {
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "auto", limits: defaultLimits }, next: { mode: "off", limits: defaultLimits } }), false);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "auto", limits: defaultLimits }, next: { mode: "ask", limits: defaultLimits } }), false);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "off", limits: defaultLimits }, next: { mode: "ask", limits: defaultLimits } }), tool !== readTool);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "off", limits: defaultLimits }, next: { mode: "auto", limits: defaultLimits } }), tool !== readTool);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "ask", limits: defaultLimits }, next: { mode: "auto", limits: defaultLimits } }), tool !== readTool);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "ask", limits: { ...defaultLimits, perIpPerHour: 50 } }, next: { mode: "ask", limits: { ...defaultLimits, perIpPerHour: 40 } } }), false);
    assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "auto", limits: { ...defaultLimits, perIpPerHour: 20 } }, next: { mode: "auto", limits: defaultLimits } }), false);
    for (const limits of [{ ...defaultLimits, perIpPerHour: 31 }, { ...defaultLimits, perSitePerDay: 1001 }]) {
      assert.equal(visitorToolsNeedsApproval({ tool, previous: { mode: "auto", limits: defaultLimits }, next: { mode: "auto", limits } }), true);
    }
  }
});

test("every positive reduction is direct even for an enabled external tool above defaults", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 100000 }), (limit) => {
    assert.equal(visitorToolsNeedsApproval({ tool: createdTool, previous: { mode: "auto", limits: { perIpPerHour: limit + 1, perSitePerDay: limit + 1 } },
      next: { mode: "auto", limits: { perIpPerHour: limit, perSitePerDay: limit } } }), false);
  }));
});
