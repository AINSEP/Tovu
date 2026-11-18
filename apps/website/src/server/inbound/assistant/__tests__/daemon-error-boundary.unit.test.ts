import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { createDaemonErrorBoundary } from "../daemon-error-boundary.js";

const ERROR_ID = "ERR-AAAA-BBBB-CCCC-DDDD";

function fakeResponse({ headersSent = false }: { headersSent?: boolean } = {}) {
  const sent: { status?: number; body?: unknown } = {};
  const res = { headersSent, status(value: number) { sent.status = value; return res; }, json(body: unknown) { sent.body = body; return res; } };
  return { res: res as unknown as Response, sent };
}

function run({ error, headersSent, onInternalError = () => {} }: { error: unknown; headersSent?: boolean; onInternalError?: (required: { error: unknown; errorId: string }) => void }) {
  const { res, sent } = fakeResponse({ headersSent });
  const forwarded: unknown[] = [];
  createDaemonErrorBoundary({ mintErrorId: () => ERROR_ID, onInternalError }, {})(error, {} as Request, res, ((e?: unknown) => { forwarded.push(e); }) as NextFunction);
  return { sent, forwarded };
}

test("an exception answers a JSON 500 with fixed words and the error ID, and the sink gets the original once with that ID", () => {
  const error = new Error("PRIVATE-CANARY /home/owner/site/secret-draft.md");
  const records: Array<{ error: unknown; errorId: string }> = [];
  const { sent } = run({ error, onInternalError: record => { records.push(record); } });
  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, { error: { code: "INTERNAL_ERROR", message: "The tool service hit an internal problem before the tool ran. Do not retry the same call; give the user the error ID.", requestId: ERROR_ID } });
  assert.ok(!JSON.stringify(sent.body).includes("PRIVATE-CANARY"));
  assert.deepEqual(records, [{ error, errorId: ERROR_ID }]);
});

test("a body over the parser limit answers 413 PAYLOAD_TOO_LARGE with no incident", () => {
  let incidents = 0;
  const { sent } = run({ error: Object.assign(new Error("request entity too large"), { status: 413, type: "entity.too.large" }), onInternalError: () => { incidents += 1; } });
  assert.equal(sent.status, 413);
  assert.deepEqual(sent.body, { error: { code: "PAYLOAD_TOO_LARGE", message: "This tool call's input is larger than 6 MB. Send less content per call." } });
  assert.equal(incidents, 0);
});

test("malformed JSON answers 400 BAD_REQUEST with no incident", () => {
  let incidents = 0;
  const { sent } = run({ error: Object.assign(new SyntaxError("Unexpected token"), { status: 400, type: "entity.parse.failed" }), onInternalError: () => { incidents += 1; } });
  assert.equal(sent.status, 400);
  assert.deepEqual(sent.body, { error: { code: "BAD_REQUEST", message: "The request body was not valid JSON." } });
  assert.equal(incidents, 0);
});

test("once headers are sent the error goes to the next handler and nothing is written", () => {
  const error = new Error("stream failed midway");
  let incidents = 0;
  const { sent, forwarded } = run({ error, headersSent: true, onInternalError: () => { incidents += 1; } });
  assert.deepEqual(sent, {});
  assert.deepEqual(forwarded, [error]);
  assert.equal(incidents, 0);
});

test("a throwing sink never replaces the answer, and one line carries the ID and the sink's failure class", t => {
  const lines: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { lines.push(args); });
  const { sent } = run({ error: new Error("boom"), onInternalError: () => { throw new TypeError("sink is down: secret-value"); } });
  assert.equal(sent.status, 500);
  assert.equal((sent.body as { error: { requestId: string } }).error.requestId, ERROR_ID);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]![0], `[daemon:app-boundary] error ${ERROR_ID}: the incident sink failed (TypeError)`);
});

test("a thrown non-Error still answers the 500 envelope", () => {
  const { sent } = run({ error: "just a string" });
  assert.equal(sent.status, 500);
});
