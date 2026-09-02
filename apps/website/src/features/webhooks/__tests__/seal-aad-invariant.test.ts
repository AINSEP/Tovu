import assert from "node:assert/strict";
import test from "node:test";

import { findSealCallsInSource, findSealCallsWithoutAad } from "../seal-aad-invariant.js";

/**
 * @file Two things, matching `check-theme-replaced-elements.test.ts`'s own split:
 *
 *  1. Parser-shape unit tests against synthetic source text — including the exact multiline shape
 *     (`connector-credential-store.ts`'s `sealCredentials` helper) that made a one-line grep
 *     undercount AAD call sites earlier in this effort, and the fail-closed "can't tell" shapes.
 *
 *  2. A REAL regression test against the actual `apps/website/src` tree, proving all 11 current
 *     `SecretSealerPort.seal()` call sites are clean today, and that this check genuinely goes RED
 *     if a call site regresses — verified by hand: temporarily adding a `sealer.seal({ plaintext,
 *     key })` call with no `aad` to a scratch file under `apps/website/src` and re-running this
 *     exact test failed with a `missing-aad` violation naming that file, before the file was
 *     deleted. See this task's handoff for the pasted before/after run output; this test's job is
 *     to keep failing that way forever, not to re-prove it once by hand.
 */

test("a call with aad as a plain property is compliant", () => {
  const src = `deps.sealer.seal({ plaintext: apiKey, key: activeKey, aad });`;
  assert.deepEqual(findSealCallsInSource(src, "fixture.ts"), []);
});

test("a call with aad built from a helper call is compliant", () => {
  const src = `deps.sealer.seal({ plaintext: apiKey, key: activeKey, aad: buildConnectorCredentialAad(x) });`;
  assert.deepEqual(findSealCallsInSource(src, "fixture.ts"), []);
});

test("a call with no aad property at all is a missing-aad violation", () => {
  const src = `deps.sealer.seal({ plaintext: apiKey, key: activeKey });`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "missing-aad");
  assert.equal(violations[0].line, 1);
});

test("MULTILINE call with no aad is still caught — the exact shape a single-line grep missed", () => {
  // This is connector-credential-store.ts's real sealCredentials() shape, aad property removed.
  const src = `
    const sealCredentials = async (connectorId, credentials) =>
      deps.sealer.seal({
        plaintext: JSON.stringify(credentials),
        key: await deps.keyring.activeKey(),
      });
  `;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "missing-aad");
});

test("MULTILINE call WITH aad (the real shape after the fix) is compliant", () => {
  const src = `
    const sealCredentials = async (connectorId, credentials) =>
      deps.sealer.seal({
        plaintext: JSON.stringify(credentials),
        key: await deps.keyring.activeKey(),
        aad: buildConnectorCredentialAad({ workspaceId: deps.workspaceId, connectorId }),
      });
  `;
  assert.deepEqual(findSealCallsInSource(src, "fixture.ts"), []);
});

test("aad explicitly set to the literal `undefined` is a violation, not a pass", () => {
  const src = `deps.sealer.seal({ plaintext: apiKey, key: activeKey, aad: undefined });`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "aad-literally-undefined");
});

test("a spread argument is fail-closed as unresolved, not silently passed", () => {
  const src = `deps.sealer.seal({ ...buildSealInput(x), key: activeKey });`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "unresolved-argument-shape");
});

test("a pre-built variable argument is fail-closed as unresolved, not silently passed", () => {
  const src = `deps.sealer.seal(sealInput);`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "unresolved-argument-shape");
});

test("an unrelated .seal( on some other object is still scanned (name-based, not type-resolved) — documented trade-off", () => {
  // Deliberately demonstrates the false-positive direction this scan accepts in exchange for not
  // needing a full type-checked ts.Program — see this file's own header for why that's the safe
  // direction to fail in. No such call exists in apps/website/src today (verified by grep).
  const src = `envelope.seal({ contents: x });`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "missing-aad");
});

test("a .open( call is never flagged — this invariant only covers seal()", () => {
  const src = `deps.sealer.open({ sealed: record.sealed });`;
  assert.deepEqual(findSealCallsInSource(src, "fixture.ts"), []);
});

test("REGRESSION: every real SecretSealerPort.seal() call site under apps/website/src supplies aad today", () => {
  const violations = findSealCallsWithoutAad();
  assert.deepEqual(
    violations,
    [],
    `expected zero seal() call sites without aad, got: ${JSON.stringify(violations, null, 2)}`,
  );
});
