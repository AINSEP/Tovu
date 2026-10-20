/**
 * @file Phase-C unit tests for the pure helpers of `agent-plugin-connections.ts`: which runtime
 * the API connections sign in as (desktop only under Electron's own Node) and which origin the
 * hosted callback is built on (an operator `TOVU_PUBLIC_URL` that is a real http(s) URL wins; a
 * malformed or non-http(s) one counts as unset; an empty derived origin is none).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { apiConnectionPublicOrigin, resolveApiConnectionRuntime } from "../agent-plugin-connections.js";

test("runtime: desktop only when the shell runs this server as Electron's own Node", () => {
  assert.equal(resolveApiConnectionRuntime({ env: { ELECTRON_RUN_AS_NODE: "1" } }), "desktop");
  assert.equal(resolveApiConnectionRuntime({ env: { ELECTRON_RUN_AS_NODE: "true" } }), "hosted");
  assert.equal(resolveApiConnectionRuntime({ env: {} }), "hosted");
});

test("public origin: an operator https or http TOVU_PUBLIC_URL wins over the derived origin, reduced to its origin", () => {
  assert.equal(apiConnectionPublicOrigin({ env: { TOVU_PUBLIC_URL: " https://site.example/admin?x=1 " }, derivedPublicOrigin: "http://127.0.0.1:4000" }), "https://site.example");
  assert.equal(apiConnectionPublicOrigin({ env: { TOVU_PUBLIC_URL: "http://intranet.test:8080" }, derivedPublicOrigin: "http://127.0.0.1:4000" }), "http://intranet.test:8080");
});

test("public origin: a malformed or non-http(s) TOVU_PUBLIC_URL counts as unset", () => {
  for (const configured of ["not a url", "ftp://files.example", "javascript:alert(1)", "   "]) {
    assert.equal(apiConnectionPublicOrigin({ env: { TOVU_PUBLIC_URL: configured }, derivedPublicOrigin: "http://127.0.0.1:4000" }), "http://127.0.0.1:4000", configured);
  }
});

test("public origin: with nothing configured and no (or an empty) derived origin there is none", () => {
  assert.equal(apiConnectionPublicOrigin({ env: {}, derivedPublicOrigin: undefined }), undefined);
  assert.equal(apiConnectionPublicOrigin({ env: {}, derivedPublicOrigin: "" }), undefined);
});
