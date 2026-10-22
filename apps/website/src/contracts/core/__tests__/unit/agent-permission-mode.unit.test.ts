import assert from "node:assert/strict";
import test from "node:test";
import { resolveAgentPermissionMode } from "../../agent-permission-mode.js";

test("a fresh local env with no overrides bypasses the unanswerable permission prompt", () => {
  assert.equal(resolveAgentPermissionMode({ env: {} }), "bypass");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_RUNTIME_MODE: "local" } }, {}), "bypass");
});

test("production runtime mode stays restricted with or without a bypass override", () => {
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_RUNTIME_MODE: "production" } }), "restricted");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_RUNTIME_MODE: "production", TOVU_AGENT_PERMISSION_MODE: "bypass" } }), "restricted");
});

for (const env of [{ TOVU_HOSTED: "1" }, { TOVU_PUBLIC_URL: "https://demo.tovu.dev/" }]) {
  test(`hosted runtime ${Object.keys(env)[0]} ignores a bypass override`, () => {
    assert.equal(resolveAgentPermissionMode({ env: { ...env, TOVU_AGENT_PERMISSION_MODE: "bypass" } }), "restricted");
  });
}

test("locally an explicit override wins in either direction", () => {
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: "restricted" } }), "restricted");
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: "bypass" } }), "bypass");
});

test("an unrecognised override value falls back to the local default", () => {
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: "yolo" } }), "bypass");
});


test("a declared platform restriction overrides a bypass request independently of hosted-install facts", () => {
  assert.equal(resolveAgentPermissionMode({ env: { TOVU_AGENT_PERMISSION_MODE: "bypass" } }, {
    hostSignals: { hosted: false, nativeToolsRestricted: true, labels: [] },
  }), "restricted");
});
