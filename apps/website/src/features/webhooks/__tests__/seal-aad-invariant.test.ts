import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  // direction to fail in. Only the two exact, documented non-secret calls are exempted.
  const src = `envelope.seal({ contents: x });`;
  const violations = findSealCallsInSource(src, "fixture.ts");
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, "missing-aad");
});

for (const { file, receiver, call } of [
  { file: "apps/website/src/features/plugin-runtime/source-tools.ts", receiver: "port", call: "port.seal({ id: pluginId }, {})" },
  { file: "apps/website/src/server/runtime/composition/plugin-runtime.ts", receiver: "capture", call: "capture.seal({ sdk: scopedSdk })" },
]) {
  test(`the documented non-secret ${receiver}.seal call is exempt only in ${file}`, () => {
    assert.deepEqual(findSealCallsInSource(`${call};`, file), []);
    assert.deepEqual(findSealCallsInSource(`${call};`, "fixture.ts").map(({ text, reason }) => ({ text, reason })), [
      { text: call, reason: receiver === "port" ? "unresolved-argument-shape" : "missing-aad" },
    ]);
    const otherReceiver = call.replace(receiver, "other");
    assert.deepEqual(findSealCallsInSource(`${otherReceiver};`, file).map(({ text, reason }) => ({ text, reason })), [
      { text: otherReceiver, reason: receiver === "port" ? "unresolved-argument-shape" : "missing-aad" },
    ]);
  });

  test(`secret seals in ${file} still fail closed, including on receiver ${receiver}`, () => {
    const src = `
      import type { SecretSealerPort } from "@jini-ai/integrations/webhooks";
      declare const ${receiver}: SecretSealerPort;
      ${receiver}.seal({ plaintext: token, key });
      ${receiver}.seal(secretInput);
      deps.sealer.seal({ plaintext: token, key });
    `;
    assert.deepEqual(findSealCallsInSource(src, file).map(({ text, reason }) => ({ text, reason })), [
      { text: `${receiver}.seal({ plaintext: token, key })`, reason: "missing-aad" },
      { text: `${receiver}.seal(secretInput)`, reason: "unresolved-argument-shape" },
      { text: "deps.sealer.seal({ plaintext: token, key })", reason: "missing-aad" },
    ]);
  });
}

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

test("filesystem scan ignores node_modules and dist but reports a violation outside them", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-seal-exclusions-"));
  try {
    for (const directory of ["node_modules", "dist"]) {
      fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, directory, "credential.ts"), "deps.sealer.seal({ plaintext });\n");
    }
    assert.deepEqual(findSealCallsWithoutAad(root), []);

    const fixture = path.join(root, "credential.ts");
    fs.writeFileSync(fixture, "deps.sealer.seal({ plaintext });\n");
    const repoRoot = path.resolve(import.meta.dirname, "../../../../../..");
    assert.deepEqual(findSealCallsWithoutAad(root), [{
      file: path.relative(repoRoot, fixture),
      line: 1,
      reason: "missing-aad",
      text: "deps.sealer.seal({ plaintext })",
    }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the CLI exits successfully and prints OK when the real repository has no seal violations", () => {
  const cli = fileURLToPath(new URL("../seal-aad-invariant.ts", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", cli], {
    cwd: path.resolve(import.meta.dirname, "../../../../../.."),
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "check:seal-aad — OK: every SecretSealerPort.seal() call site under apps/website/src supplies aad.\n");
  assert.equal(result.stderr, "");
});

test("filesystem scan and CLI report a known violating file with a nonzero exit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-seal-scan-"));
  const fixture = "credential-violation.ts";
  try {
    fs.writeFileSync(path.join(root, fixture), "// fixture\ndeps.sealer.seal({ plaintext: token, key });\n");
    const violations = findSealCallsWithoutAad(root);
    assert.deepEqual(violations, [{ file: path.relative(process.cwd(), path.join(root, fixture)), line: 2, reason: "missing-aad", text: "deps.sealer.seal({ plaintext: token, key })" }]);
    const cli = fileURLToPath(new URL("../seal-aad-invariant.ts", import.meta.url));
    const scanRoot = path.resolve(import.meta.dirname, "../../..");
    // Redirect only the CLI's filesystem boundary to our real temp fixture. The entry guard,
    // default scan root, parser, diagnostics and exit handling all run unchanged.
    const script = `
      import fs from "node:fs";
      import { pathToFileURL } from "node:url";
      const readdir = fs.readdirSync.bind(fs);
      const read = fs.readFileSync.bind(fs);
      fs.readdirSync = (dir, options) => readdir(dir === ${JSON.stringify(scanRoot)} ? ${JSON.stringify(root)} : dir, options);
      fs.readFileSync = (file, options) => read(file === ${JSON.stringify(path.join(scanRoot, fixture))} ? ${JSON.stringify(path.join(root, fixture))} : file, options);
      process.argv[1] = ${JSON.stringify(cli)};
      await import(pathToFileURL(process.argv[1]).href);
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /credential-violation\.ts:2 \[missing-aad\]/);
    assert.doesNotMatch(result.stdout, /OK/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a quoted or computed 'aad' key is not recognised as aad, so the call fails closed as missing-aad", () => {
  for (const src of [`sealer.seal({ "aad": rowAad, plaintext });`, `sealer.seal({ ["aad"]: rowAad, plaintext });`]) {
    const violations = findSealCallsInSource(src, "fixture.ts");
    assert.deepEqual(violations.map(v => v.reason), ["missing-aad"], src);
  }
});

test("a .tsx display path is parsed as TSX, so JSX around a seal() call does not hide it", () => {
  const src = `export const View = () => <div onClick={() => sealer.seal({ plaintext })}>x</div>;`;
  assert.deepEqual(findSealCallsInSource(src, "fixture.tsx").map(v => v.reason), ["missing-aad"]);
});
