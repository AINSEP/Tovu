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
 * `SANDBOX_PROXY_HTML` constant this route re-serves.
 *
 * `AssistantDock.tsx` USED TO name this route's path directly (`new URL("/mcp-ui/sandbox-proxy.html",
 * globalThis.location.origin)`), and an earlier version of this file pinned that hardcode by reading
 * `AssistantDock.tsx` off disk. The 2026-09-03 admin-origin-authority fix moved the admin dock onto
 * `buildAssistantMcpUiSandboxProxyUrl` (a `data:` URL) instead — see this route's own module doc's
 * "Superseded" section — so that pinning no longer applies to this route at all. The test below
 * replaces it: it pins that `AssistantDock.tsx` does NOT reintroduce the same-origin hardcode, reading
 * `AssistantDock.tsx` off disk for the same reason the old pinning did (no shared module either side
 * can import a literal from).
 */

/** The one place a same-origin hardcode of this route's path would reappear if the admin dock's fix
 *  ever regressed; there is no module `apps/website` can import from `apps/admin` to check this via
 *  types instead. */
const ASSISTANT_DOCK_PATH = fileURLToPath(
  new URL("../../../../../apps/admin/src/components/AssistantDock/AssistantDock.tsx", import.meta.url),
);

function buildApp(): express.Express {
  const app = express();
  registerMcpUiSandboxProxyRoute(app);
  return app;
}

test("MCP_UI_SANDBOX_PROXY_PATH is unchanged", () => {
  assert.equal(MCP_UI_SANDBOX_PROXY_PATH, "/mcp-ui/sandbox-proxy.html");
});

test("AssistantDock.tsx no longer builds its iframe URL as a same-origin route — the admin-origin-authority fix", () => {
  const dockSource = readFileSync(ASSISTANT_DOCK_PATH, "utf8");

  assert.ok(
    !/new URL\("([^"]+)", globalThis\.location\.origin\)/.test(dockSource),
    "AssistantDock.tsx has reintroduced a same-origin sandboxProxyUrl hardcode — this is exactly the " +
      "admin-origin-authority gap the 2026-09-03 fix closed (see mcp-ui-sandbox-proxy-route.ts's " +
      "module doc's Superseded section); it must build sandboxProxyUrl via " +
      "buildAssistantMcpUiSandboxProxyUrl (a data: URL) instead",
  );
  assert.ok(
    dockSource.includes("buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin)"),
    "AssistantDock.tsx must build sandboxProxyUrl via buildAssistantMcpUiSandboxProxyUrl",
  );
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
