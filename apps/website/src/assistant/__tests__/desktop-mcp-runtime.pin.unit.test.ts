/** Security review A3: the desktop capability runtime rides Jini's pinned-capability runtime. The token
 * leaves it only through the exact-URL bearer supplier, the connection carries the URL alone, and nothing
 * a caller holds can move the pin. */
import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopMcpRuntime } from "../desktop-mcp-runtime.js";

const cap = { url: "http://127.0.0.1:4100/mcp", token: "a".repeat(64) };
const other = { url: "http://127.0.0.1:4999/mcp", token: "e".repeat(64) };
const handoff = "b".repeat(64);

test("the runtime keeps its five members; none but the bearer supplier and the handoff token yields a token", async () => {
  const runtime = createDesktopMcpRuntime({ env: { TOVU_DESKTOP_MCP_URL: cap.url, TOVU_DESKTOP_MCP_TOKEN: cap.token, TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff } });
  assert.deepEqual(Object.keys(runtime).sort(), ["accept", "bearerToken", "connection", "handoffToken", "owned"]);
  assert.equal(runtime.handoffToken, handoff);
  assert.equal(await runtime.bearerToken({ url: cap.url }), cap.token);
  const connection = runtime.connection({});
  assert.deepEqual(connection?.launch, { url: cap.url, headers: {} });
  assert.deepEqual([connection?.config.allowedToolNames, connection?.config.writeAllowedToolNames, [...(connection?.config.readOnlyRemoteNames ?? [])]],
    [["list_sites", "add_site_pointer", "reveal_site_folder"], ["add_site_pointer", "reveal_site_folder"], ["list_sites"]]);
  const exposed = JSON.stringify([connection, runtime.owned, runtime.accept(cap)], (_key, value: unknown) => (value instanceof Set ? [...value] : value));
  assert.doesNotMatch(exposed, /[a-f0-9]{64}/);
});

test("the environment object handed in is scrubbed of all three names, valid or not", () => {
  for (const env of [{ TOVU_DESKTOP_MCP_URL: cap.url, TOVU_DESKTOP_MCP_TOKEN: cap.token, TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff, KEEP: "1" },
    { TOVU_DESKTOP_MCP_URL: "https://elsewhere.example/mcp", TOVU_DESKTOP_MCP_TOKEN: "nope", TOVU_DESKTOP_MCP_HANDOFF_TOKEN: "short", KEEP: "1" }] as NodeJS.ProcessEnv[]) {
    createDesktopMcpRuntime({ env });
    assert.deepEqual(env, { KEEP: "1" });
  }
});

test("a later change to the delivered object or to the environment object cannot move the pin", async () => {
  const env: NodeJS.ProcessEnv = { TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff };
  const runtime = createDesktopMcpRuntime({ env });
  assert.equal(runtime.connection({}), null);
  assert.equal(await runtime.bearerToken({ url: cap.url }), undefined);
  const delivered: { url: string; token: string } = { ...cap };
  assert.equal(runtime.accept(delivered), true);
  Object.assign(delivered, other);
  Object.assign(env, { TOVU_DESKTOP_MCP_URL: other.url, TOVU_DESKTOP_MCP_TOKEN: other.token });
  assert.equal(runtime.connection({})?.launch.url, cap.url);
  assert.equal(await runtime.bearerToken({ url: cap.url }), cap.token);
  assert.equal(await runtime.bearerToken({ url: other.url }), undefined);
  assert.equal(runtime.accept(other), false);
  assert.equal(runtime.accept({ url: "http://localhost:4100/mcp", token: cap.token }), false);
});

test("a delivered object that answers differently on a later read pins only what the endpoint policy saw", async () => {
  const runtime = createDesktopMcpRuntime({ env: { TOVU_DESKTOP_MCP_HANDOFF_TOKEN: handoff } });
  let reads = 0;
  const shifting = { get url() { reads += 1; return reads === 1 ? cap.url : other.url; }, token: cap.token };
  assert.equal(runtime.accept(shifting), true);
  assert.equal(reads, 1, "the delivered URL is read once, then only the detached copy is used");
  assert.equal(runtime.connection({})?.launch.url, cap.url);
  assert.equal(await runtime.bearerToken({ url: other.url }), undefined);
});
