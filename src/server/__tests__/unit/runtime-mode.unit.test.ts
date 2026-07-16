import assert from "node:assert/strict";
import test from "node:test";

import { resolveRuntimeMode } from "../../runtime-mode";

/**
 * @file SPEC-022 C-001 — runtime-mode signal resolution (REQ-02, INV-02, INV-04, EC-02).
 *
 * behavior.spec.md §1.1: the dedicated TOVU_RUNTIME_MODE signal is the only source ever
 * consulted; NODE_ENV is never a fallback or an inference source, in either direction.
 */

test("REQ-02/AC-04: explicit TOVU_RUNTIME_MODE=production resolves production regardless of NODE_ENV", () => {
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "production", NODE_ENV: "development" } }), "production");
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "production", NODE_ENV: "test" } }), "production");
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "production" } }), "production");
});

test("REQ-02/AC-03/INV-02: NODE_ENV=production alone (signal unset) resolves local, never production", () => {
  assert.equal(resolveRuntimeMode({ env: { NODE_ENV: "production" } }), "local");
  assert.equal(resolveRuntimeMode({ env: {} }), "local");
  assert.equal(resolveRuntimeMode({ env: undefined }), "local");
});

test("INV-04/EC-02: an unrecognized TOVU_RUNTIME_MODE value resolves local, not production", () => {
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "PRODUCTION" } }), "local");
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "prod" } }), "local");
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "" } }), "local");
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "yes" } }), "local");
});

test("explicit TOVU_RUNTIME_MODE=local resolves local", () => {
  assert.equal(resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "local" } }), "local");
});

test("default (no options argument) reads the real process.env without throwing", () => {
  const result = resolveRuntimeMode();
  assert.ok(result === "production" || result === "local");
});
