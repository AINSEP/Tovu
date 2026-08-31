import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import express from "express";

import { SANDBOX_PROXY_HTML } from "@jini-ai/ui/mcp-ui/surfaces";

import { startTestServer } from "../../server/__tests__/helpers/http-test-server.js";
import { MCP_UI_SANDBOX_PROXY_PATH, registerMcpUiSandboxProxyRoute } from "../mcp-ui-sandbox-proxy-route.js";

/**
 * @file Route-level tests for the MCP-UI sandbox proxy page (`mcp-ui-sandbox-proxy-route.ts`).
 *
 * Every MCP-UI surface (`assistant_ask_choice`'s form included) failed to render because nothing
 * served this page — `@mcp-ui/client`'s `AppFrame` points an iframe at it and times out after 10s
 * with no response. These tests pin the route's contract directly against the byte-identical
 * `SANDBOX_PROXY_HTML` constant this route re-serves, and pin `MCP_UI_SANDBOX_PROXY_PATH` to the
 * literal `AssistantDock.tsx` hardcodes — see this route's own module doc for why that pairing has
 * no shared module to drift-proof it otherwise.
 *
 * That pinning reads `AssistantDock.tsx` off disk on purpose. An earlier version of this file
 * claimed to pin the two copies together while actually comparing the constant against a THIRD
 * hand-typed copy of the same string inside the test — which would have stayed green through any
 * edit to the real hardcode in `apps/admin`, i.e. through the exact silent drift the test exists to
 * catch. Reading the file is the only version of this assertion that is true.
 */

/** The one place `apps/admin` names this route's path; there is no module `apps/website` can import
 *  it from, so this test reads it out of the source. */
const ASSISTANT_DOCK_PATH = fileURLToPath(
  new URL("../../../../../apps/admin/src/components/AssistantDock/AssistantDock.tsx", import.meta.url),
);

function buildApp(): express.Express {
  const app = express();
  registerMcpUiSandboxProxyRoute(app);
  return app;
}

test("MCP_UI_SANDBOX_PROXY_PATH matches the literal apps/admin/.../AssistantDock.tsx hardcodes", () => {
  const dockSource = readFileSync(ASSISTANT_DOCK_PATH, "utf8");

  const hardcoded = /new URL\("([^"]+)", globalThis\.location\.origin\)/.exec(dockSource);

  assert.notEqual(
    hardcoded,
    null,
    `AssistantDock.tsx no longer builds sandboxProxyUrl as new URL("<path>", globalThis.location.origin) — ` +
      "this pinning cannot see the hardcode any more and must be rewritten, not deleted",
  );
  assert.equal(hardcoded?.[1], MCP_UI_SANDBOX_PROXY_PATH);
  assert.equal(MCP_UI_SANDBOX_PROXY_PATH, "/mcp-ui/sandbox-proxy.html");
});

test("GET returns 200, html content-type, and the exact SANDBOX_PROXY_HTML body", async (t) => {
  const baseUrl = await startTestServer(buildApp(), t);

  const res = await fetch(`${baseUrl}${MCP_UI_SANDBOX_PROXY_PATH}`);
  const body = await res.text();

  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /html/);
  assert.equal(body, SANDBOX_PROXY_HTML, "must be byte-identical to the constant, not a hand-copied substring");
});

test("GET is reachable with no principal header or session cookie at all", async (t) => {
  const baseUrl = await startTestServer(buildApp(), t);

  const res = await fetch(`${baseUrl}${MCP_UI_SANDBOX_PROXY_PATH}`);

  assert.equal(res.status, 200, "the iframe navigates here before any handshake exists");
});

test("GET carries the exact framing-protection headers", async (t) => {
  const baseUrl = await startTestServer(buildApp(), t);

  const res = await fetch(`${baseUrl}${MCP_UI_SANDBOX_PROXY_PATH}`);
  await res.text();

  assert.equal(
    res.headers.get("content-security-policy"),
    "frame-ancestors 'self'",
    "must be the exact policy: 'self' permits the admin app's own iframe, DENY/'none' would break it",
  );
  assert.equal(
    res.headers.get("x-frame-options"),
    "SAMEORIGIN",
    "defence in depth for browsers predating frame-ancestors; DENY would break the same-origin iframe",
  );
});

test("the served body only accepts sandbox-resource-ready from its own host window", async (t) => {
  const baseUrl = await startTestServer(buildApp(), t);

  const body = await (await fetch(`${baseUrl}${MCP_UI_SANDBOX_PROXY_PATH}`)).text();

  assert.ok(
    body.includes("return event.source === host && event.origin === hostOrigin;"),
    "the installed @jini-ai/ui dist is stale — it serves a proxy page that document.write()s HTML from any origin",
  );
  assert.ok(
    !body.includes(`params: {} }, "*")`),
    "the ready notification must be addressed to the host origin, never broadcast to any framer",
  );
});
