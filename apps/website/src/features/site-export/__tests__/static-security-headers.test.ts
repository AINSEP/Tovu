import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createPublicPageSecurityHeaders } from "#src/server/inbound/public-http/middleware/public-page-security-headers";

import { renderHeadersFile, withSecurityMeta } from "../static-security-headers.js";

/**
 * @file A static export carries the SAME security headers the live server sends. Every expectation
 * below is read off a real live response (or a custom set run through both sides), never retyped,
 * so a header added to or changed on one side without the other fails here.
 */

process.env.TOVU_THEME_RENDER_TIMEOUT_MS ??= "60000";

/** Every header the live public-page middleware sends today; a new one must be carried too. */
const LIVE_HEADER_NAMES = ["x-content-type-options", "referrer-policy", "content-security-policy-report-only"];

/** `/*` then two-space-indented `Name: value` lines — the Netlify/Cloudflare Pages `_headers` shape. */
function parseHeadersFile(text: string): Record<string, string> {
  const [pattern, ...lines] = text.trimEnd().split("\n");
  assert.equal(pattern, "/*", "the rule must cover every path");
  const out: Record<string, string> = {};
  for (const line of lines) {
    const match = /^ {2}([^:]+): (.*)$/.exec(line);
    assert.ok(match, `malformed _headers line: ${JSON.stringify(line)}`);
    out[match[1]!.toLowerCase()] = match[2]!;
  }
  return out;
}

async function liveHeaders(res: Response, names: readonly string[]): Promise<Record<string, string>> {
  await res.text();
  return Object.fromEntries(names.map((name) => [name, res.headers.get(name) ?? ""]));
}

test("the static header files carry exactly what the live server sends on a public page", async (t) => {
  const deps = createRouteDeps();
  await deps.seoReady;
  const baseUrl = await startTestServer(createApp(deps), t);
  const live = await liveHeaders(await fetch(`${baseUrl}/`), LIVE_HEADER_NAMES);
  for (const name of LIVE_HEADER_NAMES) assert.notEqual(live[name], "", `live server must send ${name}`);

  assert.deepEqual(parseHeadersFile(renderHeadersFile()), live);
  assert.equal(
    withSecurityMeta("<!doctype html><html><head><title>x</title></head><body></body></html>"),
    `<!doctype html><html><head><meta name="referrer" content="${live["referrer-policy"]}"><title>x</title></head><body></body></html>`
  );
});

test("changing the shared header set changes the live response and every static carrier alike", async (t) => {
  const custom = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Test-Header": "a \"quoted\" value" };
  const app = express();
  app.use(createPublicPageSecurityHeaders(custom));
  app.get("/", (_req, res) => {
    res.send("ok");
  });
  const baseUrl = await startTestServer(app, t);
  const names = Object.keys(custom).map((name) => name.toLowerCase());
  const live = await liveHeaders(await fetch(`${baseUrl}/`), names);

  assert.deepEqual(live, { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-test-header": "a \"quoted\" value" });
  assert.deepEqual(parseHeadersFile(renderHeadersFile(custom)), live);
  assert.match(withSecurityMeta("<head></head>", custom), /^<head><meta name="referrer" content="no-referrer"><\/head>$/);
});

test("withSecurityMeta: leaves HTML with no <head> or a set with no Referrer-Policy untouched, and escapes the value", () => {
  assert.equal(withSecurityMeta("<p>fragment</p>"), "<p>fragment</p>");
  assert.equal(withSecurityMeta("<head></head>", { "X-Content-Type-Options": "nosniff" }), "<head></head>");
  assert.equal(withSecurityMeta(`<HEAD lang="en"></HEAD>`, { "Referrer-Policy": `a"b` }), `<HEAD lang="en"><meta name="referrer" content="a&quot;b"></HEAD>`);
  // `<header>` is not `<head>`: only the real head element gets the tag.
  assert.equal(withSecurityMeta("<header></header>"), "<header></header>");
});
