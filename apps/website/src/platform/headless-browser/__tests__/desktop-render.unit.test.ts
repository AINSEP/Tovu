import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";

import { desktopRenderForHost } from "../desktop-render.js";

/**
 * @file The launcher binding for the desktop capture channel: absent env means no capability at
 * all, and the real Jini transport is only loaded (and validated) on the first capture.
 */

const request = { url: "https://example.test/", viewport: { width: 1200, height: 800 }, fullPage: false, maxPageHeightPx: 4000, settleMs: 0 };

/** A loopback port that was just released, so a POST to it is refused. */
async function closedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test("no desktop capture capability when neither channel variable is inherited", () => {
  assert.equal(desktopRenderForHost({ env: {} }), null);
  assert.equal(desktopRenderForHost({ env: { PATH: "/usr/bin" } }), null);
});

test("an invalid inherited channel is accepted at boot and rejected on first capture", async () => {
  const onlyToken = desktopRenderForHost({ env: { JINI_DESKTOP_RENDER_TOKEN: "not-a-token" } });
  assert.ok(onlyToken, "a token alone still binds the lazy transport");
  await assert.rejects(onlyToken.captureUrl(request), { name: "RenderServiceError", code: "load-failed", message: "invalid desktop capture channel" });

  const publicUrl = desktopRenderForHost({ env: { JINI_DESKTOP_RENDER_URL: "https://example.test/capture" } });
  assert.ok(publicUrl, "a URL alone still binds the lazy transport");
  await assert.rejects(publicUrl.captureUrl(request), { name: "RenderServiceError", code: "load-failed" });
});

test("a valid but unreachable private channel reports the native transport as unavailable", async () => {
  const port = await closedLoopbackPort();
  const capture = desktopRenderForHost({ env: {
    JINI_DESKTOP_RENDER_URL: `http://127.0.0.1:${port}/capture`,
    JINI_DESKTOP_RENDER_TOKEN: randomBytes(32).toString("hex"),
  } });
  assert.ok(capture);
  await assert.rejects(capture.captureUrl(request), { name: "RenderServiceError", code: "load-failed", message: "desktop capture channel unavailable" });
});
