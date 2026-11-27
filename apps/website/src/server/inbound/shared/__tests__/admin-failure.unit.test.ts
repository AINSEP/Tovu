/**
 * @file Pure lifecycle pins for the shared admin failure path once a site reporter is bound: one
 * incident (one host record, one tracker report, one ERR ID shared with the reply), C115 first,
 * tracker skip only for a failure this request already admitted, and a contained reporter breach.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createNoopObservabilityPort, type ErrorReport } from "@jini-ai/core/contracts/observability";
import type { Tracker, TrackerErrorContext } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { UNAVAILABLE_ERROR_ID, type ErrorReporter, type RecordFailureOptions } from "@jini-ai/core/errors/reporter";
import { DatabaseDiskSpaceError } from "@jini-ai/db/sqlite";
import { createTracker, runWithErrorReportScope } from "@jini-ai/diagnostics/observability/node";
import { createTovuErrorReporter } from "#src/server/runtime/composition/error-reporter";
import { adminFailureResponse, reportServerFailure, sendAdminFailure } from "../admin-failure.js";
import type { Request, Response } from "express";
import { captureRouteError } from "../observability-middleware.js";
import { createRequestReportScope, wasAdmittedInRequest } from "../request-admissions.js";

const ERR_ID = /^ERR-[0-9a-f]{4}(?:-[0-9a-f]{4}){3}$/i;
const UNAVAILABLE = "ERR-0000-0000-0000-0000";

function recordingTracker(): { calls: Array<{ error: Error; context: TrackerErrorContext | undefined }>; tracker: Pick<Tracker, "error"> } {
  const calls: Array<{ error: Error; context: TrackerErrorContext | undefined }> = [];
  return { calls, tracker: { error: ({ error }, options) => { calls.push({ error, context: options?.context }); } } };
}

function recordingLogger(): { errors: unknown[][]; logger: { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void } } {
  const errors: unknown[][] = [];
  return { errors, logger: { warn: () => {}, error: (...args) => { errors.push(args); } } };
}

/** Records each `record` call and answers with a fixed ID, standing in for a reporter that already holds one. */
function fakeReporter({ errorId }: { errorId: string }): { calls: Array<{ required: unknown; optional: RecordFailureOptions | undefined }>; reporter: Pick<ErrorReporter, "record"> } {
  const calls: Array<{ required: unknown; optional: RecordFailureOptions | undefined }> = [];
  return { calls, reporter: { record: (required, optional) => { calls.push({ required, optional }); return { errorId }; } } };
}

function fakeResponse({ locals }: { locals: Record<string, unknown> }): { sent: { status?: number; body?: any }; res: Parameters<typeof sendAdminFailure>[0]["res"] } {
  const sent: { status?: number; body?: any } = {};
  return { sent, res: { locals, req: { method: "GET", route: { path: "/api/admin/v1/pages" } } as never, status: (status: number) => {
    sent.status = status;
    return { json: (body: unknown) => { sent.body = body; } };
  } } };
}

test("one admin failure writes one host record and one tracker report with the same ERR- id as the reply", t => {
  const consoleLines = t.mock.method(console, "error", () => {});
  const { calls, tracker } = recordingTracker();
  const { errors, logger } = recordingLogger();
  const real = createTovuErrorReporter({ logger, tracker, clock: { nowMs: () => Date.UTC(2026, 10, 25) }, versions: { app: "1.2.3", jini: "0.7.3" } });
  let records = 0;
  const reporter: Pick<ErrorReporter, "record"> = { record: (required, optional) => { records += 1; return real.record(required, optional); } };
  const { status, body } = adminFailureResponse({ error: new Error("PRIVATE_BACKEND failed"), reporter }, { operation: "pages:load" });
  assert.equal(status, 500);
  assert.match(body.errorId ?? "", ERR_ID);
  assert.equal(body.details?.failure.errorId, body.errorId);
  assert.match(body.error, new RegExp(body.errorId!));
  assert.equal(records, 1);
  assert.equal(errors.length, 1, "one host record");
  assert.ok(JSON.stringify(errors[0]).includes(body.errorId!));
  assert.equal(calls.length, 1, "one tracker report");
  assert.equal(calls[0]!.context?.attributes?.incidentId, body.errorId);
  assert.equal(consoleLines.mock.callCount(), 0, "reporter mode never writes the legacy console line");
  assert.equal(JSON.stringify(body).includes("PRIVATE_BACKEND"), false);
});

test("disk-space refusal reports nothing and carries no id", t => {
  const consoleLines = t.mock.method(console, "error", () => {});
  const { calls, reporter } = fakeReporter({ errorId: "ERR-1111-1111-1111-1111" });
  const error = new DatabaseDiskSpaceError({ freeBytes: 0, requiredBytes: 50 * 1024 * 1024 });
  const { status, body } = adminFailureResponse({ error, reporter }, { operation: "pages:save" });
  assert.equal(status, error.status);
  assert.deepEqual(body, { code: error.code, error: error.message });
  assert.equal(calls.length, 0);
  assert.equal(consoleLines.mock.callCount(), 0);
});

test("a failure already admitted in this request is recorded with tracker skip and keeps its id", () => {
  const scope = createRequestReportScope({});
  const error = new Error("tool failed");
  const tracker = createTracker({ observability: { ...createNoopObservabilityPort({}), reportError: (_report: ErrorReport) => {} } });
  runWithErrorReportScope({ scope, work: () => tracker.error({ error }) });
  const { calls, reporter } = fakeReporter({ errorId: "ERR-2222-2222-2222-2222" });
  const { sent, res } = fakeResponse({ locals: { principal: { id: "owner" }, adminFailureReportScope: scope, failureReporter: reporter } });
  sendAdminFailure({ res, error, reporter }, { operation: "tools:run" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.optional?.tracker, "skip");
  assert.equal(sent.status, 500);
  assert.equal(sent.body.errorId, "ERR-2222-2222-2222-2222");
  assert.equal(sent.body.details.failure.errorId, "ERR-2222-2222-2222-2222");
});

test("an unrelated earlier report in the request does not skip this failure's tracker report", () => {
  const scope = createRequestReportScope({});
  const tracker = createTracker({ observability: { ...createNoopObservabilityPort({}), reportError: (_report: ErrorReport) => {} } });
  runWithErrorReportScope({ scope, work: () => tracker.error({ error: new Error("earlier, unrelated") }) });
  assert.equal(scope.reported, true);
  const { calls, reporter } = fakeReporter({ errorId: "ERR-3333-3333-3333-3333" });
  const { res } = fakeResponse({ locals: { principal: { id: "owner" }, adminFailureReportScope: scope, failureReporter: reporter } });
  sendAdminFailure({ res, error: new Error("this failure"), reporter }, { operation: "pages:load" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.optional?.tracker, undefined);
});

test("one request recognizes admissions from distinct trackers without treating similar errors as the same failure", () => {
  const makeTracker = (reports: ErrorReport[]) => createTracker({
    observability: { ...createNoopObservabilityPort({}), reportError: report => { reports.push(report); } },
  });
  const firstReports: ErrorReport[] = [];
  const secondReports: ErrorReport[] = [];
  const first = makeTracker(firstReports);
  const second = makeTracker(secondReports);
  const scope = createRequestReportScope({});
  const one = new Error("load failed");
  const two = new Error("load failed");
  runWithErrorReportScope({ scope, work: () => {
    first.error({ error: one });
    second.error({ error: two });
  } });

  assert.deepEqual(firstReports.map(report => (report.error as Error).message), ["load failed"]);
  assert.deepEqual(secondReports.map(report => (report.error as Error).message), ["load failed"]);
  assert.equal(wasAdmittedInRequest({ scope, error: one }), true);
  assert.equal(wasAdmittedInRequest({ scope, error: two }), true);
  assert.equal(wasAdmittedInRequest({ scope, error: new Error("load failed") }), false);
  assert.equal(wasAdmittedInRequest({ scope, error: "load failed" }), false);
  assert.equal(wasAdmittedInRequest({ scope: createRequestReportScope({}), error: one }), false);
});

test("a throwing reporter answers with the unavailable id and writes no console line", t => {
  const consoleLines = t.mock.method(console, "error", () => {});
  const reporter: Pick<ErrorReporter, "record"> = { record: () => { throw new Error("reporter breach with PRIVATE_DETAIL"); } };
  const { body } = adminFailureResponse({ error: new Error("PRIVATE_BACKEND"), reporter }, { operation: "pages:load" });
  assert.equal(body.errorId, UNAVAILABLE);
  assert.equal(body.details?.failure.errorId, UNAVAILABLE);
  assert.match(body.details!.failure.copyText, new RegExp(`Error ID: ${UNAVAILABLE}`));
  assert.deepEqual(reportServerFailure({ error: new Error("x"), operation: "public:post" }, { reporter }), { errorId: UNAVAILABLE });
  assert.equal(consoleLines.mock.callCount(), 0);
  assert.equal(JSON.stringify(body).includes("PRIVATE"), false);
});

test("the recorded id wins over a competing approved-cause id in reply and Copy details", () => {
  const competing = "ERR-aaaa-aaaa-aaaa-aaaa";
  const recorded = "ERR-bbbb-bbbb-bbbb-bbbb";
  const { calls, reporter } = fakeReporter({ errorId: recorded });
  const failure = { action: "Export the site", step: "export:write", cause: `The export tool failed (error ${competing}).` };
  const { body } = adminFailureResponse({ error: new Error("export failed"), reporter }, { operation: "export:write", failure });
  assert.equal(calls[0]!.optional?.errorId, competing, "the approved cause's ID is offered to the record first");
  assert.equal(body.errorId, recorded);
  assert.equal(body.details?.failure.errorId, recorded);
  assert.match(body.error, new RegExp(recorded));
  assert.match(body.details!.failure.copyText, new RegExp(`Error ID: ${recorded}`));
  assert.equal(JSON.stringify(body).includes(competing), false);
});

test("an approved-cause id the reporter accepts stays the one id", () => {
  const causeId = "ERR-cccc-cccc-cccc-cccc";
  const { reporter } = fakeReporter({ errorId: causeId });
  const failure = { action: "Export the site", step: "export:write", cause: `The export tool failed (error ${causeId}).` };
  const { body } = adminFailureResponse({ error: new Error("export failed"), reporter }, { operation: "export:write", failure });
  assert.equal(body.errorId, causeId);
  assert.match(body.details!.failure.cause, new RegExp(causeId));
});

test("an unbound admin request returns an unavailable reference and one wiring diagnostic", t => {
  const consoleLines = t.mock.method(console, "error", () => {});
  const { calls, tracker } = recordingTracker();
  const { sent, res } = fakeResponse({ locals: { adminFailureTracker: tracker } });
  captureRouteError(new Error("PRIVATE_UNBOUND_CANARY"), { path: "/api/admin/v1/pages" } as Request, res as Response, () => assert.fail("the failure must be answered"));
  assert.equal(sent.status, 500);
  assert.equal(sent.body.errorId, UNAVAILABLE_ERROR_ID);
  assert.equal(consoleLines.mock.callCount(), 1);
  assert.deepEqual(consoleLines.mock.calls[0]!.arguments, ["[admin-failure] reporter unavailable", { operation: "admin-route.uncaught" }]);
  assert.equal(JSON.stringify({ body: sent.body, diagnostic: consoleLines.mock.calls[0]!.arguments }).includes("PRIVATE_UNBOUND_CANARY"), false);
  assert.equal(calls.length, 0);
});
