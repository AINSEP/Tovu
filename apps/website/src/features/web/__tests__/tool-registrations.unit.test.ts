/** The `web` domain's wiring: catalog -> registration, the handler's own permission gate, and the
 *  contributor shape the composition root installs. Fakes are DI ports; no module mocks. */
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { withBatchInput, BATCH_TOOL_SETTINGS } from "../../../assistant/batch-tool-inputs.js";
import { invokeRegisteredTool } from "../../../assistant/__tests__/fixtures/execute-registered-tool.js";
import type { ToolExecutionContext } from "@jini-ai/core";
import type { HttpRequest } from "#src/platform/http/index";
import { WEB_READ_PERMISSION, webAgentToolCatalog } from "../agent-tools.js";
import { buildWebRegistrations, contributeWebTools, webDerivedRisk } from "../tool-registrations.js";
import type { WebFetchPorts } from "../web-page.js";

test("the contributor uses its supplied clock, observer and workspace-host limiter", async () => {
  const sent: HttpRequest[] = [];
  const keys: string[] = [];
  const observed: unknown[] = [];
  const contributor = contributeWebTools({ httpClient: ports(sent).httpClient, htmlToMarkdown: () => "" }, {
    nowMs: () => Date.parse("2026-10-08T00:00:00.000Z"),
    observeFetch: event => observed.push(event),
    rateLimiter: { check: async ({ key }) => {
      keys.push(key);
      return keys.length === 1 ? { allowed: true } : { allowed: false, retryAfterSeconds: 7 };
    } },
  });
  const [registration] = contributor.build({ workspaceId: "custom-ws", authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as Parameters<typeof contributor.build>[0], {} as Parameters<typeof contributor.build>[1]);
  const result = await registration!.handler(ctx({ url: "https://a.example/" })) as Record<string, unknown>;
  assert.deepEqual([result.content, result.fetchedAt], ["hello", "2026-10-08T00:00:00.000Z"]);
  await assert.rejects(registration!.handler(ctx({ url: "https://a.example/" })), { message: "web_fetch_page: too many fetches from a.example in the last minute. Retry in 7 seconds." });
  assert.deepEqual(keys, ["custom-ws|a.example", "custom-ws|a.example"]);
  assert.equal(sent.length, 1);
  assert.deepEqual(observed, [
    { origin: "https://a.example", durationMs: 0, outcome: "response", status: 200 },
    { origin: "https://a.example", durationMs: 0, outcome: "rate-limited" },
  ]);
});

test("the contributor defaults to system time and structured fetch logging", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-08T00:00:00.000Z") });
  const logs: string[] = [];
  t.mock.method(console, "info", (message: string) => logs.push(message));
  const contributor = contributeWebTools({ httpClient: ports([]).httpClient, htmlToMarkdown: () => "" });
  const [registration] = contributor.build({ workspaceId: "defaults-ws", authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as Parameters<typeof contributor.build>[0], {} as Parameters<typeof contributor.build>[1]);
  const result = await registration!.handler(ctx({ url: "https://a.example/" })) as Record<string, unknown>;
  assert.equal(result.fetchedAt, "2026-10-08T00:00:00.000Z");
  assert.deepEqual(logs.map(line => JSON.parse(line)), [{
    timestamp: "2026-10-08T00:00:00.000Z", level: "info", service: "web", message: "web_fetch_page",
    context: { origin: "https://a.example", durationMs: 0, outcome: "response", status: 200 },
  }]);
});

const ctx = (input: unknown, principalId = "admin-1"): ToolExecutionContext => ({
  executionId: "exec-web", principal: { id: principalId } as ToolExecutionContext["principal"], run: { id: "run-1" } as ToolExecutionContext["run"],
  input, signal: new AbortController().signal,
});

function ports(sent: HttpRequest[], bodyText = "hello"): WebFetchPorts {
  return {
    httpClient: { send: async request => { sent.push(request); return { status: 200, headers: { "content-type": "text/plain" }, bodyText, finalUrl: request.url }; } },
    htmlToMarkdown: () => { throw new Error("not reached for text/plain"); },
    nowMs: () => Date.parse("2026-10-08T00:00:00.000Z"),
  };
}

test("web_fetch_page is wired read-only from its catalog entry, with the catalog's schema", () => {
  const [registration, ...rest] = buildWebRegistrations({ workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports([]));
  assert.deepEqual(rest, []);
  assert.equal(registration!.descriptor.id, "web_fetch_page");
  assert.deepEqual(registration!.descriptor.inputSchema, webAgentToolCatalog[0]!.inputSchema);
  assert.equal(webAgentToolCatalog[0]!.sideEffects, "none");
  assert.deepEqual([...webDerivedRisk], [["web_fetch_page", "none"]]);
});

test("the handler checks admin.assistant.use for the calling principal before any network call", async () => {
  const sent: HttpRequest[] = [];
  const asked: unknown[] = [];
  const [registration] = buildWebRegistrations({ workspaceId: "ws-1", authorize: async request => { asked.push(request); return { allowed: false, reason: "no grant" }; } }, ports(sent));
  await assert.rejects(registration!.handler(ctx({ url: "https://a.example/" }, "visitor-9")), { message: `principal 'visitor-9' is not authorized for '${WEB_READ_PERMISSION}' (no grant)` });
  assert.deepEqual(sent, []);
  assert.deepEqual(asked, [{ principalId: "visitor-9", permission: "admin.assistant.use", workspaceId: "ws-1", entityType: "web-page" }]);
});

test("an authorized call fetches and returns the untrusted page projection", async () => {
  const sent: HttpRequest[] = [];
  const [registration] = buildWebRegistrations({ workspaceId: "ws-1", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports(sent));
  const result = await registration!.handler(ctx({ url: "https://a.example/robots.txt", format: "raw" })) as Record<string, unknown>;
  assert.deepEqual([result.content, result.finalUrl, result.untrusted, sent.length], ["hello", "https://a.example/robots.txt", true, 1]);
});

test("malformed input is refused before the permission check or the network", async () => {
  const sent: HttpRequest[] = [];
  let asked = 0;
  const [registration] = buildWebRegistrations({ workspaceId: "ws-1", authorize: async () => { asked++; return { allowed: true, reason: "matched" }; } }, ports(sent));
  await assert.rejects(registration!.handler(ctx({ url: "https://a.example/", format: "pdf" })), { message: "web_fetch_page: format must be one of markdown, text, html, raw." });
  assert.deepEqual([asked, sent.length], [0, 0]);
});

test("contributeWebTools contributes the 'web' domain with its risk map and a default per-host limiter", async () => {
  const sent: HttpRequest[] = [];
  const contributor = contributeWebTools({ httpClient: ports(sent).httpClient, htmlToMarkdown: () => "" }, { observeFetch: () => {} });
  assert.equal(contributor.domain, "web");
  assert.equal(contributor.risk, webDerivedRisk);
  const [registration] = contributor.build({ workspaceId: "ws-2", authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as Parameters<typeof contributor.build>[0], {} as Parameters<typeof contributor.build>[1]);
  for (let i = 0; i < 30; i++) await registration!.handler(ctx({ url: "https://a.example/" }));
  await assert.rejects(registration!.handler(ctx({ url: "https://a.example/" })), { message: /^web_fetch_page: too many fetches from a\.example in the last minute\. Retry in \d+ seconds\.$/ });
  assert.equal(sent.length, 30);
});

test("render schema publishes browser options on the existing tool; screenshot returns image with text", async () => {
  const properties = webAgentToolCatalog[0]!.inputSchema!.properties as Record<string, unknown>;
  for (const key of ["render", "waitFor", "dismissCookieBanners", "captureData", "screenshot"]) assert.ok(properties[key]);
  const sent: HttpRequest[] = [];
  const fake = ports(sent);
  const renderedInputs: unknown[] = [];
  fake.htmlToMarkdown = () => "Live content";
  fake.renderPage = async ({ input }) => {
    renderedInputs.push(input);
    return { finalUrl: input.url, status: 200, title: "Live", html: "<p>Live content</p>", text: "Live content", images: [], imagesTruncated: false, truncated: false, data: [], dataTruncated: false, screenshot: { mimeType: "image/jpeg", data: "cG5n" } };
  };
  const contributor = contributeWebTools({ httpClient: fake.httpClient, htmlToMarkdown: fake.htmlToMarkdown, renderPage: fake.renderPage }, { observeFetch: () => {} });
  const [registration] = contributor.build({ workspaceId: "ws-render", authorize: async () => ({ allowed: true, reason: "matched" }) } as unknown as Parameters<typeof contributor.build>[0], {} as Parameters<typeof contributor.build>[1]);
  const result = await registration!.handler(ctx({ url: "https://a.example/", render: true, waitFor: "#content", screenshot: true })) as { content: Array<{ type: string; text?: string; mimeType?: string; data?: string }> };
  assert.equal(result.content[0]!.type, "text");
  const facts = JSON.parse(result.content[0]!.text!);
  assert.deepEqual([facts.content, facts.rendered, facts.untrusted], ["Live content", true, true]);
  assert.equal(facts.screenshot, undefined, "image bytes must not be repeated in JSON");
  assert.deepEqual(result.content[1], { type: "image", mimeType: "image/jpeg", data: "cG5n" });
  assert.equal(renderedInputs.length, 1); assert.deepEqual(sent, []);
});


test("the existing batch wrapper carries shared render options and per-item overrides without a mirrored schema", async () => {
  const fake = ports([]); const inputs: Array<Record<string, unknown>> = [];
  fake.htmlToMarkdown = () => "Live";
  fake.renderPage = async ({ input }) => {
    inputs.push({ ...input });
    return { finalUrl: input.url, status: 200, title: "Live", html: "<p>Live</p>", text: "Live", images: [], imagesTruncated: false, truncated: false, data: [], dataTruncated: false };
  };
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, fake);
  const wrapped = withBatchInput({ registration: registration!, tool: BATCH_TOOL_SETTINGS.find(tool => tool.toolId === "web_fetch_page")! });
  const schema = wrapped.descriptor.inputSchema as { properties: Record<string, unknown> };
  assert.deepEqual(schema.properties.render, { type: "boolean", description: (webAgentToolCatalog[0]!.inputSchema!.properties as Record<string, { description: string }>).render!.description });
  // 13138e356 routes merged batch items through the real executor, including its gates.
  await invokeRegisteredTool(wrapped, ctx({ render: true, waitFor: 1, captureData: true, items: [{ url: "https://a.example/" }, { url: "https://b.example/", waitFor: "#ready", captureData: false }] }));
  assert.deepEqual(inputs.map(input => [input.url, input.render, input.waitFor, input.captureData, input.maxChars]), [
    ["https://a.example/", true, 1, true, 8000], ["https://b.example/", true, "#ready", false, 8000],
  ]);
});

test("render filtering schema and guidance flow through single and batch registrations", async () => {
  const fake = ports([]);
  fake.htmlToMarkdown = () => { throw new Error("data-only calls should skip Markdown conversion"); };
  fake.renderPage = async ({ input }) => ({ finalUrl: input.url, status: 200, title: "Live", html: "<p>Visible content</p>", text: "Visible content", images: [], imagesTruncated: false, truncated: false,
    data: [{ url: "https://cms.example/rows", status: 200, body: '{"rows":[]}', truncated: false }], dataTruncated: false,
    dataUnmatched: [{ url: "https://noise.example/data", status: 201, size: 20000 }],
  });
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, fake);
  const properties = (registration!.descriptor.inputSchema as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(properties.textMode, { type: "string", enum: ["full", "none", "summary"], description: (webAgentToolCatalog[0]!.inputSchema!.properties as Record<string, { description: string }>).textMode!.description });
  assert.ok(properties.captureDataMatch);
  assert.match(registration!.descriptor.description!, /first call without a filter/i);
  assert.match(registration!.descriptor.description!, /batch.*captureDataMatch/i);
  const result = await registration!.handler(ctx({ url: "https://a.example/", render: true, captureDataMatch: "/rows", textMode: "none" })) as Record<string, unknown>;
  assert.equal(result.content, "");
  assert.deepEqual(result.dataUnmatched, [{ url: "https://noise.example/data", status: 201, size: 20000 }]);
  const wrapped = withBatchInput({ registration: registration!, tool: BATCH_TOOL_SETTINGS.find(tool => tool.toolId === "web_fetch_page")! });
  const schema = wrapped.descriptor.inputSchema as { properties: Record<string, unknown> };
  assert.deepEqual(schema.properties.captureDataMatch, properties.captureDataMatch); assert.deepEqual(schema.properties.textMode, properties.textMode);
});

test("batch render filters inherit shared fields and let each item override filtering and textMode", async () => {
  const fake = ports([]);
  fake.htmlToMarkdown = () => { throw new Error("filtered data-only and summary calls should skip Markdown conversion"); };
  const inputs: Array<Record<string, unknown>> = [];
  fake.renderPage = async ({ input }) => {
    inputs.push({ ...input });
    return { finalUrl: input.url, status: 200, title: "Live", html: "<p>Live</p>", text: "Live summary", images: [], imagesTruncated: false, truncated: false, data: [], dataTruncated: false };
  };
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, fake);
  const wrapped = withBatchInput({ registration: registration!, tool: BATCH_TOOL_SETTINGS.find(tool => tool.toolId === "web_fetch_page")! });
  const result = await invokeRegisteredTool(wrapped, ctx({ render: true, captureDataMatch: "/rows", textMode: "none", items: [
    { url: "https://a.example/" }, { url: "https://b.example/", captureDataMatch: ["*/records*"], textMode: "summary" },
  ] })) as { succeeded: number; results: Array<{ result: { content: string } }> };
  assert.equal(result.succeeded, 2);
  assert.deepEqual(inputs.map(input => [input.captureDataMatch, input.textMode, input.maxChars]), [["/rows", "none", 8000], [["*/records*"], "summary", 8000]]);
  assert.deepEqual(result.results.map(item => item.result.content), ["", "Live summary"]);
});


test("find returns literal case-insensitive snippets and offsets beyond the default content window", async () => {
  const body = 'x'.repeat(25_000) + ' N.e ' + 'z'.repeat(400) + ' n.E tail';
  const sent: HttpRequest[] = [];
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports(sent, body));
  const result = await registration!.handler(ctx({ url: "https://a.example/", find: "n.e" })) as Record<string, unknown>;
  const offsets = [25_001, body.lastIndexOf('n.E')];
  assert.deepEqual(result.matches, offsets.map(offset => ({ offset, snippet: body.slice(offset - 160, offset + 3 + 160) })));
  assert.equal(result.matchCount, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.bodyBytes, Buffer.byteLength(body));
  assert.equal('content' in result, false);
  assert.equal('body' in result, false);
  assert.deepEqual([result.finalUrl, result.untrusted, sent.length], ["https://a.example/", true, 1]);
  const properties = (registration!.descriptor.inputSchema as { properties: Record<string, unknown> }).properties;
  assert.deepEqual(properties.find, { type: "string", minLength: 1, maxLength: 200, description: (properties.find as { description: string }).description });
  assert.match(registration!.descriptor.description!, /use find for large pages/i);
});

test("find validates the shared contract before authorization or network access", async () => {
  const sent: HttpRequest[] = [];
  let authorized = 0;
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => { authorized++; return { allowed: true, reason: "matched" }; } }, ports(sent));
  for (const find of ['', 'a'.repeat(201), 42, null]) {
    await assert.rejects(registration!.handler(ctx({ url: "https://a.example/", find })), { message: "find must be a string of 1..200 characters." });
  }
  assert.equal(authorized, 0);
  assert.deepEqual(sent, []);
});

test("find reports no matches without returning full content", async () => {
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports([], "hello"));
  const result = await registration!.handler(ctx({ url: "https://a.example/", find: "absent" })) as Record<string, unknown>;
  assert.deepEqual([result.matches, result.matchCount, result.truncated], [[], 0, false]);
  assert.equal('content' in result, false);
});

test("find counts all matches while bounding snippets by count and the explicit output budget", async () => {
  const body = 'Needle '.repeat(25);
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports([], body));
  const result = await registration!.handler(ctx({ url: "https://a.example/", find: "needle" })) as { matches: unknown[]; matchCount: number; truncated: boolean };
  assert.equal(result.matches.length, 20);
  assert.equal(result.matchCount, 25);
  assert.equal(result.truncated, true);
  const capped = await registration!.handler(ctx({ url: "https://a.example/", find: "needle", maxChars: 5 })) as Record<string, unknown>;
  assert.deepEqual([capped.matches, capped.matchCount, capped.truncated], [[{ offset: 0, snippet: 'Needl' }], 25, true]);
});

test("find retains truncation when the reader cannot capture the whole page", async () => {
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports([], 'Needle ' + 'x'.repeat(210_000)));
  const result = await registration!.handler(ctx({ url: "https://a.example/", find: "needle" })) as Record<string, unknown>;
  assert.equal(result.matchCount, 1);
  assert.equal(result.truncated, true);
  assert.equal('content' in result, false);
});

test("single default truncates at 20000 characters while batch items retain 8000 and explicit overrides", async () => {
  const body = 'x'.repeat(30_000);
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, ports([], body));
  const result = await registration!.handler(ctx({ url: "https://a.example/" })) as Record<string, unknown>;
  assert.deepEqual([result.content, result.truncated], [body.slice(0, 20_000), true]);
  const tool = BATCH_TOOL_SETTINGS.find(tool => tool.toolId === "web_fetch_page")!;
  assert.deepEqual(tool.itemDefaults, { maxChars: 8_000 });
  const wrapped = withBatchInput({ registration: registration!, tool });
  const batch = await invokeRegisteredTool(wrapped, ctx({ items: [{ url: "https://a.example/" }, { url: "https://b.example/", maxChars: 25_000 }] })) as { results: Array<{ result: { content: string; truncated: boolean } }> };
  assert.deepEqual(batch.results.map(item => [item.result.content.length, item.result.truncated]), [[8_000, true], [25_000, true]]);
});

test("rendered find keeps snippets in screenshot text without repeating page content or image bytes", async () => {
  const fake = ports([]);
  fake.htmlToMarkdown = () => "Live Needle";
  fake.renderPage = async ({ input }) => ({ finalUrl: input.url, status: 200, title: "Live", html: "<p>Live Needle</p>", text: "Live Needle", images: [], imagesTruncated: false, truncated: false, data: [], dataTruncated: false, screenshot: { mimeType: "image/jpeg", data: "cG5n" } });
  const [registration] = buildWebRegistrations({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "matched" }) }, fake);
  const result = await registration!.handler(ctx({ url: "https://a.example/", render: true, find: "needle", screenshot: true })) as { content: Array<{ type: string; text?: string; mimeType?: string; data?: string }> };
  const facts = JSON.parse(result.content[0]!.text!);
  assert.deepEqual([facts.matches, facts.matchCount, facts.rendered, facts.untrusted], [[{ offset: 5, snippet: "Live Needle" }], 1, true, true]);
  assert.equal('content' in facts, false);
  assert.equal('screenshot' in facts, false);
  assert.deepEqual(result.content[1], { type: "image", mimeType: "image/jpeg", data: "cG5n" });
});
