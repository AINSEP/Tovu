import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { EMPTY_VISITOR_TOOL_POLICY, parseVisitorToolPolicy, resolveVisitorToolChoice, VisitorToolPolicyValidationError } from "../visitor-tools.js";

test("upgrade grants only the seven reviewed tools; future ids and prototype names start Off", () => {
  for (const toolId of ["search_published_entries", "get_published_entry", "list_categories", "navigate_to_entry", "scroll_to_entry", "highlight_entry", "site_guide"]) {
    assert.equal(resolveVisitorToolChoice({ policy: EMPTY_VISITOR_TOOL_POLICY, toolId }).mode, "auto");
  }
  for (const toolId of ["new_tool", "toString", "__proto__"]) assert.equal(resolveVisitorToolChoice({ policy: EMPTY_VISITOR_TOOL_POLICY, toolId }).mode, "off");
});

test("explicit Off and Ask survive reads; limits normalize without mutating the input", () => {
  for (const mode of ["off", "ask", "auto"] as const) {
    const value = { version: 1, tools: { list_categories: { mode } } };
    const policy = parseVisitorToolPolicy({ value });
    assert.deepEqual(resolveVisitorToolChoice({ policy, toolId: "list_categories" }), { mode, limits: { perIpPerHour: 30, perSitePerDay: 1000 } });
    assert.deepEqual(value.tools.list_categories, { mode });
  }
});

const invalid: unknown[] = [null, [], false, "{}", {}, { version: 2, tools: {} }, { version: 1, tools: null },
  { version: 1, tools: {}, admin: true }, { version: 1, tools: { "../admin": { mode: "auto" } } },
  { version: 1, tools: { a: null } }, { version: 1, tools: { a: { mode: "allow" } } },
  { version: 1, tools: { a: { mode: "auto", endpoint: "secret" } } },
  { version: 1, tools: Object.fromEntries(Array.from({ length: 129 }, (_, n) => [`a${n}`, { mode: "off" }])) }];
for (const value of invalid) test(`malformed policy fails closed: ${JSON.stringify(value).slice(0, 100)}`, () => {
  assert.throws(() => parseVisitorToolPolicy({ value }), VisitorToolPolicyValidationError);
});

for (const limits of [null, [], {}, { perIpPerHour: 1 }, { perIpPerHour: 0, perSitePerDay: 1 }, { perIpPerHour: 31, perSitePerDay: 1 },
  { perIpPerHour: 1, perSitePerDay: 1001 }, { perIpPerHour: 1.5, perSitePerDay: 1 }, { perIpPerHour: "1", perSitePerDay: 1 },
  { perIpPerHour: 1, perSitePerDay: 1, extra: true }]) test(`invalid limits: ${JSON.stringify(limits)}`, () => {
  assert.throws(() => parseVisitorToolPolicy({ value: { version: 1, tools: { a: { mode: "auto", limits } } } }), VisitorToolPolicyValidationError);
});

test("all valid reductions round-trip, with no widening or mode loss", () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 1000 }), fc.constantFrom("auto", "ask", "off"), (perIpPerHour, perSitePerDay, mode) => {
    const value = { version: 1, tools: { a: { mode, limits: { perIpPerHour, perSitePerDay } } } };
    assert.deepEqual(parseVisitorToolPolicy({ value }), value);
  }));
});
