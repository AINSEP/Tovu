/** Security review A3-F2: the engine scrubs only the object it is given, and this host gives it a
 * detached copy. The real process environment is scrubbed by startup-secret capture (token, handoff)
 * and by the process runtime's first use (URL). After both, a child of this process inherits none. */
import assert from "node:assert/strict";
import test from "node:test";

const NAMES = ["TOVU_DESKTOP_MCP_URL", "TOVU_DESKTOP_MCP_TOKEN", "TOVU_DESKTOP_MCP_HANDOFF_TOKEN"] as const;
const cap = { url: "http://127.0.0.1:4100/mcp", token: "a".repeat(64) };
const handoff = "b".repeat(64);

test("after startup-secret capture and first use of the process runtime, process.env holds none of the three names", async () => {
  Object.assign(process.env, { TOVU_DESKTOP_MCP_URL: cap.url, TOVU_DESKTOP_MCP_TOKEN: cap.token, TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff });
  const { initializeStartupSecrets } = await import("#src/server/runtime/boot/startup-secrets");
  await initializeStartupSecrets();
  assert.deepEqual(NAMES.filter(name => name in process.env), ["TOVU_DESKTOP_MCP_URL"], "capture removes the two secrets; the URL goes on first use");
  const { desktopMcpRuntime } = await import("../desktop-mcp-runtime.js");
  assert.equal(desktopMcpRuntime.owned, true);
  assert.deepEqual(NAMES.filter(name => name in process.env), []);
  assert.doesNotMatch(JSON.stringify(process.env), /a{64}|b{64}/);
  // The values were captured, not lost: the runtime still serves them through its own two members.
  assert.equal(desktopMcpRuntime.handoffToken, handoff);
  assert.equal(await desktopMcpRuntime.bearerToken({ url: cap.url }), cap.token);
  assert.deepEqual(desktopMcpRuntime.connection({})?.launch, { url: cap.url, headers: {} });
});
