/**
 * @file The app-level agent's tool set (`desktop-agent-tools.ts`), driven through the registrations
 * it returns: the shared desktop table adapted under `desktop.`, `desktop.navigate`, and the
 * `site.*` pair reaching ONLY the site a run was started against. The site gateway and navigation
 * are hand-written fakes; the shared table runs for real against a temp projects file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import {
  buildDesktopAgentTools,
  DESKTOP_TOOL_PREFIX,
  NAVIGABLE_SECTIONS,
  UNBUILT_SITE_TOOL_GATEWAY,
  type DesktopAgentToolDeps,
  type SiteToolGateway,
  type TurnAddressee,
} from "./desktop-agent-tools.ts";
import { describeSitesMcpTools } from "./sites-mcp-tools.ts";
import { SITE_ORIGIN, sitesFilePath, trackSite } from "./tracked-sites.ts";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-agent-tools-"));
}

/** One call's context, as Jini's ToolExecutor hands it to a handler. */
function call(runId: string, input: unknown): ToolExecutionContext {
  return { executionId: `exec-${runId}`, principal: { id: "operator" }, run: { id: runId }, input, signal: new AbortController().signal };
}

function harness(overrides: Partial<DesktopAgentToolDeps> = {}) {
  const projectsPath = sitesFilePath(tempDir());
  const navigated: string[] = [];
  const gatewayCalls: unknown[] = [];
  const addressees = new Map<string, TurnAddressee>();
  const siteTools: SiteToolGateway = {
    listTools: async ({ siteDir }) => {
      gatewayCalls.push({ list: siteDir });
      return { available: true, tools: [{ id: "content.read", description: "Read content" }] };
    },
    callTool: async (required) => {
      gatewayCalls.push({ call: required });
      return { ok: true, output: { echoed: required.input } };
    },
  };
  const tools = buildDesktopAgentTools({
    sitesToolContext: { projectsPath, revealPath: async () => {} },
    addresseeOf: (runId) => addressees.get(runId) ?? null,
    siteTools,
    navigate: ({ section }) => navigated.push(section),
    ...overrides,
  });
  const byId = new Map(tools.map((tool) => [tool.descriptor.id, tool]));
  const tool = (id: string): ToolRegistration => {
    const found = byId.get(id);
    assert.ok(found, `no tool ${id}`);
    return found;
  };
  return { tools, tool, projectsPath, navigated, gatewayCalls, addressees };
}

test("every shared desktop verb is offered under desktop., with its own description and read-only flag", () => {
  const h = harness();
  const shared = describeSitesMcpTools();
  for (const row of shared) {
    const tool = h.tool(`${DESKTOP_TOOL_PREFIX}${row.name}`);
    assert.equal(tool.descriptor.description, row.description, "one description, never re-declared");
    assert.equal(tool.descriptor.inputSchema, row.inputSchema);
    assert.equal(tool.descriptor.readOnly, row.annotations.readOnlyHint === true);
  }
  assert.deepEqual(h.tools.map((tool) => tool.descriptor.id), [
    ...shared.map((row) => `desktop.${row.name}`),
    "desktop.navigate",
    "site.list_tools",
    "site.call_tool",
  ]);
});

test("every tool is the local operator's own: the policy allows any call", () => {
  const h = harness();
  for (const tool of h.tools) {
    assert.equal(tool.policy.authorize({ principal: { id: "operator" }, run: { id: "r" }, tool: tool.descriptor, input: {} }), "allow");
  }
});

test("a shared desktop verb runs the real table and returns its text with the structured payload", async () => {
  const h = harness();
  const site = path.join(tempDir(), "alpha");
  trackSite(h.projectsPath, site, SITE_ORIGIN.adopted);
  const listed = await h.tool("desktop.list_sites").handler(call("r1", undefined)) as { text: string; structured: { count: number }; isError: boolean };
  assert.equal(listed.isError, false);
  assert.equal(listed.structured.count, 1);
  assert.equal(listed.text, `alpha — ${site} (folder missing)`);
});

test("a shared desktop verb's refusal stays a result the model can read, flagged isError", async () => {
  const h = harness();
  const refused = await h.tool("desktop.reveal_site_folder").handler(call("r1", { siteDir: "/not/tracked" })) as { text: string; isError: boolean };
  assert.equal(refused.isError, true);
  assert.ok(refused.text.length > 0);
});

test("desktop.navigate switches to a known section and refuses anything else without navigating", async () => {
  const h = harness();
  const navigate = h.tool("desktop.navigate");
  assert.deepEqual(navigate.descriptor.inputSchema, {
    type: "object", properties: { section: { type: "string", enum: [...NAVIGABLE_SECTIONS] } }, required: ["section"], additionalProperties: false,
  });
  assert.deepEqual(await navigate.handler(call("r1", { section: "marketplace" })), { text: "Switched to marketplace." });
  assert.deepEqual(h.navigated, ["marketplace"]);
  for (const input of [{ section: "billing" }, { section: 7 }, null]) {
    const refused = await navigate.handler(call("r1", input)) as { text: string; isError: boolean };
    assert.equal(refused.isError, true);
    assert.match(refused.text, /^Unknown section .*\. Use one of: projects, marketplace\.$/);
  }
  assert.deepEqual(h.navigated, ["marketplace"], "a refused section never moves the shell");
});

test("site.* on a turn that started with no site on screen refuses, and never reaches a gateway", async () => {
  const h = harness();
  for (const id of ["site.list_tools", "site.call_tool"]) {
    const refused = await h.tool(id).handler(call("no-site", { toolId: "content.read" })) as { text: string; isError: boolean };
    assert.equal(refused.isError, true);
    assert.match(refused.text, /^No website was open on screen when this turn started/);
  }
  assert.deepEqual(h.gatewayCalls, []);
});

test("site.list_tools lists only the run's own site, captured at turn start", async () => {
  const h = harness();
  h.addressees.set("run-a", { siteDir: "/sites/a", name: "Site A" });
  h.addressees.set("run-b", { siteDir: "/sites/b", name: "Site B" });
  assert.deepEqual(await h.tool("site.list_tools").handler(call("run-a", {})), { site: "Site A", tools: [{ id: "content.read", description: "Read content" }] });
  assert.deepEqual(h.gatewayCalls, [{ list: "/sites/a" }]);
});

test("site.call_tool runs the tool on the run's own site and returns its output", async () => {
  const h = harness();
  h.addressees.set("run-a", { siteDir: "/sites/a", name: "Site A" });
  assert.deepEqual(await h.tool("site.call_tool").handler(call("run-a", { toolId: "content.read", input: { slug: "home" } })), { echoed: { slug: "home" } });
  // An omitted tool input is sent as an empty object, never undefined.
  assert.deepEqual(await h.tool("site.call_tool").handler(call("run-a", { toolId: "content.read" })), { echoed: {} });
  assert.deepEqual(h.gatewayCalls, [
    { call: { siteDir: "/sites/a", toolId: "content.read", input: { slug: "home" } } },
    { call: { siteDir: "/sites/a", toolId: "content.read", input: {} } },
  ]);
});

test("site.call_tool refuses a missing or empty toolId before reaching the site", async () => {
  const h = harness();
  h.addressees.set("run-a", { siteDir: "/sites/a", name: "Site A" });
  for (const input of [{}, { toolId: "" }, { toolId: 3 }, null]) {
    assert.deepEqual(await h.tool("site.call_tool").handler(call("run-a", input)), { text: "toolId is required — take one from site.list_tools.", isError: true });
  }
  assert.deepEqual(h.gatewayCalls, []);
});

test("an unreachable site degrades to a named, readable refusal on both site tools", async () => {
  const h = harness({ siteTools: UNBUILT_SITE_TOOL_GATEWAY });
  h.addressees.set("run-a", { siteDir: "/sites/a", name: "Site A" });
  const listed = await h.tool("site.list_tools").handler(call("run-a", {})) as { text: string; isError: boolean };
  assert.deepEqual(listed, {
    text: "Site A's tools are unavailable this turn: this website does not expose its tools to the desktop chat yet (the site's inbound tool route is not built).",
    isError: true,
  });
  const called = await h.tool("site.call_tool").handler(call("run-a", { toolId: "content.read" })) as { text: string; isError: boolean };
  assert.deepEqual(called, {
    text: "content.read failed on Site A: this website does not expose its tools to the desktop chat yet (the site's inbound tool route is not built).",
    isError: true,
  });
});
