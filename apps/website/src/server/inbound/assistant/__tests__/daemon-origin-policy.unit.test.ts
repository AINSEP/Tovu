/**
 * The agent daemon's same-origin policy treats two browser-facing ports as local: its own listener
 * and the website origin's port. Under a parent host that website port is the RESOLVED listener the
 * parent pinned (`TOVU_SITE_LISTENER_ORIGIN`), which can differ from a raw `PORT` (auto-port, a CLI
 * flag). A standalone daemon has no parent, so the old `JINI_WEB_PORT` input still applies.
 *
 * Named mutation: `read-origin-port-from-raw-env` (inject `env.PORT` instead of the resolved
 * listener's port) turns the first test red.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDaemonOriginPolicy } from "../daemon-origin-policy.js";

const DAEMON_PORT = 4319;

function allows({ env, port }: { env: NodeJS.ProcessEnv; port: number }): boolean {
  const policy = createDaemonOriginPolicy({ port: DAEMON_PORT, env });
  return policy.isSameOrigin({ req: { headers: { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` } } });
}

test("the daemon origin policy trusts the resolved website listener port, not a raw PORT", () => {
  const env = { PORT: "3000", TOVU_SITE_LISTENER_ORIGIN: "http://localhost:4123" };
  assert.equal(allows({ env, port: 4123 }), true, "the resolved website listener origin is local");
  assert.equal(allows({ env, port: 3000 }), false, "a raw PORT the website did not bind is not local");
  assert.equal(allows({ env, port: DAEMON_PORT }), true, "the daemon's own listener stays local");
});

test("the resolved listener wins over the old input, which a standalone daemon still honors", () => {
  assert.equal(allows({ env: { JINI_WEB_PORT: "5173" }, port: 5173 }), true, "standalone keeps JINI_WEB_PORT");
  assert.equal(allows({ env: { JINI_WEB_PORT: "5173" }, port: 4123 }), false);
  const hosted = { JINI_WEB_PORT: "5173", TOVU_SITE_LISTENER_ORIGIN: "http://127.0.0.1:4123" };
  assert.equal(allows({ env: hosted, port: 4123 }), true);
  assert.equal(allows({ env: hosted, port: 5173 }), false, "a hosted daemon's website port is the resolved one");
});

test("the injected port changes only the website port, not allowed origins or the bind host", () => {
  const env = { TOVU_SITE_LISTENER_ORIGIN: "http://localhost:4123", JINI_ALLOWED_ORIGINS: "https://proxy.example" };
  const policy = createDaemonOriginPolicy({ port: DAEMON_PORT, env });
  assert.equal(policy.isSameOrigin({ req: { headers: { host: "10.0.0.5:9000", origin: "https://proxy.example" } } }), true);
  assert.equal(policy.isSameOrigin({ req: { headers: { host: "10.0.0.5:9000", origin: "https://other.example" } } }), false);
});
