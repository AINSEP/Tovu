/** visitorsafe: fixed public text, log correlation, and exact-secret redaction through DI. */
import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets } from "@jini-ai/core";
import { createSiteAssistantErrorReporter, type SiteAssistantErrorLogEntry } from "../public-errors.js";

test("visitorsafe: every diagnostic maps to fixed visitor text and a matching redacted log id", () => {
  const logs: SiteAssistantErrorLogEntry[] = [];
  let counter = 0;
  const report = createSiteAssistantErrorReporter({
    ids: { newId: () => "error-" + ++counter }, log: entry => logs.push(entry), redact: redactSecrets,
  });
  const diagnostic = new Error("Gemini model-private project-quota exhausted; key plain-test-key");
  diagnostic.stack = diagnostic.message + "\nfull operator stack";
  const error = report({ code: "provider_error", diagnostic }, { exactSecrets: ["plain-test-key"] });
  assert.equal(error.code, "provider_error");
  assert.equal(error.errorId, "error-1");
  assert.equal(error.message, "The assistant couldn't answer right now. Please try again. (error error-1)");
  assert.doesNotMatch(JSON.stringify(error), /Gemini|model-private|project-quota|plain-test-key|stack/);
  assert.deepEqual(logs, [{
    code: error.code, errorId: error.errorId,
    diagnostic: "Gemini model-private project-quota exhausted; key [REDACTED:exact_secret]\nfull operator stack",
  }]);
  for (const code of ["NOT_CONFIGURED", "PROVIDER_UNSUPPORTED", "MODEL_NOT_CONFIGURED", "NOT_IMPLEMENTED", "unavailable", "unknown", "constructor"]) {
    const result = report({ code, diagnostic: "private provider configuration" });
    assert.match(result.message, /^The assistant couldn't answer right now/);
    assert.ok(result.message.includes(result.errorId));
    assert.equal(logs.at(-1)?.errorId, result.errorId);
  }
});

test("visitorsafe: rate, message-length, body-length and validation errors keep friendly fixed text", () => {
  const report = createSiteAssistantErrorReporter({
    ids: { newId: () => "lookup-id" }, log: () => {}, redact: redactSecrets,
  });
  for (const [code, expected] of [
    ["RATE_LIMIT_EXCEEDED", /wait before trying again/],
    ["TOO_LARGE", /message is too long/],
    ["PAYLOAD_TOO_LARGE", /chat history are too long/],
    ["VALIDATION", /enter a message/],
  ] as const) {
    const result = report({ code, diagnostic: "private diagnostic" });
    assert.match(result.message, expected);
    assert.match(result.message, /lookup-id/);
    assert.doesNotMatch(result.message, /private diagnostic/);
  }
});

test("visitorsafe: raw and circular diagnostics stay operator-only without truncation", () => {
  const logs: SiteAssistantErrorLogEntry[] = [];
  const report = createSiteAssistantErrorReporter({
    ids: { newId: () => "lookup-id" }, log: entry => logs.push(entry), redact: redactSecrets,
  });
  const circular: { reason: string; self?: unknown } = { reason: "full operator reason" };
  circular.self = circular;
  for (const diagnostic of [undefined, null, { detail: "operator-only" }, circular]) {
    const error = report({ code: "unavailable", diagnostic });
    assert.doesNotMatch(error.message, /operator-only|full operator reason|Circular/);
    assert.ok(logs.at(-1)?.diagnostic);
  }
  assert.match(logs.at(-1)!.diagnostic, /full operator reason/);
  assert.match(logs.at(-1)!.diagnostic, /Circular/);
});

test("visitorsafe: an Error without a stack still logs its message for operators", () => {
  const logs: SiteAssistantErrorLogEntry[] = [];
  const report = createSiteAssistantErrorReporter({ ids: { newId: () => "error-nostack" }, log: entry => logs.push(entry), redact: redactSecrets });
  const diagnostic = new Error("upstream refused the request");
  diagnostic.stack = undefined;
  const error = report({ code: "provider_error", diagnostic });
  assert.equal(error.errorId, "error-nostack");
  assert.deepEqual(logs, [{ code: "provider_error", errorId: "error-nostack", diagnostic: "upstream refused the request" }]);
});
