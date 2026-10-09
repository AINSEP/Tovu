/** The `web` domain's wiring: catalog -> registration, the handler's own permission gate, and the
 *  contributor shape the composition root installs. Fakes are DI ports; no module mocks. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import type { HttpRequest } from "#src/platform/http/index";
import { WEB_READ_PERMISSION, webAgentToolCatalog } from "../agent-tools.js";
import { buildWebRegistrations, contributeWebTools, webDerivedRisk } from "../tool-registrations.js";
import type { WebFetchPorts } from "../web-page.js";

const ctx = (input: unknown, principalId = "admin-1"): ToolExecutionContext => ({
  executionId: "exec-web", principal: { id: principalId } as ToolExecutionContext["principal"], run: { id: "run-1" } as ToolExecutionContext["run"],
  input, signal: new AbortController().signal,
});

function ports(sent: HttpRequest[]): WebFetchPorts {
  return {
    httpClient: { send: async request => { sent.push(request); return { status: 200, headers: { "content-type": "text/plain" }, bodyText: "hello", finalUrl: request.url }; } },
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
