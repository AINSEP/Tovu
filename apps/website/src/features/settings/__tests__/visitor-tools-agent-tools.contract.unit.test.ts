import assert from "node:assert/strict";
import test from "node:test";

import { visitorToolsAgentCatalog } from "../visitor-tools-agent-tools.js";

/**
 * @file F6 fix wave (L7 Stryker: 14 schema-literal survivors, AP5). Inline contract for the four
 * visitor-tool agent tools: one permission (visitor-tools.manage), side effects, strict schemas, and
 * the configure schema's id pattern/limits.
 */

const withoutDescriptions = (value: unknown): unknown => Array.isArray(value) ? value.map(withoutDescriptions)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "description").map(([key, inner]) => [key, withoutDescriptions(inner)]))
  : value;
const auth = { permission: "visitor-tools.manage" };
const EMPTY = { type: "object", additionalProperties: false, properties: {} };

test("every visitor-tools agent tool keeps its exact permission, side effect and strict input schema", () => {
  assert.deepEqual(visitorToolsAgentCatalog.map(({ name, sideEffects, authorization, inputSchema }) => withoutDescriptions({ name, sideEffects, authorization, inputSchema })), [
    { name: "visitor_tools_list", sideEffects: "none", authorization: auth, inputSchema: EMPTY },
    { name: "visitor_tool_configure", sideEffects: "mutates-durable-state", authorization: auth, inputSchema: {
      type: "object", additionalProperties: false, required: ["toolId", "expectedRevisionSeq"], properties: {
        toolId: { type: "string", pattern: "^[a-z][a-z0-9_]{0,127}$" }, expectedRevisionSeq: { type: "integer", minimum: 0 },
        mode: { type: "string", enum: ["auto", "ask", "off"] },
        limits: { type: "object", additionalProperties: false, minProperties: 1, properties: {
          perIpPerHour: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          perSitePerDay: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        } },
      } } },
    { name: "visitor_tool_save", sideEffects: "none", authorization: auth, inputSchema: EMPTY },
    { name: "visitor_tool_delete", sideEffects: "none", authorization: auth, inputSchema: { type: "object", additionalProperties: false, required: ["toolId"], properties: { toolId: { type: "string", minLength: 1 } } } },
  ]);
});

test("the configure tool id pattern is anchored: a valid id passes, look-alikes do not", () => {
  const configure = visitorToolsAgentCatalog.find((tool) => tool.name === "visitor_tool_configure")!;
  const pattern = new RegExp(((configure.inputSchema as { properties: { toolId: { pattern: string } } }).properties.toolId.pattern));
  assert.deepEqual(["site_search", "a", `a${"b".repeat(127)}`, `a${"b".repeat(128)}`, "Site_search", "1abc", "x site_search", "site_search\n", "site-search"].map((id) => pattern.test(id)),
    [true, true, true, false, false, false, false, false, false]);
});
