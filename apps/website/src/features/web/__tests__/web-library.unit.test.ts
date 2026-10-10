/** 0.1.14: the host converter and reader consume library Markdown through the existing DI port. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { htmlToMarkdown } from "../html-to-markdown.js";
import { fetchWebPage, readWebFetchInput, WEB_FETCH_USER_AGENT, type WebFetchPorts } from "../web-page.js";
import type { HttpRequest } from "#src/platform/http/index";

const html = readFileSync(new URL("./fixtures/library-page.html", import.meta.url), "utf8");
const pageUrl = "https://docs.example/setup";
const expected = "# Setup\n\nUse ``a`b`` safely.\n\n| Key | Value |\n| - | - |\n| **alpha** | `a\\|b` |";

test("real document retains code delimiters and formatted table cells as library Markdown", () => {
  assert.equal(htmlToMarkdown({ html, pageUrl }), expected);
});

test("the host adapter preserves request identity and clips the library result after projection", async () => {
  const sent: HttpRequest[] = [];
  const ports: WebFetchPorts = {
    httpClient: { send: async request => { sent.push(request); return { status: 200, headers: { "content-type": "text/html" }, bodyText: html }; } },
    htmlToMarkdown, nowMs: () => Date.parse("2026-10-08T12:00:00Z"),
  };
  const result = await fetchWebPage({ input: readWebFetchInput({ url: pageUrl, maxChars: 20 }), ports, rateLimitScope: "workspace" });
  assert.equal(result.content, "# Setup\n\nUse ``a`b``");
  assert.equal(result.truncated, true);
  assert.equal(result.title, "Setup | Developer docs");
  assert.equal(result.lang, "en");
  assert.deepEqual(sent.map(request => [request.method, request.headers["User-Agent"], request.body, request.maxResponseBytes]), [["GET", WEB_FETCH_USER_AGENT, undefined, 5 * 1024 * 1024]]);
});
